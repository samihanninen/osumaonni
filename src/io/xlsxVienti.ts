import type { Workbook, Worksheet } from 'exceljs'
import type { Kilpailija, Kisa, Laukaus, LuokkaId } from '@/types/kisa'
import { kisanLajit, LAJI_KOODIT } from '@/core/lajit'
import { laskeLaji } from '@/core/laskenta'
import { onJoukkuekilpailu } from '@/core/yhdistykset'
import { VERSIO } from '@/core/versio'
import {
  ENSIMMAINEN_DATARIVI,
  KAAVAT,
  KISATIEDOT_VALILEHTI,
  META_VALILEHTI,
  OTSIKKO_RIVI,
  PERUSSARAKKEET,
  SOVELLUS_NIMI,
  TIEDOSTO_VERSIO,
  YHDISTYKSET_VALILEHTI,
  alue,
  sijoituksetNimi,
  uniikkiSivunNimi,
  solu,
  tuloskorttiNimi,
} from './xlsxAsettelu'
import { kirjoitaSijoitukset, lajiKonteksti, type LajiKonteksti } from './xlsxSijoitussivu'
import { kirjoitaYhdistykset } from './xlsxYhdistyssivu'
import { tyylitaOhje, tyylitaOtsikko } from './xlsxTyylit'

function laukausSoluun(arvo: Laukaus): string | number | null {
  if (arvo === null || arvo === undefined) return null
  if (arvo === '*' || arvo === '-') return arvo
  if (typeof arvo === 'number') return arvo === 0 ? '-' : arvo
  return null
}

/** Tuloskortti: ainoa muokattava välilehti, jossa on aidot Excel-kaavat. */
function kirjoitaTuloskortti(wb: Workbook, konteksti: LajiKonteksti) {
  const { rakenne: maaritys, a, osallistujat, riveja } = konteksti
  const laji = maaritys.id
  const ws = wb.addWorksheet(konteksti.tuloskortti, {
    views: [{ state: 'frozen', xSplit: PERUSSARAKKEET.length, ySplit: OTSIKKO_RIVI }],
  })

  ws.mergeCells(1, 1, 1, a.leveys)
  const otsikko = ws.getCell(1, 1)
  otsikko.value = `${maaritys.nimi}`
  tyylitaOtsikko(otsikko, true)

  ws.mergeCells(2, 1, 2, a.leveys)
  const ohje = ws.getCell(2, 1)
  ohje.value =
    'Syötä laukaukset: 1–10, * = napakymppi, - = ohilaukaus. ' +
    'Summat, napakympit ja kilpailutulos laskeutuvat kaavoilla uudelleen. ' +
    'Merkitse hylkäys kirjaimella x. ' +
    'Alimmat tyhjät rivit ovat valmiina uusille ampujille: täytä nimi ja laukaukset.'
  tyylitaOhje(ohje)

  // Otsikkorivi
  PERUSSARAKKEET.forEach((nimi, i) => {
    const c = ws.getCell(OTSIKKO_RIVI, i + 1)
    c.value = nimi
    tyylitaOtsikko(c)
  })
  for (let s = 0; s < a.kilpasarjoja; s++) {
    for (let i = 0; i < a.laukauksia(s); i++) {
      const c = ws.getCell(OTSIKKO_RIVI, a.laukausAlku(s) + i)
      c.value = `S${s + 1}.${i + 1}`
      tyylitaOtsikko(c)
    }
    for (const [sarake, nimi] of [
      [a.sarjaYht(s), `S${s + 1} yht`],
      [a.sarjaNavat(s), `S${s + 1} ★`],
      [a.sarjaIskemat(s), `S${s + 1} isk`],
    ] as [number, string][]) {
      const c = ws.getCell(OTSIKKO_RIVI, sarake)
      c.value = nimi
      tyylitaOtsikko(c)
    }
  }
  for (const [sarake, nimi] of [
    [a.tulos, 'Kilpailutulos'],
    [a.iskemat, 'Iskemät'],
    [a.navat, 'Napakympit'],
    [a.rikkeet, 'Rikkeet'],
    [a.hylatty, 'Hylätty'],
    [a.huom, 'Huom'],
    [a.tunnus, 'Tunnus'],
  ] as [number, string][]) {
    const c = ws.getCell(OTSIKKO_RIVI, sarake)
    c.value = nimi
    tyylitaOtsikko(c)
  }

  /*
   * Rivimäärä sisältää vararivit, jotka saavat samat kaavat kuin datarivit. Tuonti osaa
   * jo lukea käsin lisätyn rivin, mutta ilman valmiita kaavoja lisätyn ampujan tulos
   * jäisi Excelissä tyhjäksi eikä hän näkyisi sijoituksissa lainkaan.
   */
  for (let idx = 0; idx < riveja; idx++) {
    const rivi = ENSIMMAINEN_DATARIVI + idx
    const k = osallistujat[idx]
    const o = k?.osallistumiset[laji]
    const tulos = o ? laskeLaji(laji, maaritys, o) : undefined

    if (k && o) {
      ws.getCell(rivi, 1).value = idx + 1
      ws.getCell(rivi, 2).value = k.sukunimi
      ws.getCell(rivi, 3).value = k.etunimi
      ws.getCell(rivi, 4).value = k.yhdistys
      ws.getCell(rivi, 5).value = k.ikasarja
      ws.getCell(rivi, 6).value = o.luokka
    }

    const yhtSolut: string[] = []
    for (let s = 0; s < a.kilpasarjoja; s++) {
      const laukaukset = o?.kilpasarjat[s]?.laukaukset ?? []
      for (let i = 0; i < a.laukauksia(s); i++) {
        const c = ws.getCell(rivi, a.laukausAlku(s) + i)
        c.value = laukausSoluun(laukaukset[i] ?? null)
        c.alignment = { horizontal: 'center' }
        c.border = { left: { style: 'hair' }, right: { style: 'hair' } }
      }

      const alueViite = alue(rivi, a.laukausAlku(s), a.laukausLoppu(s))
      const laskettu = tulos?.sarjat[s]
      // Aloittamattoman sarjan kaava palauttaa tyhjän; sama arvo talletetaan valmiiksi.
      const kirjattu = laskettu !== undefined && laskettu.syotetty > 0

      ws.getCell(rivi, a.sarjaYht(s)).value = {
        formula: KAAVAT.sarjaYht(alueViite),
        result: kirjattu ? laskettu.pisteet : '',
      }
      ws.getCell(rivi, a.sarjaNavat(s)).value = {
        formula: KAAVAT.navat(alueViite),
        result: kirjattu ? laskettu.navat : '',
      }
      ws.getCell(rivi, a.sarjaIskemat(s)).value = {
        formula: KAAVAT.iskemat(alueViite),
        result: kirjattu ? laskettu.iskemat : '',
      }
      yhtSolut.push(solu(rivi, a.sarjaYht(s)))
    }

    ws.getCell(rivi, a.rikkeet).value = o ? o.rangaistuksia || 0 : null
    ws.getCell(rivi, a.hylatty).value = o?.hylatty ? 'x' : null
    ws.getCell(rivi, a.huom).value = o?.huom ?? null
    ws.getCell(rivi, a.tunnus).value = k?.id ?? null

    const rikeSolu = solu(rivi, a.rikkeet)
    const hylattySolu = solu(rivi, a.hylatty)
    const summa = maaritys.tulosSaanto === 'summa'
    const aloitettu = tulos !== undefined && tulos.aloitettu

    const tulosSolu = ws.getCell(rivi, a.tulos)
    tulosSolu.value = {
      formula: KAAVAT.tulos(yhtSolut, rikeSolu, hylattySolu, summa),
      result: aloitettu ? tulos.pisteet : '',
    }
    tulosSolu.font = { bold: true }

    /*
     * Iskemien ja napakymppien yhteismäärä.
     *
     * Summa-lajeissa se on suora summa. Parempi-sarja-lajeissa se otetaan siitä
     * sarjasta, jolla on enemmän pisteitä — sama logiikka kuin alkuperäisessä
     * Excelissä. Jos sarjoja on enemmän kuin kaksi (mahdollista vain muokatulla
     * rakenteella), kaavaa ei kirjoiteta vaan arvo jää staattiseksi; sovellus laskee
     * sen joka tapauksessa uudelleen tuonnissa.
     */
    const iskSolut = Array.from({ length: a.kilpasarjoja }, (_, s) => solu(rivi, a.sarjaIskemat(s)))
    const napaSolut = Array.from({ length: a.kilpasarjoja }, (_, s) => solu(rivi, a.sarjaNavat(s)))
    const iskemat = aloitettu ? tulos.peruste.iskemat : ''
    const navat = aloitettu ? tulos.peruste.navat : ''

    if (summa) {
      ws.getCell(rivi, a.iskemat).value = { formula: KAAVAT.yhteensa(iskSolut), result: iskemat }
      ws.getCell(rivi, a.navat).value = { formula: KAAVAT.yhteensa(napaSolut), result: navat }
    } else if (a.kilpasarjoja === 2) {
      const [yhtA = '', yhtB = ''] = yhtSolut
      const [iskA = '', iskB = ''] = iskSolut
      const [napaA = '', napaB = ''] = napaSolut
      ws.getCell(rivi, a.iskemat).value = {
        formula: KAAVAT.parempiSarjasta(yhtA, yhtB, iskA, iskB),
        result: iskemat,
      }
      ws.getCell(rivi, a.navat).value = {
        formula: KAAVAT.parempiSarjasta(yhtA, yhtB, napaA, napaB),
        result: navat,
      }
    } else {
      ws.getCell(rivi, a.iskemat).value = iskemat === '' ? null : iskemat
      ws.getCell(rivi, a.navat).value = navat === '' ? null : navat
    }
  }

  // Sarakeleveydet
  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 9
  ws.getColumn(6).width = 8
  for (let s = 0; s < a.kilpasarjoja; s++) {
    for (let i = 0; i < a.laukauksia(s); i++) ws.getColumn(a.laukausAlku(s) + i).width = 4.5
    ws.getColumn(a.sarjaYht(s)).width = 8
    ws.getColumn(a.sarjaNavat(s)).width = 6
    ws.getColumn(a.sarjaIskemat(s)).width = 6
  }
  ws.getColumn(a.tulos).width = 12
  ws.getColumn(a.iskemat).width = 9
  ws.getColumn(a.navat).width = 11
  ws.getColumn(a.rikkeet).width = 8
  ws.getColumn(a.hylatty).width = 8
  ws.getColumn(a.huom).width = 22
  // Tunnus on tekninen kenttä; piilotetaan mutta säilytetään tuontia varten.
  ws.getColumn(a.tunnus).width = 14
  ws.getColumn(a.tunnus).hidden = true

  /*
   * Pudotusvalikot vähentävät kirjoitusvirheitä hand-editoinnissa.
   *
   * Luokkavalikko jätetään pois, jos mukautetun kisan luokkanimissä on pilkku tai
   * lainausmerkki tai jos lista ei mahdu Excelin 255 merkkiin: valikko on pilkuilla
   * eroteltu merkkijono, joten sellainen nimi katkaisisi listan väärästä kohdasta ja
   * tarjoaisi arvoja joita kisassa ei ole. Ilman valikkoa solu on vapaata tekstiä, ja
   * tuonti lukee sen sellaisenaan.
   */
  const luokkaLista = konteksti.luokat.join(',')
  const luokkaValikko =
    konteksti.luokat.every((l) => !/["|,]/.test(l)) && luokkaLista.length <= 255
      ? luokkaLista
      : null

  const viimeinenRivi = ENSIMMAINEN_DATARIVI + riveja - 1
  for (let rivi = ENSIMMAINEN_DATARIVI; rivi <= viimeinenRivi; rivi++) {
    if (luokkaValikko) {
      ws.getCell(rivi, 6).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${luokkaValikko}"`],
      }
    }
    ws.getCell(rivi, a.hylatty).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"x"'],
    }
  }
}

function kirjoitaKisatiedot(wb: Workbook, kisa: Kisa) {
  const ws = wb.addWorksheet(KISATIEDOT_VALILEHTI)
  const t = kisa.kisatiedot

  ws.mergeCells(1, 1, 1, 3)
  const otsikko = ws.getCell(1, 1)
  otsikko.value = 'Kisatiedot'
  tyylitaOtsikko(otsikko, true)

  const parit: [string, string | number][] = [
    ['Kisan nimi', t.nimi],
    ['Järjestäjä', t.jarjestaja],
    ['Kilpailupaikka', t.paikka],
    ['Päivämäärä', t.pvm],
    ['Kilpailunjohtaja', t.kilpailunjohtaja],
    ['Tuomari', t.tuomari],
    ['Kirjuri', t.kirjuri],
    ['Laskettavat parhaat', kisa.asetukset.laskettavatParhaat],
    ['Yhdistyskilpailu', onJoukkuekilpailu(kisa.asetukset) ? 'Järjestetään' : 'Ei järjestetä'],
    ['Muistiinpanot', t.muistiinpanot],
  ]

  parit.forEach(([nimi, arvo], i) => {
    const rivi = i + 3
    const avain = ws.getCell(rivi, 1)
    avain.value = nimi
    avain.font = { bold: true }
    ws.getCell(rivi, 2).value = arvo === '' ? null : arvo
  })

  ws.getColumn(1).width = 22
  ws.getColumn(2).width = 40
}

function kirjoitaMeta(
  wb: Workbook,
  kisa: Kisa,
  aika: string,
  sivut: Map<string, { tuloskortti: string; sijoitukset: string }>,
) {
  const ws = wb.addWorksheet(META_VALILEHTI)

  const parit: [string, string | number][] = [
    ['tiedostoVersio', TIEDOSTO_VERSIO],
    ['sovellus', SOVELLUS_NIMI],
    // Versio tulee package.jsonista käännösaikana, ei käsin ylläpidettynä vakiona:
    // tiedostoon merkitty versio on juuri se tieto, jota vikaa selvitettäessä katsotaan.
    ['sovellusVersio', VERSIO],
    ['vientiAika', aika],
    ['kisaId', kisa.kisaId],
    ['kisaTyyppi', kisa.tyyppi],
    ['laskettavatParhaat', kisa.asetukset.laskettavatParhaat],
    // Kirjoitetaan aina, myös oletusarvo: muuten tuonti ei erota "ei järjestetty"
    // vanhemmalla versiolla tehdystä tiedostosta, jossa tietoa ei ollut lainkaan.
    ['joukkuekilpailu', onJoukkuekilpailu(kisa.asetukset) ? 'kylla' : 'ei'],
  ]

  /*
   * Mukautetun kisan lajit ja sarjat JSON-muodossa.
   *
   * Sarjat voivat olla eri mittaisia ja nimettyjä, joten sarakkeisiin perustuva taulukko
   * ei riitä. Olennaisin kenttä on `sivu`: se sitoo lajin sen välilehteen, jolloin tuonti
   * ei ole sivunimen varassa. Nimi on käyttäjän tekstiä ja se voi siistiytyä tai saada
   * numeropäätteen, joten nimen perusteella etsiminen olisi arvailua.
   */
  if (kisa.tyyppi === 'mukautettu') {
    const lajit = (kisa.lajit ?? []).map((l) => ({
      id: l.id,
      koodi: l.koodi,
      nimi: l.nimi,
      tulosSaanto: l.tulosSaanto,
      kilpasarjat: l.kilpasarjat,
      sivu: sivut.get(l.id)?.tuloskortti ?? '',
    }))
    parit.push(['lajitJson', JSON.stringify(lajit)])
    parit.push(['sarjatJson', JSON.stringify(kisa.sarjat ?? [])])
    parit.push(['luokatJson', JSON.stringify(kisa.luokat ?? [])])
  }
  parit.forEach(([avain, arvo], i) => {
    ws.getCell(i + 1, 1).value = avain
    ws.getCell(i + 1, 2).value = arvo
  })

  /*
   * Lajien rakenne talletetaan luettavassa muodossa, koska tuonti tarvitsee sen
   * tietääkseen mistä sarakkeista laukaukset luetaan.
   */
  const alkuRivi = parit.length + 2
  if (kisa.tyyppi === 'resul') {
    ;['laji', 'kilpasarjoja', 'laukauksiaSarjassa', 'tulosSaanto'].forEach((n, i) => {
      const c = ws.getCell(alkuRivi, i + 1)
      c.value = n
      c.font = { bold: true }
    })
    // RESUL-kisan rakennetaulukko: nämä ovat aina lajikoodit, eivät kisan lajilista.
    LAJI_KOODIT.forEach((laji, i) => {
      const m = kisa.asetukset.lajiMaaritykset[laji]
      const rivi = alkuRivi + 1 + i
      ws.getCell(rivi, 1).value = laji
      ws.getCell(rivi, 2).value = m.kilpasarjoja
      ws.getCell(rivi, 3).value = m.laukauksiaSarjassa
      ws.getCell(rivi, 4).value = m.tulosSaanto
    })
  }

  ws.getColumn(1).width = 22
  ws.getColumn(2).width = 26
  ws.getColumn(3).width = 20
  ws.getColumn(4).width = 14
  ws.state = 'hidden'
}

export interface VientiTulos {
  tiedostonimi: string
  tavut: ArrayBuffer
}

/** Tiedostonimi, joka kertoo kisan ja päivämäärän ja on turvallinen kaikilla alustoilla. */
export function vientiTiedostonimi(kisa: Kisa, aika: Date): string {
  const paiva = aika.toISOString().slice(0, 10)
  const nimi = (kisa.kisatiedot.nimi || 'reservilaisammunta')
    .toLowerCase()
    .replace(/[äå]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${nimi || 'reservilaisammunta'}-${paiva}.xlsx`
}

/**
 * Kirjoittaa koko kisan Excel-tiedostoksi.
 *
 * ExcelJS ladataan vasta tässä (~900 kB), jottei sovelluksen käynnistys hidastu.
 *
 * Kaavasoluille annetaan myös valmis arvo, jotta tiedosto on luettavissa ilman
 * uudelleenlaskentaa. ExcelJS jättää arvon kuitenkin kirjoittamatta, jos se on epätosi
 * (0 tai tyhjä teksti) — sen `_copyModel` testaa totuusarvon. Nollatulos jää siis
 * tiedostoon ilman valmista arvoa, ja Excel laskee sellaisen solun tiedostoa avatessa.
 */
export async function vieKisa(kisa: Kisa, nyt: Date = new Date()): Promise<VientiTulos> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = SOVELLUS_NIMI
  wb.created = nyt

  kirjoitaKisatiedot(wb, kisa)
  /*
   * Sivunimet johdetaan lajin koodista, joka on mukautetussa kisassa käyttäjän
   * kirjoittamaa tekstiä. Nimet varataan kerran ja välitetään mukana, jotta tuloskortti
   * ja sijoitukset osuvat samaan lajiin ja _meta voi kertoa tuonnille kumpi on kumpi.
   */
  const varatut = new Set<string>(
    [KISATIEDOT_VALILEHTI, YHDISTYKSET_VALILEHTI, META_VALILEHTI].map((n) => n.toLowerCase()),
  )
  const lajit = kisanLajit(kisa)
  const sivut = new Map<string, { tuloskortti: string; sijoitukset: string }>()
  for (const rakenne of lajit) {
    sivut.set(rakenne.id, {
      tuloskortti: uniikkiSivunNimi(tuloskorttiNimi(rakenne.koodi), varatut),
      sijoitukset: uniikkiSivunNimi(sijoituksetNimi(rakenne.koodi), varatut),
    })
  }

  /*
   * Lajikohtainen konteksti lasketaan kerran ja jaetaan kaikille kolmelle välilehdelle.
   * Sijoitus- ja yhdistyssivu viittaavat samoihin soluihin, joten rivimäärät ja
   * apusarakkeiden paikat eivät saa päätyä laskettavaksi kahteen kertaan.
   */
  const kontekstit = lajit.map((rakenne) => lajiKonteksti(kisa, rakenne, sivut.get(rakenne.id)!))

  for (const konteksti of kontekstit) kirjoitaTuloskortti(wb, konteksti)
  for (const konteksti of kontekstit) kirjoitaSijoitukset(wb, konteksti)
  kirjoitaYhdistykset(wb, kisa, kontekstit)
  kirjoitaMeta(wb, kisa, nyt.toISOString(), sivut)

  const tavut = await wb.xlsx.writeBuffer()
  return {
    tiedostonimi: vientiTiedostonimi(kisa, nyt),
    tavut: tavut as ArrayBuffer,
  }
}

/** Vain testejä varten: paljastaa apurit ilman erillistä tiedostoa. */
export const _sisaiset = { laukausSoluun, tyylitaOtsikko }
export type { Kilpailija, LuokkaId, Worksheet }
