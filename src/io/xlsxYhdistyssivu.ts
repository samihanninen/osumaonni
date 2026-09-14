import type { Workbook, Worksheet } from 'exceljs'
import type { Kisa } from '@/types/kisa'
import { RESUL_TASATULOKSEN_RATKAISIJA } from '@/core/kokonaiskilpailu'
import { TARKAN_TULKKAUKSEN_RAJA } from '@/core/sijoitukset'
import { onJoukkuekilpailu } from '@/core/yhdistykset'
import {
  ENSIMMAINEN_DATARIVI,
  YHDISTYKSET_VALILEHTI,
  sarakeAlue,
  sivuViite,
  solu,
} from './xlsxAsettelu'
import type { LajiKonteksti, SijoitusApuri } from './xlsxSijoitussivu'
import { tyylitaOhje, tyylitaOtsikko, tyylitaValiotsikko } from './xlsxTyylit'

/**
 * Yhdistys- ja kokonaiskilpailu elävänä näkymänä.
 *
 * Sama pulma kuin sijoitussivulla, mutta vaikeampi: rivien järjestyksen lisäksi myös
 * **rivien joukko** on dynaaminen. Yhdistysten ja kilpailijoiden lista syntyy tuloskortin
 * soluista, eikä kaava voi kasvattaa taulukkoa. Ratkaisu on kaksivaiheinen:
 *
 * 1. Ehdokaslohko: yksi rivi jokaista (laji, tuloskortin rivi) -paria kohti. Juokseva
 *    laskuri numeroi eri arvot esiintymisjärjestyksessä, jolloin `MATCH` löytää n:nnen
 *    eri yhdistyksen tai kilpailijan ilman taulukkokaavoja.
 * 2. Koostelohko: yksi rivi jokaista eri yhdistystä tai kilpailijaa kohti. Tässä
 *    lasketaan pisteet, sijaluku ja yksikäsitteinen järjestysnumero.
 *
 * Näkyvä taulukko poimii rivit järjestysnumerolla, kuten sijoitussivullakin. Taulukot
 * ovat kiinteän korkuisia, joten mukana on varapaikkoja ja lohkon alla varoitus siltä
 * varalta, että rivejä tulee enemmän kuin mahtuu — kukaan ei katoa hiljaisesti.
 *
 * Rajoite: COUNTIF-ehto tulkitsee `*` ja `?` jokerimerkkeinä myös silloin, kun ehto
 * tulee solusta. Yhdistyksen nimi tai kilpailijan nimi, jossa on tähti, voisi siis
 * ryhmittyä väärin. Sovelluksen oma laskenta ei kärsi tästä, ja tuonti korjaa tilanteen.
 */

/** Varapaikkoja yhdistystaulukossa nimien korjaamista ja uusia yhdistyksiä varten. */
const VARA_YHDISTYS = 5

/** Kokonaiskilpailun ratkaisijalajin arvo, kun lajia ei ole ammuttu tai sitä ei ole. */
const EI_RATKAISIJAA = -1

interface YhdistysApuri {
  nimi: string
  /** Lajikohtaiset pisteet lajien järjestyksessä. */
  lajipisteet: number[]
  /** Lajikohtainen ampujamäärä. */
  ampujia: number[]
  yht: number
  sija: number
  jarj: number
  /** Sijaluku yhden lajin taulukossa; '' jos yhdistyksellä ei ole ampujia siinä lajissa. */
  lajiSija: (number | '')[]
  lajiJarj: (number | '')[]
  /** "Sukunimi pisteet, …" huomioiduista ampujista. */
  huomioidut: string[]
}

interface HenkiloApuri {
  avain: string
  sukunimi: string
  etunimi: string
  yhdistys: string
  /** Lajikohtaiset pisteet; '' jos lajia ei ole ammuttu. */
  lajipisteet: (number | '')[]
  yht: number
  lajeja: number
  ratk: number
  sija: number
  jarj: number
}

interface Ehdokas {
  laji: LajiKonteksti
  /** Rivi lajin tuloskortissa ja sijoitussivun apulohkossa. */
  rivi: number
  apu: SijoitusApuri | undefined
}

/** Ehdokaslohkon kolme saraketta. */
interface EhdokasSarakkeet {
  arvo: number
  nro: number
  eka: number
}

/** Kaikki (laji, rivi) -parit siinä järjestyksessä, jossa ehdokaslohko ne luettelee. */
function ehdokkaat(lajit: LajiKonteksti[]): Ehdokas[] {
  const rivit: Ehdokas[] = []
  for (const laji of lajit) {
    for (let d = 0; d < laji.riveja; d++) {
      rivit.push({ laji, rivi: ENSIMMAINEN_DATARIVI + d, apu: laji.apurit[d] })
    }
  }
  return rivit
}

/** Eri arvot esiintymisjärjestyksessä — sama järjestys kuin juoksevalla laskurilla. */
function eriArvot(arvot: string[]): string[] {
  const nahdyt = new Set<string>()
  const tulos: string[] = []
  for (const arvo of arvot) {
    if (arvo === '' || nahdyt.has(arvo)) continue
    nahdyt.add(arvo)
    tulos.push(arvo)
  }
  return tulos
}

/** Laskee samat arvot kuin yhdistyssivun kaavat. */
function koosteApurit(lajit: LajiKonteksti[], parhaita: number, ratkaisija: number) {
  const kaikki = ehdokkaat(lajit)

  // --- Yhdistykset ---
  const huomioidutLajissa = (L: LajiKonteksti, nimi: string) =>
    L.apurit
      .map((apu, i) => ({ apu, i }))
      .filter((e) => e.apu.yhdistys === nimi && e.apu.yhdSija !== '' && e.apu.yhdSija <= parhaita)
      .sort((x, y) => Number(x.apu.yhdSija) - Number(y.apu.yhdSija))

  const yhdistykset: YhdistysApuri[] = eriArvot(kaikki.map((e) => e.apu?.yhdistys ?? '')).map(
    (nimi) => {
      const lajipisteet = lajit.map((L) =>
        huomioidutLajissa(L, nimi).reduce((s, e) => s + Number(e.apu.tulos || 0), 0),
      )
      return {
        nimi,
        lajipisteet,
        ampujia: lajit.map((L) => L.apurit.filter((a) => a.yhdistys === nimi).length),
        yht: lajipisteet.reduce((s, p) => s + p, 0),
        sija: 0,
        jarj: 0,
        lajiSija: lajit.map(() => ''),
        lajiJarj: lajit.map(() => ''),
        huomioidut: lajit.map((L) =>
          huomioidutLajissa(L, nimi)
            .map((e) => `${L.osallistujat[e.i]?.sukunimi ?? ''} ${e.apu.tulos}`)
            .join(', '),
        ),
      }
    },
  )

  yhdistykset.forEach((y, i) => {
    const parempia = yhdistykset.filter((m) => m.yht > y.yht).length
    const ennen = yhdistykset.filter((m, j) => m.yht === y.yht && j < i).length
    y.sija = parempia + 1
    y.jarj = parempia + ennen + 1
  })

  lajit.forEach((_, j) => {
    const mukana = yhdistykset.filter((y) => (y.ampujia[j] ?? 0) > 0)
    mukana.forEach((y, i) => {
      const omat = y.lajipisteet[j] ?? 0
      const parempia = mukana.filter((m) => (m.lajipisteet[j] ?? 0) > omat).length
      const ennen = mukana.filter((m, n) => (m.lajipisteet[j] ?? 0) === omat && n < i).length
      y.lajiSija[j] = parempia + 1
      y.lajiJarj[j] = parempia + ennen + 1
    })
  })

  // --- Kokonaiskilpailu ---
  const henkilot: HenkiloApuri[] = eriArvot(kaikki.map((e) => e.apu?.hloAvain ?? '')).map(
    (avain) => {
      const kohdat = lajit.map((L) => L.apurit.findIndex((a) => a.hloAvain === avain))
      const lajipisteet = lajit.map((L, j) => {
        const i = kohdat[j]!
        return i < 0 ? ('' as number | '') : L.apurit[i]!.hloPisteet
      })
      const ekaLaji = kohdat.findIndex((i) => i >= 0)
      const k = lajit[ekaLaji]?.osallistujat[kohdat[ekaLaji]!]
      const ratkPisteet = ratkaisija < 0 ? '' : lajipisteet[ratkaisija]
      return {
        avain,
        sukunimi: k?.sukunimi ?? '',
        etunimi: k?.etunimi ?? '',
        yhdistys: k?.yhdistys ?? '',
        lajipisteet,
        yht: lajipisteet.reduce((s: number, p) => s + (p === '' ? 0 : p), 0),
        lajeja: lajipisteet.filter((p) => p !== '').length,
        ratk: ratkPisteet === '' || ratkPisteet === undefined ? EI_RATKAISIJAA : ratkPisteet,
        sija: 0,
        jarj: 0,
      }
    },
  )

  henkilot.forEach((h, i) => {
    const parempia = henkilot.filter((m) => m.yht > h.yht).length
    const parempiRatk = henkilot.filter((m) => m.yht === h.yht && m.ratk > h.ratk).length
    // Sijoilla 1–8 myös ratkaisijalaji ratkaisee; sen jälkeen sama yhteistulos riittää.
    h.sija = parempia + 1 > TARKAN_TULKKAUKSEN_RAJA ? parempia + 1 : parempia + parempiRatk + 1
    const ennen = henkilot.filter((m, j) => m.yht === h.yht && m.ratk === h.ratk && j < i).length
    h.jarj = parempia + parempiRatk + ennen + 1
  })

  return { kaikki, yhdistykset, henkilot }
}

export function kirjoitaYhdistykset(wb: Workbook, kisa: Kisa, lajit: LajiKonteksti[]) {
  const ws = wb.addWorksheet(YHDISTYKSET_VALILEHTI)
  const parhaita = kisa.asetukset.laskettavatParhaat
  // Jos joukkuekilpailua ei järjestetä, sitä ei myöskään kirjoiteta tiedostoon: tuloste
  // ei saa esittää kilpailua, jota ei ole ollut.
  const joukkueet = onJoukkuekilpailu(kisa.asetukset)
  const ratkaisija =
    kisa.tyyppi === 'resul'
      ? lajit.findIndex((L) => L.rakenne.id === RESUL_TASATULOKSEN_RATKAISIJA)
      : -1

  const { kaikki, yhdistykset, henkilot } = koosteApurit(lajit, parhaita, ratkaisija)

  const leveys = 6 + lajit.length
  const yhdPaikat = yhdistykset.length + VARA_YHDISTYS
  /*
   * Uusi kilpailija voi ilmestyä vain tuloskortin varariville, joten tämä yläraja on
   * tarkka: yhtään riviä ei voi jäädä näyttämättä tavallisessa käytössä.
   */
  const hloPaikat =
    henkilot.length + lajit.reduce((s, L) => s + (L.riveja - L.osallistujat.length), 0)

  // --- Piilotettujen apusarakkeiden paikat ---
  const apuAlku = leveys + 2
  let seuraava = apuAlku
  const varaa = () => seuraava++
  const varaaLajeille = () => lajit.map(() => seuraava++)

  /** Ehdokaslohko: yhdistykset. */
  const A: EhdokasSarakkeet = { arvo: varaa(), nro: varaa(), eka: varaa() }
  /** Koostelohko: yhdistykset. */
  const B = {
    nimi: varaa(),
    yht: varaa(),
    rivi: varaa(),
    sija: varaa(),
    jarj: varaa(),
    pisteet: varaaLajeille(),
    ampujia: varaaLajeille(),
    lajiSija: varaaLajeille(),
    lajiJarj: varaaLajeille(),
  }
  /** Ehdokaslohko: kilpailijat. */
  const C: EhdokasSarakkeet = { arvo: varaa(), nro: varaa(), eka: varaa() }
  /** Koostelohko: kilpailijat. */
  const D = {
    avain: varaa(),
    sukunimi: varaa(),
    etunimi: varaa(),
    yhdistys: varaa(),
    yht: varaa(),
    lajeja: varaa(),
    ratk: varaa(),
    rivi: varaa(),
    sija: varaa(),
    jarj: varaa(),
    pisteet: varaaLajeille(),
  }
  /** Näkyvän rivin osoite koostelohkoon. */
  const osoiteSarake = varaa()
  const apuLoppu = seuraava - 1

  const eka = ENSIMMAINEN_DATARIVI
  const ehdokasVika = eka + Math.max(kaikki.length, 1) - 1
  const eAlue = (s: number) => sarakeAlue(s, eka, ehdokasVika)
  const yAlue = (s: number) => sarakeAlue(s, eka, eka + yhdPaikat - 1)
  const hAlue = (s: number) => sarakeAlue(s, eka, eka + hloPaikat - 1)

  /** Lajin sijoitussivun apusarakkeen pystyalue. */
  const lajiAlue = (L: LajiKonteksti, s: number) =>
    `${sivuViite(L.sijoitukset)}${sarakeAlue(s, eka, eka + L.riveja - 1)}`
  /** Lajin tuloskortin sarakkeen pystyalue. */
  const korttiAlue = (L: LajiKonteksti, s: number) =>
    `${sivuViite(L.tuloskortti)}${sarakeAlue(s, eka, eka + L.riveja - 1)}`

  // --- Otsikko ja ohje ---
  ws.mergeCells(1, 1, 1, leveys)
  const otsikko = ws.getCell(1, 1)
  otsikko.value = joukkueet ? 'Yhdistys- ja kokonaiskilpailu' : 'Kokonaiskilpailu'
  tyylitaOtsikko(otsikko, true)

  ws.mergeCells(2, 1, 2, leveys)
  const ohje = ws.getCell(2, 1)
  ohje.value =
    (joukkueet
      ? `Lajitulos = parhaiden ${parhaita} kilpailijan summa. `
      : 'Yhdistyskilpailua ei järjestetty. ') +
    'Päivittyy kaavoilla tuloskorteilta — tätä sivua ei muokata käsin.'
  tyylitaOhje(ohje, true)

  // --- Ehdokaslohkot ---
  if (joukkueet) {
    kirjoitaEhdokaslohko(ws, kaikki, A, '_yhdistys', (e) => e.apu?.yhdistys ?? '')
  }
  kirjoitaEhdokaslohko(ws, kaikki, C, '_hloAvain', (e) => e.apu?.hloAvain ?? '')

  // --- Koostelohko: yhdistykset ---
  if (joukkueet) {
    for (let m = 0; m < yhdPaikat; m++) {
      const rivi = eka + m
      const y = yhdistykset[m]
      const sNimi = solu(rivi, B.nimi)
      const sYht = solu(rivi, B.yht)

      ws.getCell(rivi, B.nimi).value = {
        formula: `IFERROR(INDEX(${eAlue(A.arvo)},MATCH(${m + 1},${eAlue(A.eka)},0)),"")`,
        result: y?.nimi ?? '',
      }
      lajit.forEach((L, j) => {
        // Lajitulos = parhaiden N kilpailijan summa. `_yhdSija` on tiivis 1..n ranking
        // yhdistyksen sisällä, joten rajaus on pelkkä "<=N".
        ws.getCell(rivi, B.pisteet[j]!).value = {
          formula:
            `IF(${sNimi}="","",SUMIFS(${lajiAlue(L, L.sa.apu._tulos)},` +
            `${lajiAlue(L, L.sa.apu._yhdistys)},${sNimi},` +
            `${lajiAlue(L, L.sa.apu._yhdSija)},"<="&${parhaita}))`,
          result: y?.lajipisteet[j] ?? '',
        }
        ws.getCell(rivi, B.ampujia[j]!).value = {
          formula: `IF(${sNimi}="","",COUNTIF(${lajiAlue(L, L.sa.apu._yhdistys)},${sNimi}))`,
          result: y?.ampujia[j] ?? '',
        }
      })
      ws.getCell(rivi, B.yht).value = {
        formula: `IF(${sNimi}="","",SUM(${B.pisteet.map((s) => solu(rivi, s)).join(',')}))`,
        result: y?.yht ?? '',
      }
      ws.getCell(rivi, B.rivi).value = { formula: 'ROW()', result: rivi }
      ws.getCell(rivi, B.sija).value = {
        formula: `IF(${sNimi}="","",1+COUNTIF(${yAlue(B.yht)},">"&${sYht}))`,
        result: y?.sija ?? '',
      }
      ws.getCell(rivi, B.jarj).value = {
        formula:
          `IF(${sNimi}="","",1+COUNTIF(${yAlue(B.yht)},">"&${sYht})` +
          `+COUNTIFS(${yAlue(B.yht)},${sYht},${yAlue(B.rivi)},"<"&ROW()))`,
        result: y?.jarj ?? '',
      }
      lajit.forEach((_, j) => {
        const sAmpujia = solu(rivi, B.ampujia[j]!)
        const sPisteet = solu(rivi, B.pisteet[j]!)
        // Yhdistys, jolla ei ole ampujia lajissa, ei ole lajin taulukossa lainkaan.
        const mukana = `${yAlue(B.ampujia[j]!)},">0"`
        const parempia = `COUNTIFS(${mukana},${yAlue(B.pisteet[j]!)},">"&${sPisteet})`
        ws.getCell(rivi, B.lajiSija[j]!).value = {
          formula: `IF(OR(${sNimi}="",${sAmpujia}=0),"",1+${parempia})`,
          result: y?.lajiSija[j] ?? '',
        }
        ws.getCell(rivi, B.lajiJarj[j]!).value = {
          formula:
            `IF(OR(${sNimi}="",${sAmpujia}=0),"",1+${parempia}` +
            `+COUNTIFS(${mukana},${yAlue(B.pisteet[j]!)},${sPisteet},${yAlue(B.rivi)},"<"&ROW()))`,
          result: y?.lajiJarj[j] ?? '',
        }
      })
    }
  }

  // --- Koostelohko: kokonaiskilpailun kilpailijat ---
  for (let p = 0; p < hloPaikat; p++) {
    const rivi = eka + p
    const h = henkilot[p]
    const sAvain = solu(rivi, D.avain)
    const sYht = solu(rivi, D.yht)
    const sRatk = solu(rivi, D.ratk)

    ws.getCell(rivi, D.avain).value = {
      formula: `IFERROR(INDEX(${eAlue(C.arvo)},MATCH(${p + 1},${eAlue(C.eka)},0)),"")`,
      result: h?.avain ?? '',
    }
    // Nimitiedot otetaan ensimmäisestä lajista, josta kilpailija löytyy.
    const ekaOsuma = (sarake: number) =>
      lajit.reduceRight(
        (acc, L) =>
          `IFERROR(INDEX(${korttiAlue(L, sarake)},` +
          `MATCH(${sAvain},${lajiAlue(L, L.sa.apu._hloAvain)},0)),${acc})`,
        '""',
      )
    ws.getCell(rivi, D.sukunimi).value = {
      formula: `IF(${sAvain}="","",${ekaOsuma(2)})`,
      result: h?.sukunimi ?? '',
    }
    ws.getCell(rivi, D.etunimi).value = {
      formula: `IF(${sAvain}="","",${ekaOsuma(3)})`,
      result: h?.etunimi ?? '',
    }
    ws.getCell(rivi, D.yhdistys).value = {
      formula: `IF(${sAvain}="","",${ekaOsuma(4)})`,
      result: h?.yhdistys ?? '',
    }
    lajit.forEach((L, j) => {
      const avainAlue = lajiAlue(L, L.sa.apu._hloAvain)
      ws.getCell(rivi, D.pisteet[j]!).value = {
        // Tyhjä tarkoittaa "lajia ei ammuttu"; hylätty on mukana nollalla.
        formula:
          `IF(OR(${sAvain}="",COUNTIF(${avainAlue},${sAvain})=0),"",` +
          `SUMIFS(${lajiAlue(L, L.sa.apu._hloPisteet)},${avainAlue},${sAvain}))`,
        result: h?.lajipisteet[j] ?? '',
      }
    })
    const pisteSolut = D.pisteet.map((s) => solu(rivi, s)).join(',')
    ws.getCell(rivi, D.yht).value = {
      formula: `IF(${sAvain}="","",SUM(${pisteSolut}))`,
      result: h?.yht ?? '',
    }
    ws.getCell(rivi, D.lajeja).value = {
      // COUNT laskee vain luvut, joten ammumattomat lajit (tyhjä teksti) jäävät pois.
      formula: `IF(${sAvain}="","",COUNT(${pisteSolut}))`,
      result: h?.lajeja ?? '',
    }
    const sRatkPisteet = ratkaisija < 0 ? '' : solu(rivi, D.pisteet[ratkaisija]!)
    ws.getCell(rivi, D.ratk).value = {
      formula:
        ratkaisija < 0
          ? `IF(${sAvain}="","",${EI_RATKAISIJAA})`
          : `IF(${sAvain}="","",IF(${sRatkPisteet}="",${EI_RATKAISIJAA},${sRatkPisteet}))`,
      result: h?.ratk ?? '',
    }
    ws.getCell(rivi, D.rivi).value = { formula: 'ROW()', result: rivi }

    const parempia = `COUNTIF(${hAlue(D.yht)},">"&${sYht})`
    const parempiRatk = `COUNTIFS(${hAlue(D.yht)},${sYht},${hAlue(D.ratk)},">"&${sRatk})`
    ws.getCell(rivi, D.sija).value = {
      formula:
        `IF(${sAvain}="","",IF(1+${parempia}>${TARKAN_TULKKAUKSEN_RAJA},1+${parempia},` +
        `1+${parempia}+${parempiRatk}))`,
      result: h?.sija ?? '',
    }
    /*
     * Yksikäsitteinen järjestysnumero. Viimeinen ratkaisija on apulohkon rivijärjestys
     * eikä sukunimi kuten sovelluksessa: COUNTIFS-ehdon tekstivertailua (`"<"&nimi`) ei
     * tueta kaikissa taulukkolaskimissa, ja nimessä oleva tähti tulkittaisiin
     * jokerimerkiksi. Rivijärjestys on lajikohtainen esiintymisjärjestys, ja koska
     * tuloskortti on sukunimijärjestyksessä, ero näkyy vain jos kaksi täysin tasatulokseen
     * päätynyttä kilpailijaa on ammunut eri lajit.
     */
    ws.getCell(rivi, D.jarj).value = {
      formula:
        `IF(${sAvain}="","",1+${parempia}+${parempiRatk}` +
        `+COUNTIFS(${hAlue(D.yht)},${sYht},${hAlue(D.ratk)},${sRatk},` +
        `${hAlue(D.rivi)},"<"&ROW()))`,
      result: h?.jarj ?? '',
    }
  }

  // --- Näkyvät taulukot ---
  let rivi = ENSIMMAINEN_DATARIVI
  const os = (r: number) => solu(r, osoiteSarake)

  const valiotsikko = (teksti: string) => {
    const c = ws.getCell(rivi, 1)
    c.value = teksti
    tyylitaValiotsikko(c)
    rivi++
  }
  const otsikkoRivi = (nimet: string[]) => {
    nimet.forEach((nimi, i) => {
      const c = ws.getCell(rivi, i + 1)
      c.value = nimi
      tyylitaOtsikko(c)
    })
    rivi++
  }

  if (joukkueet) {
    valiotsikko('Yhteistulos')
    otsikkoRivi(['Sija', 'Yhdistys', ...lajit.map((L) => L.rakenne.koodi), 'Yhteensä'])

    for (let m = 0; m < yhdPaikat; m++) {
      const r = rivi + m
      const y = yhdistykset.find((x) => x.jarj === m + 1)
      ws.getCell(r, osoiteSarake).value = {
        formula: `IFERROR(MATCH(${m + 1},${yAlue(B.jarj)},0),"")`,
        result: y ? yhdistykset.indexOf(y) + 1 : '',
      }
      const poimi = (sarake: number) => `IF(${os(r)}="","",INDEX(${yAlue(sarake)},${os(r)}))`
      ws.getCell(r, 1).value = { formula: poimi(B.sija), result: y?.sija ?? '' }
      ws.getCell(r, 2).value = { formula: poimi(B.nimi), result: y?.nimi ?? '' }
      lajit.forEach((_, j) => {
        const arvo = `INDEX(${yAlue(B.pisteet[j]!)},${os(r)})`
        ws.getCell(r, 3 + j).value = {
          /*
           * Nolla jätetään näyttämättä, kuten sovelluksen omassa taulukossa. Ehdot ovat
           * sisäkkäisiä IF-lauseita eivätkä OR-lause: OR laskee kaikki argumenttinsa,
           * jolloin tyhjän rivin INDEX tyhjällä indeksillä antaisi #ARVO!-virheen.
           */
          formula: `IF(${os(r)}="","",IF(${arvo}=0,"",${arvo}))`,
          result: y ? y.lajipisteet[j] || '' : '',
        }
      })
      ws.getCell(r, 3 + lajit.length).value = { formula: poimi(B.yht), result: y?.yht ?? '' }
    }
    rivi += yhdPaikat
    rivi = varoitusRivi(ws, rivi, leveys, solu(ehdokasVika, A.nro), yhdPaikat, 'yhdistystä')
    rivi++

    // --- Lajikohtaiset taulukot ---
    lajit.forEach((L, j) => {
      valiotsikko(L.rakenne.nimi)
      otsikkoRivi(['Sija', 'Yhdistys', 'Tulos', 'Ampujia', 'Huomioidut'])

      for (let m = 0; m < yhdPaikat; m++) {
        const r = rivi + m
        const y = yhdistykset.find((x) => x.lajiJarj[j] === m + 1)
        ws.getCell(r, osoiteSarake).value = {
          formula: `IFERROR(MATCH(${m + 1},${yAlue(B.lajiJarj[j]!)},0),"")`,
          result: y ? yhdistykset.indexOf(y) + 1 : '',
        }
        const poimi = (sarake: number) => `IF(${os(r)}="","",INDEX(${yAlue(sarake)},${os(r)}))`
        ws.getCell(r, 1).value = { formula: poimi(B.lajiSija[j]!), result: y?.lajiSija[j] ?? '' }
        ws.getCell(r, 2).value = { formula: poimi(B.nimi), result: y?.nimi ?? '' }
        ws.getCell(r, 3).value = { formula: poimi(B.pisteet[j]!), result: y?.lajipisteet[j] ?? '' }
        ws.getCell(r, 4).value = { formula: poimi(B.ampujia[j]!), result: y?.ampujia[j] ?? '' }

        /*
         * Huomioidut ampujat. `_yhdAvain` on muotoa "Yhdistys|sija", joten n:s huomioitu
         * löytyy tavallisella MATCHilla ilman taulukkokaavaa. Puuttuva osa katoaa
         * IFERRORiin, ja koska sijat ovat tiiviit 1..n, aukkoja ei voi syntyä keskelle.
         */
        const nimiViite = `INDEX(${yAlue(B.nimi)},${os(r)})`
        const osat = Array.from({ length: parhaita }, (_, i) => {
          const kohta = `MATCH(${nimiViite}&"|"&${i + 1},${lajiAlue(L, L.sa.apu._yhdAvain)},0)`
          const erotin = i === 0 ? '' : '", "&'
          return (
            `IFERROR(${erotin}INDEX(${korttiAlue(L, 2)},${kohta})&" "&` +
            `INDEX(${lajiAlue(L, L.sa.apu._tulos)},${kohta}),"")`
          )
        })
        ws.getCell(r, 5).value = {
          formula: `IF(${os(r)}="","",${osat.join('&')})`,
          result: y?.huomioidut[j] ?? '',
        }
      }
      rivi += yhdPaikat
      rivi++
    })
  }

  // --- Kokonaiskilpailu ---
  valiotsikko('Kokonaiskilpailu — henkilökohtainen')
  otsikkoRivi([
    'Sija',
    'Sukunimi',
    'Etunimi',
    'Yhdistys',
    ...lajit.map((L) => L.rakenne.koodi),
    'Yhteensä',
    'Lajeja',
  ])

  for (let p = 0; p < hloPaikat; p++) {
    const r = rivi + p
    const h = henkilot.find((x) => x.jarj === p + 1)
    ws.getCell(r, osoiteSarake).value = {
      formula: `IFERROR(MATCH(${p + 1},${hAlue(D.jarj)},0),"")`,
      result: h ? henkilot.indexOf(h) + 1 : '',
    }
    const poimi = (sarake: number) => `IF(${os(r)}="","",INDEX(${hAlue(sarake)},${os(r)}))`
    ws.getCell(r, 1).value = { formula: poimi(D.sija), result: h?.sija ?? '' }
    ws.getCell(r, 2).value = { formula: poimi(D.sukunimi), result: h?.sukunimi ?? '' }
    ws.getCell(r, 3).value = { formula: poimi(D.etunimi), result: h?.etunimi ?? '' }
    ws.getCell(r, 4).value = { formula: poimi(D.yhdistys), result: h?.yhdistys ?? '' }
    lajit.forEach((_, j) => {
      ws.getCell(r, 5 + j).value = {
        formula: poimi(D.pisteet[j]!),
        result: h?.lajipisteet[j] ?? '',
      }
    })
    ws.getCell(r, 5 + lajit.length).value = { formula: poimi(D.yht), result: h?.yht ?? '' }
    ws.getCell(r, 6 + lajit.length).value = { formula: poimi(D.lajeja), result: h?.lajeja ?? '' }
  }
  rivi += hloPaikat
  varoitusRivi(ws, rivi, leveys, solu(ehdokasVika, C.nro), hloPaikat, 'kilpailijaa')

  ws.getColumn(1).width = 6
  ws.getColumn(2).width = 20
  ws.getColumn(3).width = 16
  ws.getColumn(4).width = 16
  for (let s = 5; s <= leveys; s++) ws.getColumn(s).width = 10
  // Huomioidut-sarake on lajitaulukoissa viides ja tarvitsee tilaa nimiluettelolle.
  if (joukkueet) ws.getColumn(5).width = 34
  for (let s = apuAlku; s <= apuLoppu; s++) ws.getColumn(s).hidden = true
}

/**
 * Ehdokaslohko: juokseva laskuri numeroi eri arvot esiintymisjärjestyksessä.
 *
 * `_nro` kasvaa vain, kun arvo nähdään ensimmäistä kertaa, ja `_eka` on tuo numero
 * pelkästään ensimmäisellä esiintymällä. Näin `MATCH(n, _eka)` löytää n:nnen eri arvon.
 */
function kirjoitaEhdokaslohko(
  ws: Worksheet,
  kaikki: Ehdokas[],
  sarakkeet: EhdokasSarakkeet,
  lahde: '_yhdistys' | '_hloAvain',
  arvoksi: (e: Ehdokas) => string,
) {
  const eka = ENSIMMAINEN_DATARIVI
  const nahdyt = new Set<string>()
  let nro = 0

  kaikki.forEach((e, i) => {
    const rivi = eka + i
    const sArvo = solu(rivi, sarakkeet.arvo)
    const arvo = arvoksi(e)

    ws.getCell(rivi, sarakkeet.arvo).value = {
      formula: `${sivuViite(e.laji.sijoitukset)}${solu(e.rivi, e.laji.sa.apu[lahde])}`,
      result: arvo,
    }

    const edellinen = i === 0 ? '0' : solu(rivi - 1, sarakkeet.nro)
    const tuttu = `OR(${sArvo}="",COUNTIF(${sarakeAlue(sarakkeet.arvo, eka, rivi)},${sArvo})>1)`

    const ekaKerta = arvo !== '' && !nahdyt.has(arvo)
    if (ekaKerta) {
      nahdyt.add(arvo)
      nro++
    }

    ws.getCell(rivi, sarakkeet.nro).value = {
      formula: `IF(${tuttu},${edellinen},${edellinen}+1)`,
      result: nro,
    }
    ws.getCell(rivi, sarakkeet.eka).value = {
      formula: `IF(${tuttu},"",${solu(rivi, sarakkeet.nro)})`,
      result: ekaKerta ? nro : '',
    }
  })
}

/** Varoitusrivi, jos lohkoon tulee enemmän rivejä kuin siihen mahtuu. */
function varoitusRivi(
  ws: Worksheet,
  rivi: number,
  leveys: number,
  laskuriSolu: string,
  paikkoja: number,
  mita: string,
): number {
  ws.mergeCells(rivi, 1, rivi, leveys)
  const c = ws.getCell(rivi, 1)
  c.value = {
    formula:
      `IF(N(${laskuriSolu})<=${paikkoja},"","⚠ "&(N(${laskuriSolu})-${paikkoja})&` +
      `" ${mita} ei mahdu tähän taulukkoon. Tuo tiedosto sovellukseen, niin koko lista näkyy.")`,
    result: '',
  }
  c.font = { bold: true, color: { argb: 'FFB00020' } }
  return rivi + 1
}
