import type { Workbook } from 'exceljs'
import type { Kilpailija, Kisa, LajiId, Luokka } from '@/types/kisa'
import { LUOKAT, LUOKKA_NIMET, type LajiRakenne } from '@/core/lajit'
import { laskeLaji, type LajiTulos } from '@/core/laskenta'
import { TARKAN_TULKKAUKSEN_RAJA } from '@/core/sijoitukset'
import {
  ENSIMMAINEN_DATARIVI,
  OTSIKKO_RIVI,
  PERUSSARAKKEET,
  SIJOITUS_APUSARAKKEET,
  SIJOITUS_PERUS,
  VARARIVIT,
  alue,
  luoAsettelu,
  luoSijoitusAsettelu,
  sarakeAlue,
  sivuViite,
  solu,
  type Asettelu,
  type SijoitusAsettelu,
} from './xlsxAsettelu'
import { tyylitaOhje, tyylitaOtsikko } from './xlsxTyylit'

/**
 * Lajitteluavaimen kertoimet.
 *
 * COUNTIFS osaa vertailla vain yhtä lukua kerrallaan, joten paremmuusjärjestys
 * puristetaan yhdeksi luvuksi: tulos painaa eniten, sitten iskemät ja viimeisenä
 * napakympit. Kertoimet riittävät niin kauan kuin iskemiä ja napakymppejä on rivillä
 * alle tuhat — eli aina.
 */
const AVAIN_TULOS = 1_000_000
const AVAIN_ISKEMA = 1_000

/** Hylätyn avain. Pienempi kuin nollatuloksen 0, joten hylätyt jäävät luokkansa loppuun. */
const AVAIN_HYLATTY = -1

/** Hylätyn sijaluku listassa. */
export const HYLATYN_SIJA = '—'

export interface SijoitusApuri {
  /** Luokan järjestysnumero (1-alkuinen), tai '' jos kilpailija ei ole aloittanut. */
  luokka: number | ''
  /** Yhdistetty lajitteluavain, tai '' jos kilpailija ei ole aloittanut. */
  avain: number | ''
  /** Huonomman kilpasarjan avain (RA1 kohta 15.A.3, RA4 kohta 14.3). Muissa lajeissa 0. */
  avain2: number | ''
  /** Pelkkä tulos sijalukua varten. Hylätyllä ja aloittamattomalla ''. */
  tulos: number | ''
  /** Yksikäsitteinen järjestysnumero koko listassa. */
  jarjestys: number | ''
  sija: number | typeof HYLATYN_SIJA | ''
  /** Yhdistys, jos rivi kerryttää yhdistyspisteitä. Hylätty ja aloittamaton eivät. */
  yhdistys: string
  /** Kilpailijan järjestysnumero oman yhdistyksensä sisällä, paras ensin. */
  yhdSija: number | ''
  /** `yhdistys|yhdSija`. Koostesivu poimii huomioidut ampujat tällä avaimella. */
  yhdAvain: string
  /** Kilpailijan tunniste kokonaiskilpailua varten. Aloittamattomalla ''. */
  hloAvain: string
  /** Kokonaiskilpailun pisteet: hylätyllä 0, aloittamattomalla ''. */
  hloPisteet: number | ''
}

/**
 * Yhden lajin vientikonteksti.
 *
 * Sijoitussivu ja yhdistyssivu viittaavat molemmat samoihin soluihin, joten paikat ja
 * apuarvot lasketaan kerran ja kuljetetaan mukana. Muuten kaksi moduulia päättelisi
 * samat rivinumerot erikseen, ja yksikin ero rikkoisi viittaukset hiljaisesti.
 */
export interface LajiKonteksti {
  rakenne: LajiRakenne
  /** Tuloskortin välilehden nimi. */
  tuloskortti: string
  /** Sijoitussivun välilehden nimi. */
  sijoitukset: string
  osallistujat: Kilpailija[]
  /** Datarivien määrä tuloskortissa ja sijoitussivun apulohkossa (sis. vararivit). */
  riveja: number
  a: Asettelu
  sa: SijoitusAsettelu
  apurit: SijoitusApuri[]
}

/**
 * Tuloskortin kaavojen näkemys iskemistä ja napakympeistä.
 *
 * 'paras'-lajeissa kaava valitsee sarjan pelkillä pisteillä (`N(S1yht)>=N(S2yht)`),
 * kun taas `laskeLaji` ratkaisee tasapisteet vielä tasatulosperusteilla. Sijoitussivun
 * valmiiden arvojen on vastattava sitä, minkä Excel laskee, joten sama valinta tehdään
 * tässä.
 */
function excelPerusteet(tulos: LajiTulos, summa: boolean) {
  const [eka, toka] = tulos.sarjat
  if (summa || tulos.sarjat.length !== 2 || !eka || !toka) {
    return { paras: tulos.peruste, huonompi: undefined }
  }
  const ekaParempi = eka.pisteet >= toka.pisteet
  return { paras: ekaParempi ? eka : toka, huonompi: ekaParempi ? toka : eka }
}

/** Yhdistää pisteet, iskemät ja napakympit yhdeksi vertailtavaksi luvuksi. */
function avaimeksi(pisteet: number, iskemat: number, navat: number): number {
  return pisteet * AVAIN_TULOS + iskemat * AVAIN_ISKEMA + navat
}

/** Luokan järjestysnumero. Tunnistamaton luokka menee listan loppuun. */
function luokanJarjestys(luokka: Luokka): number {
  const i = LUOKAT.indexOf(luokka)
  return i < 0 ? LUOKAT.length + 1 : i + 1
}

/**
 * Laskee samat apuarvot kuin sijoitussivun kaavat.
 *
 * Kaavat pystyvät vertailemaan vain sitä, mitä sivulla näkyy: tulos, iskemät ja
 * napakympit, ja 'paras'-lajeissa lisäksi huonompi kilpasarja. Sama rajaus tehdään tässä
 * tarkoituksella — tiedostoon talletettu valmis arvo vastaa silloin sitä, minkä Excel
 * laskee auetessaan, eikä lista hyppää toiseen järjestykseen ensimmäisellä
 * laskentakierroksella. Syvin tasatulossääntö (kymppien ja ysien määrä) ratkaistaan
 * sovelluksessa, kun tiedosto tuodaan takaisin.
 */
export function sijoitusApurit(
  osallistujat: Kilpailija[],
  laji: LajiId,
  maaritys: LajiRakenne,
): SijoitusApuri[] {
  const tyhja = (): SijoitusApuri => ({
    luokka: '',
    avain: '',
    avain2: '',
    tulos: '',
    jarjestys: '',
    sija: '',
    yhdistys: '',
    yhdSija: '',
    yhdAvain: '',
    hloAvain: '',
    hloPisteet: '',
  })

  const apurit: SijoitusApuri[] = osallistujat.map((k) => {
    const o = k.osallistumiset[laji]
    if (!o) return tyhja()
    const t = laskeLaji(laji, maaritys, o)
    // Aloittamaton kilpailija ei kuulu tuloslistaan; sama sääntö kuin sijoitukset().
    if (!t.aloitettu) return tyhja()
    const { paras, huonompi } = excelPerusteet(t, maaritys.tulosSaanto === 'summa')
    return {
      luokka: luokanJarjestys(o.luokka),
      avain: t.hylatty ? AVAIN_HYLATTY : avaimeksi(t.pisteet, paras.iskemat, paras.navat),
      // Hylätyllä nolla, jotta hylätyt jäävät keskenään sukunimijärjestykseen.
      avain2:
        t.hylatty || !huonompi ? 0 : avaimeksi(huonompi.pisteet, huonompi.iskemat, huonompi.navat),
      tulos: t.hylatty ? '' : t.pisteet,
      jarjestys: '',
      sija: t.hylatty ? HYLATYN_SIJA : '',
      // Hylätyn tulos on mitätöity, joten se ei kerrytä yhdistyksen pisteitä.
      yhdistys: t.hylatty ? '' : (k.yhdistys ?? '').trim(),
      yhdSija: '',
      yhdAvain: '',
      // Kokonaiskilpailussa hylätty on mukana nollalla: rike sulkee pois vain siitä lajista.
      hloAvain: k.id,
      hloPisteet: t.hylatty ? 0 : t.pisteet,
    }
  })

  const mukana = apurit
    .map((apu, i) => ({
      apu,
      i,
      luokka: Number(apu.luokka),
      avain: Number(apu.avain),
      avain2: Number(apu.avain2),
      tulos: apu.tulos === '' ? null : Number(apu.tulos),
    }))
    .filter((e) => e.apu.luokka !== '')

  // Luokka, sitten avain laskevasti, tasatilanteessa tuloskortin rivijärjestys (sukunimi).
  // Täsmälleen sama kuin _jarjestys-kaavan neljä laskuria.
  const jarjestetty = [...mukana].sort(
    (x, y) => x.luokka - y.luokka || y.avain - x.avain || y.avain2 - x.avain2 || x.i - y.i,
  )
  jarjestetty.forEach((e, n) => {
    e.apu.jarjestys = n + 1
  })

  for (const e of mukana) {
    if (e.apu.sija === HYLATYN_SIJA) continue
    const omaTulos = e.tulos ?? 0
    const samaLuokka = mukana.filter((m) => m.luokka === e.luokka)
    const parempiTulos = samaLuokka.filter((m) => m.tulos !== null && m.tulos > omaTulos).length + 1
    const parempiAvain =
      samaLuokka.filter((m) => m.avain > e.avain).length +
      samaLuokka.filter((m) => m.avain === e.avain && m.avain2 > e.avain2).length +
      1
    // Sijalta 9 eteenpäin pelkkä sama tulos riittää jaettuun sijaan (ks. sijoitukset.ts).
    e.apu.sija = parempiTulos > TARKAN_TULKKAUKSEN_RAJA ? parempiTulos : parempiAvain
  }

  // Järjestys oman yhdistyksen sisällä: yhdistyksen lajipisteet ovat parhaiden N summa.
  const yhdistyksissa = apurit
    .map((apu, i) => ({ apu, i, tulos: apu.tulos === '' ? null : Number(apu.tulos) }))
    .filter((e) => e.apu.yhdistys !== '' && e.tulos !== null)
  for (const e of yhdistyksissa) {
    const sama = yhdistyksissa.filter((m) => m.apu.yhdistys === e.apu.yhdistys)
    const parempia = sama.filter((m) => (m.tulos ?? 0) > (e.tulos ?? 0)).length
    const aiemmat = sama.filter((m) => m.tulos === e.tulos && m.i < e.i).length
    e.apu.yhdSija = parempia + aiemmat + 1
    e.apu.yhdAvain = `${e.apu.yhdistys}|${e.apu.yhdSija}`
  }

  return apurit
}

/**
 * Sijoitukset: elävä näkymä, joka seuraa tuloskorttiin käsin tehtyjä muutoksia.
 *
 * Kaavat eivät voi siirrellä rivejä, joten taulukko on kiinteän korkuinen ja järjestys
 * hoidetaan osoitteella. Piilotetut apusarakkeet antavat jokaiselle tuloskortin riville
 * yksikäsitteisen järjestysnumeron, ja näkyvä rivi k hakee MATCH+INDEX-parilla sen rivin,
 * jonka järjestysnumero on k. Kun tuloskortissa muuttuu laukaus, luokka tai
 * hylkäysmerkintä, numerot lasketaan uudelleen ja rivit vaihtavat paikkaa itsestään.
 *
 * Viittaukset osoittavat nimenomaan tämän lajin tuloskorttiin, joten sama rakenne toimii
 * sellaisenaan riippumatta siitä, montako lajia kisassa on.
 */
export function kirjoitaSijoitukset(wb: Workbook, k: LajiKonteksti) {
  const { rakenne: maaritys, a, sa, apurit, osallistujat, riveja } = k
  const laji = maaritys.id
  const ws = wb.addWorksheet(k.sijoitukset, { views: [{ state: 'frozen', ySplit: OTSIKKO_RIVI }] })

  const ekaRivi = ENSIMMAINEN_DATARIVI
  const vikaRivi = ekaRivi + riveja - 1
  const tk = sivuViite(k.tuloskortti)
  const tkAlue = (sarake: number) => `${tk}${sarakeAlue(sarake, ekaRivi, vikaRivi)}`
  const apuAlue = (sarake: number) => sarakeAlue(sarake, ekaRivi, vikaRivi)
  const sarjoja = maaritys.kilpasarjat.length

  ws.mergeCells(1, 1, 1, sa.leveys)
  const otsikko = ws.getCell(1, 1)
  otsikko.value = `Sijoitukset — ${maaritys.nimi}`
  tyylitaOtsikko(otsikko, true)

  ws.mergeCells(2, 1, 2, sa.leveys)
  const ohje = ws.getCell(2, 1)
  ohje.value =
    `Päivittyy kaavoilla välilehdeltä "${k.tuloskortti}" — tätä sivua ei muokata käsin. ` +
    'Järjestys ratkeaa tuloksen, iskemien ja napakymppien perusteella, ja parhaan sarjan ' +
    'lajeissa lisäksi huonomman kilpasarjan tuloksella. Syvin tasatulossääntö (kymppien ' +
    'ja ysien määrä) ratkaistaan vasta, kun tiedosto tuodaan takaisin sovellukseen.'
  tyylitaOhje(ohje, true)

  const otsikot = [
    ...SIJOITUS_PERUS,
    ...maaritys.kilpasarjat.map((sarja, i) => sarja.nimi?.trim() || `S${i + 1}`),
    'Tulos',
    'Iskemät',
    '★',
  ]
  otsikot.forEach((nimi, i) => {
    const c = ws.getCell(OTSIKKO_RIVI, i + 1)
    c.value = nimi
    tyylitaOtsikko(c)
  })
  SIJOITUS_APUSARAKKEET.forEach((nimi, i) => {
    ws.getCell(OTSIKKO_RIVI, sa.apuAlku + i).value = nimi
  })

  // Näkyvälle riville k poimittavan kilpailijan indeksi apuriveissä.
  const nayttoon: number[] = []
  apurit.forEach((apu, i) => {
    if (apu.jarjestys !== '') nayttoon[apu.jarjestys - 1] = i
  })

  const luokkaNimet = LUOKAT.map((l) => `"${LUOKKA_NIMET[l]}"`).join(',')

  for (let idx = 0; idx < riveja; idx++) {
    const rivi = ekaRivi + idx
    const apu = apurit[idx]

    // --- Apusarakkeet: yksi rivi jokaista tuloskortin riviä kohti ---
    const laukausViitteet = Array.from(
      { length: a.kilpasarjoja },
      (_, s) => `${tk}${alue(rivi, a.laukausAlku(s), a.laukausLoppu(s))}`,
    )
    const tkLuokka = `${tk}${solu(rivi, PERUSSARAKKEET.length)}`
    const tkHylatty = `${tk}${solu(rivi, a.hylatty)}`
    const tkTulos = `${tk}${solu(rivi, a.tulos)}`
    const tkIskemat = `${tk}${solu(rivi, a.iskemat)}`
    const tkNavat = `${tk}${solu(rivi, a.navat)}`
    const tkYhdistys = `${tk}${solu(rivi, 4)}`
    const tkTunnus = `${tk}${solu(rivi, a.tunnus)}`

    const sLuokka = solu(rivi, sa.apu._luokka)
    const sAvain = solu(rivi, sa.apu._avain)
    const sAvain2 = solu(rivi, sa.apu._avain2)
    const sTulos = solu(rivi, sa.apu._tulos)
    const sYhdistys = solu(rivi, sa.apu._yhdistys)
    const sYhdSija = solu(rivi, sa.apu._yhdSija)
    const sOsoite = solu(rivi, sa.apu._osoite)

    // Luokan järjestysnumero, tai tyhjä jos riville ei ole syötetty yhtään laukausta.
    const luokkaNumero = LUOKAT.reduceRight(
      (acc, l, i) => `IF(${tkLuokka}="${l}",${i + 1},${acc})`,
      String(LUOKAT.length + 1),
    )
    ws.getCell(rivi, sa.apu._luokka).value = {
      formula: `IF(COUNTA(${laukausViitteet.join(',')})=0,"",${luokkaNumero})`,
      result: apu?.luokka ?? '',
    }
    ws.getCell(rivi, sa.apu._avain).value = {
      formula:
        `IF(${sLuokka}="","",IF(${tkHylatty}="x",${AVAIN_HYLATTY},` +
        `N(${tkTulos})*${AVAIN_TULOS}+N(${tkIskemat})*${AVAIN_ISKEMA}+N(${tkNavat})))`,
      result: apu?.avain ?? '',
    }
    /*
     * Huonomman kilpasarjan avain (RA1 kohta 15.A.3, RA4 kohta 14.3).
     *
     * Kirjoitetaan vain 'paras'-lajiin, jossa on kaksi sarjaa. 'summa'-lajissa sääntöä ei
     * ole, ja useamman sarjan mukautettu rakenne jää nollalle, jolloin tasatilanne ratkeaa
     * sukunimellä kuten ennenkin.
     */
    const sarjanAvain = (sarja: number) =>
      `N(${tk}${solu(rivi, a.sarjaYht(sarja))})*${AVAIN_TULOS}` +
      `+N(${tk}${solu(rivi, a.sarjaIskemat(sarja))})*${AVAIN_ISKEMA}` +
      `+N(${tk}${solu(rivi, a.sarjaNavat(sarja))})`
    const huonompiAvain =
      maaritys.tulosSaanto !== 'summa' && a.kilpasarjoja === 2
        ? `IF(N(${tk}${solu(rivi, a.sarjaYht(0))})>=N(${tk}${solu(rivi, a.sarjaYht(1))}),` +
          `${sarjanAvain(1)},${sarjanAvain(0)})`
        : '0'
    ws.getCell(rivi, sa.apu._avain2).value = {
      formula: `IF(${sLuokka}="","",IF(${tkHylatty}="x",0,${huonompiAvain}))`,
      result: apu?.avain2 ?? '',
    }
    // Rivinumero ratkaisee täyden tasatuloksen: tuloskortti on sukunimijärjestyksessä.
    ws.getCell(rivi, sa.apu._rivi).value = { formula: 'ROW()', result: rivi }
    ws.getCell(rivi, sa.apu._tulos).value = {
      formula: `IF(OR(${sLuokka}="",${tkHylatty}="x"),"",N(${tkTulos}))`,
      result: apu?.tulos ?? '',
    }
    ws.getCell(rivi, sa.apu._jarjestys).value = {
      formula:
        `IF(${sLuokka}="","",1` +
        `+COUNTIF(${apuAlue(sa.apu._luokka)},"<"&${sLuokka})` +
        `+COUNTIFS(${apuAlue(sa.apu._luokka)},${sLuokka},${apuAlue(sa.apu._avain)},">"&${sAvain})` +
        `+COUNTIFS(${apuAlue(sa.apu._luokka)},${sLuokka},${apuAlue(sa.apu._avain)},${sAvain},` +
        `${apuAlue(sa.apu._avain2)},">"&${sAvain2})` +
        `+COUNTIFS(${apuAlue(sa.apu._luokka)},${sLuokka},${apuAlue(sa.apu._avain)},${sAvain},` +
        `${apuAlue(sa.apu._avain2)},${sAvain2},${apuAlue(sa.apu._rivi)},"<"&ROW()))`,
      result: apu?.jarjestys ?? '',
    }
    const parempiTulos = `COUNTIFS(${apuAlue(sa.apu._luokka)},${sLuokka},${apuAlue(sa.apu._tulos)},">"&${sTulos})+1`
    const parempiAvain =
      `COUNTIFS(${apuAlue(sa.apu._luokka)},${sLuokka},${apuAlue(sa.apu._avain)},">"&${sAvain})` +
      `+COUNTIFS(${apuAlue(sa.apu._luokka)},${sLuokka},${apuAlue(sa.apu._avain)},${sAvain},` +
      `${apuAlue(sa.apu._avain2)},">"&${sAvain2})+1`
    ws.getCell(rivi, sa.apu._sija).value = {
      formula:
        `IF(${sLuokka}="","",IF(${tkHylatty}="x","${HYLATYN_SIJA}",` +
        `IF(${parempiTulos}>${TARKAN_TULKKAUKSEN_RAJA},${parempiTulos},${parempiAvain})))`,
      result: apu?.sija ?? '',
    }

    // --- Näkyvä rivi: poimitaan järjestysnumeron osoittamalta riviltä ---
    const lahde = nayttoon[idx]
    ws.getCell(rivi, sa.apu._osoite).value = {
      formula: `IFERROR(MATCH(ROW()-${OTSIKKO_RIVI},${apuAlue(sa.apu._jarjestys)},0),"")`,
      result: lahde === undefined ? '' : lahde + 1,
    }

    /*
     * --- Yhdistys- ja kokonaiskilpailun apusarakkeet ---
     *
     * Nämä asuvat sijoitussivulla, koska tässä on jo rivikohtainen yhteys tuloskorttiin.
     * Yhdistyssivu lukee valmiit arvot eikä joudu tuntemaan tuloskortin sarakepaikkoja.
     */
    ws.getCell(rivi, sa.apu._yhdistys).value = {
      // Hylätty ja aloittamaton on rajattu pois jo _tulos-sarakkeessa.
      formula: `IF(OR(${sTulos}="",TRIM(${tkYhdistys})=""),"",TRIM(${tkYhdistys}))`,
      result: apu?.yhdistys ?? '',
    }
    ws.getCell(rivi, sa.apu._yhdSija).value = {
      formula:
        `IF(${sYhdistys}="","",1` +
        `+COUNTIFS(${apuAlue(sa.apu._yhdistys)},${sYhdistys},${apuAlue(sa.apu._tulos)},">"&${sTulos})` +
        `+COUNTIFS(${apuAlue(sa.apu._yhdistys)},${sYhdistys},${apuAlue(sa.apu._tulos)},${sTulos},` +
        `${apuAlue(sa.apu._rivi)},"<"&ROW()))`,
      result: apu?.yhdSija ?? '',
    }
    ws.getCell(rivi, sa.apu._yhdAvain).value = {
      formula: `IF(${sYhdistys}="","",${sYhdistys}&"|"&${sYhdSija})`,
      result: apu?.yhdAvain ?? '',
    }
    /*
     * Kilpailijan tunniste lajien yli. Tuloskortin piilotettu Tunnus-sarake riittää
     * viedyille riveille; käsin lisätyllä rivillä sitä ei ole, joten varalla on sama
     * nimiavain, jolla tuontikin tunnistaa rivin (ks. `nimiAvain` xlsxTuonti.ts:ssä).
     */
    ws.getCell(rivi, sa.apu._hloAvain).value = {
      formula:
        `IF(${sLuokka}="","",IF(${tkTunnus}<>"",${tkTunnus},` +
        `LOWER(TRIM(${tk}${solu(rivi, 2)})&"|"&TRIM(${tk}${solu(rivi, 3)})&"|"&TRIM(${tkYhdistys}))))`,
      result: apu?.hloAvain ?? '',
    }
    ws.getCell(rivi, sa.apu._hloPisteet).value = {
      // Turvallisuusrike mitätöi lajin tuloksen, mutta laji on silti ammuttu.
      formula: `IF(${sLuokka}="","",IF(${tkHylatty}="x",0,N(${tkTulos})))`,
      result: apu?.hloPisteet ?? '',
    }

    const nk = lahde === undefined ? undefined : osallistujat[lahde]
    const no = nk?.osallistumiset[laji]
    const nt = no ? laskeLaji(laji, maaritys, no) : undefined
    const poimi = (alueViite: string) => `IF(${sOsoite}="","",INDEX(${alueViite},${sOsoite}))`

    ws.getCell(rivi, sa.luokka).value = {
      formula: `IF(${sOsoite}="","",CHOOSE(INDEX(${apuAlue(sa.apu._luokka)},${sOsoite}),${luokkaNimet},""))`,
      result: no ? LUOKKA_NIMET[no.luokka] : '',
    }
    ws.getCell(rivi, sa.sija).value = {
      formula: poimi(apuAlue(sa.apu._sija)),
      result: lahde === undefined ? '' : (apurit[lahde]?.sija ?? ''),
    }
    ws.getCell(rivi, sa.sukunimi).value = { formula: poimi(tkAlue(2)), result: nk?.sukunimi ?? '' }
    ws.getCell(rivi, sa.etunimi).value = { formula: poimi(tkAlue(3)), result: nk?.etunimi ?? '' }
    ws.getCell(rivi, sa.yhdistys).value = { formula: poimi(tkAlue(4)), result: nk?.yhdistys ?? '' }
    ws.getCell(rivi, sa.ikasarja).value = { formula: poimi(tkAlue(5)), result: nk?.ikasarja ?? '' }
    for (let s = 0; s < sarjoja; s++) {
      const sarja = nt?.sarjat[s]
      ws.getCell(rivi, sa.sarja(s)).value = {
        formula: poimi(tkAlue(a.sarjaYht(s))),
        result: sarja !== undefined && sarja.syotetty > 0 ? sarja.pisteet : '',
      }
    }
    ws.getCell(rivi, sa.tulos).value = {
      formula:
        `IF(${sOsoite}="","",IF(INDEX(${tkAlue(a.hylatty)},${sOsoite})="x","hylätty",` +
        `INDEX(${tkAlue(a.tulos)},${sOsoite})))`,
      result: nt === undefined ? '' : nt.hylatty ? 'hylätty' : nt.pisteet,
    }
    ws.getCell(rivi, sa.iskemat).value = {
      formula: poimi(tkAlue(a.iskemat)),
      result: nt?.peruste.iskemat ?? '',
    }
    ws.getCell(rivi, sa.navat).value = {
      formula: poimi(tkAlue(a.navat)),
      result: nt?.peruste.navat ?? '',
    }
  }

  ws.getColumn(sa.luokka).width = 8
  ws.getColumn(sa.sija).width = 6
  ws.getColumn(sa.sukunimi).width = 16
  ws.getColumn(sa.etunimi).width = 14
  ws.getColumn(sa.yhdistys).width = 14
  ws.getColumn(sa.ikasarja).width = 9
  ws.getColumn(sa.tulos).width = 10
  ws.getColumn(sa.iskemat).width = 9
  ws.getColumn(sa.navat).width = 6
  for (let i = 0; i < SIJOITUS_APUSARAKKEET.length; i++) {
    ws.getColumn(sa.apuAlku + i).hidden = true
  }
}

/** Lajin osallistujat sukunimen mukaan. */
export function lajinOsallistujat(kisa: Kisa, laji: LajiId): Kilpailija[] {
  return kisa.kilpailijat
    .filter((k) => k.osallistumiset[laji])
    .sort(
      (x, y) =>
        x.sukunimi.localeCompare(y.sukunimi, 'fi') || x.etunimi.localeCompare(y.etunimi, 'fi'),
    )
}

/** Kokoaa yhden lajin vientikontekstin. */
export function lajiKonteksti(
  kisa: Kisa,
  rakenne: LajiRakenne,
  nimet: { tuloskortti: string; sijoitukset: string },
): LajiKonteksti {
  const osallistujat = lajinOsallistujat(kisa, rakenne.id)
  return {
    rakenne,
    tuloskortti: nimet.tuloskortti,
    sijoitukset: nimet.sijoitukset,
    osallistujat,
    riveja: osallistujat.length + VARARIVIT,
    a: luoAsettelu(rakenne),
    sa: luoSijoitusAsettelu(rakenne.kilpasarjat.length),
    apurit: sijoitusApurit(osallistujat, rakenne.id, rakenne),
  }
}
