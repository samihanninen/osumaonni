import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ExcelJS from 'exceljs'
import { useKisaStore } from '@/stores/kisa'
import { vieKisa, vientiTiedostonimi } from '../xlsxVienti'
import { tuoKisa, TuontiVirhe } from '../xlsxTuonti'
import {
  luoAsettelu,
  puhdistaSivunNimi,
  sarakeKirjain,
  sijoituksetNimi,
  tuloskorttiNimi,
  uniikkiSivunNimi,
  META_VALILEHTI,
  OTSIKKO_RIVI,
} from '../xlsxAsettelu'
import { kisanLajit, LAJIT, LUOKAT, LUOKKA_NIMET, resulRakenne } from '@/core/lajit'
import { sijoitukset } from '@/core/sijoitukset'
import { yhdistysYhteistulos } from '@/core/yhdistykset'
import { kokonaiskilpailu, RESUL_TASATULOKSEN_RATKAISIJA } from '@/core/kokonaiskilpailu'
import { laskeLaji } from '@/core/laskenta'
import { VERSIO } from '@/core/versio'
import type { Kisa } from '@/types/kisa'

function rakennaKisa() {
  const store = useKisaStore()
  store.kisa.kisatiedot.nimi = 'Nupureksen mestaruuskilpailut'
  store.kisa.kisatiedot.jarjestaja = 'Nummi-Pusulan Reserviläiset ry'
  store.kisa.kisatiedot.paikka = 'Hyvinkää'
  store.kisa.kisatiedot.pvm = '15.6.2026'

  // RA1 (2 × 10, parempi sarja) — napakymppejä, ohilaukauksia ja rangaistus.
  const sanna = store.lisaaKilpailija({
    etunimi: 'Sanna',
    sukunimi: 'Hakala',
    yhdistys: 'Nupures',
  })
  store.lisaaOsallistuminen(sanna.id, 'RA1', 'vakio')
  const ra1 = ['*', 2, '*', 10, 9, 8, '-', 7, 6, 5] as const
  ra1.forEach((v, i) => store.asetaLaukaus(sanna.id, 'RA1', 0, i, v))
  for (let i = 0; i < 10; i++) store.asetaLaukaus(sanna.id, 'RA1', 1, i, 4)
  store.asetaRangaistukset(sanna.id, 'RA1', 1)

  // RA2 (3 × 6, summa) samalle kilpailijalle — testaa myös roolin yhdistämisen.
  store.lisaaOsallistuminen(sanna.id, 'RA2', 'avoin')
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 6; i++) store.asetaLaukaus(sanna.id, 'RA2', s, i, 7 + s)
  }

  // Toinen kilpailija, eri yhdistys ja ikäsarja, hylätty.
  const aada = store.lisaaKilpailija({
    etunimi: 'Aada',
    sukunimi: 'Ahonen',
    yhdistys: 'KaRes',
    ikasarja: 'H50',
  })
  store.lisaaOsallistuminen(aada.id, 'RA1', 'avoin')
  for (let i = 0; i < 10; i++) store.asetaLaukaus(aada.id, 'RA1', 0, i, 10)
  store.asetaHylatty(aada.id, 'RA1', true)
  store.asetaHuomio(aada.id, 'RA1', 'Vahingonlaukaus')

  // Kolmas, joka osallistuu vain RA3:een.
  const kalevi = store.lisaaKilpailija({
    etunimi: 'Kalevi',
    sukunimi: 'Keilaaja',
    yhdistys: 'Nupures',
  })
  store.lisaaOsallistuminen(kalevi.id, 'RA3')
  for (let i = 0; i < 10; i++) store.asetaLaukaus(kalevi.id, 'RA3', 0, i, 6)

  return { store, sanna, aada, kalevi }
}

async function kierrata(kisa: Kisa) {
  const { tavut } = await vieKisa(kisa, new Date('2026-06-15T10:00:00Z'))
  return tuoKisa(tavut)
}

describe('sarakekirjaimet', () => {
  it('muuntaa numerot kirjaimiksi', () => {
    expect(sarakeKirjain(1)).toBe('A')
    expect(sarakeKirjain(26)).toBe('Z')
    expect(sarakeKirjain(27)).toBe('AA')
    expect(sarakeKirjain(52)).toBe('AZ')
    expect(sarakeKirjain(53)).toBe('BA')
  })
})

describe('asettelu seuraa lajin rakennetta', () => {
  it('RA1: kaksi kymmenen laukauksen lohkoa', () => {
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))
    expect(a.laukausAlku(0)).toBe(7)
    expect(a.laukausLoppu(0)).toBe(16)
    expect(a.sarjaYht(0)).toBe(17)
    expect(a.laukausAlku(1)).toBe(20)
    expect(a.laukausLoppu(1)).toBe(29)
  })

  it('RA2: kolme kuuden laukauksen lohkoa', () => {
    const a = luoAsettelu(resulRakenne('RA2', LAJIT.RA2))
    expect(a.laukausAlku(0)).toBe(7)
    expect(a.laukausLoppu(0)).toBe(12)
    expect(a.laukausAlku(1)).toBe(16)
    expect(a.laukausAlku(2)).toBe(25)
  })
})

describe('vienti', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('tiedostonimi sisältää kisan nimen ja päivän', () => {
    const { store } = rakennaKisa()
    const nimi = vientiTiedostonimi(store.kisa, new Date('2026-06-15T10:00:00Z'))
    expect(nimi).toBe('nupureksen-mestaruuskilpailut-2026-06-15.xlsx')
  })

  it('siistii ääkköset ja erikoismerkit tiedostonimestä', () => {
    const { store } = rakennaKisa()
    store.kisa.kisatiedot.nimi = 'Kesäkisa: Hyvinkää / 2026'
    const nimi = vientiTiedostonimi(store.kisa, new Date('2026-06-15T10:00:00Z'))
    expect(nimi).toBe('kesakisa-hyvinkaa-2026-2026-06-15.xlsx')
    expect(nimi).toMatch(/^[a-z0-9-]+\.xlsx$/)
  })

  it('luo odotetut välilehdet', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)

    const nimet = wb.worksheets.map((w) => w.name)
    expect(nimet).toContain('Kisatiedot')
    expect(nimet).toContain('Tuloskortti RA1')
    expect(nimet).toContain('Tuloskortti RA4')
    expect(nimet).toContain('Sijoitukset RA1')
    expect(nimet).toContain('Yhdistykset')
    expect(nimet).toContain(META_VALILEHTI)
  })

  it('tuloskortin johdetut sarakkeet ovat aitoja kaavoja', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)

    const ws = wb.getWorksheet(tuloskorttiNimi('RA1'))!
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))
    // Ahonen on ensimmäinen sukunimen mukaan.
    const rivi = 4

    const yht = ws.getCell(rivi, a.sarjaYht(0))
    expect(yht.formula).toContain('SUMIF')
    expect(yht.formula).toContain('COUNTIF')

    const tulos = ws.getCell(rivi, a.tulos)
    expect(tulos.formula).toContain('IF(')
    // Rangaistus ja hylkäys ovat mukana kaavassa, eivät vain valmiissa luvussa.
    expect(tulos.formula).toContain('-2*N(')
    expect(tulos.formula).toContain('="x"')
  })

  it('kaavoihin talletetaan myös laskettu arvo, jotta luku onnistuu ilman Exceliä', async () => {
    const { store, sanna } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)

    const ws = wb.getWorksheet(tuloskorttiNimi('RA1'))!
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))
    const odotettu = laskeLaji('RA1', LAJIT.RA1, sanna.osallistumiset.RA1!)

    // Hakala on toinen rivi (Ahonen ensin).
    const rivi = 5
    expect(ws.getCell(rivi, 2).value).toBe('Hakala')
    expect(ws.getCell(rivi, a.sarjaYht(0)).result).toBe(odotettu.sarjat[0]!.pisteet)
    expect(ws.getCell(rivi, a.tulos).result).toBe(odotettu.pisteet)
  })

  it('napakymppi ja ohilaukaus kirjoitetaan merkkeinä', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)

    const ws = wb.getWorksheet(tuloskorttiNimi('RA1'))!
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))
    const rivi = 5 // Hakala
    expect(ws.getCell(rivi, a.laukausAlku(0)).value).toBe('*')
    expect(ws.getCell(rivi, a.laukausAlku(0) + 1).value).toBe(2)
    expect(ws.getCell(rivi, a.laukausAlku(0) + 6).value).toBe('-')
  })
})

/**
 * Sijoitussivu lasketaan Excelissä kaavoilla tuloskortin soluista, joten sen on
 * kestettävä juuri ne tapaukset, joissa käsin tehty korjaus muuttaa järjestystä.
 */
describe('tuloskortin kaavat', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('laskee napakympit vain tähdistä, ei ohilaukauksista', async () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'Matti', sukunimi: 'Virtanen', yhdistys: 'X' })
    store.lisaaOsallistuminen(k.id, 'RA1', 'vakio')
    // Yksi kasi ja yhdeksän ohilaukausta: 8 pistettä, ei yhtään napakymppiä.
    store.asetaLaukaus(k.id, 'RA1', 0, 0, 8)
    for (let i = 1; i < 10; i++) store.asetaLaukaus(k.id, 'RA1', 0, i, '-')

    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)
    const ws = wb.getWorksheet(tuloskorttiNimi('RA1'))!
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))

    /*
     * Tähti on COUNTIFin jokerimerkki. Ilman tildeä kaava laski jokaisen ohilaukauksen
     * napakympiksi, jolloin rivin tulos oli 98 eikä 8 — ja vika tuli näkyviin vasta kun
     * tiedosto avattiin Excelissä ja kaavat laskettiin uudelleen.
     */
    for (const sarake of [a.sarjaYht(0), a.sarjaNavat(0), a.sarjaIskemat(0)]) {
      const kaava = (ws.getCell(4, sarake).value as { formula: string }).formula
      expect(kaava).toContain('"~*"')
      expect(kaava).not.toMatch(/,\s*"\*"/)
    }

    expect(ws.getCell(4, a.sarjaYht(0)).result).toBe(8)
    expect(ws.getCell(4, a.sarjaNavat(0)).result).toBe(0)
    expect(ws.getCell(4, a.sarjaIskemat(0)).result).toBe(1)
  })

  it('kirjoittaa vararivit kaavoineen käsin lisättäviä ampujia varten', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)
    const ws = wb.getWorksheet(tuloskorttiNimi('RA1'))!
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))

    // RA1:ssä on kaksi osallistujaa (rivit 4–5), joten rivi 6 on ensimmäinen vararivi.
    const vararivi = ws.getCell(6, a.tulos).value as { formula: string }
    expect(vararivi.formula).toContain('MAX')
    expect(ws.getCell(6, 2).value).toBeNull()
  })
})

describe('sijoitussivu seuraa tuloskorttia', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function sijoitusSivu() {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)
    return { store, ws: wb.getWorksheet(sijoituksetNimi('RA1'))! }
  }

  it('koostuu kaavoista, jotka viittaavat tuloskorttiin', async () => {
    const { ws } = await sijoitusSivu()

    const sukunimi = ws.getCell(4, 3).value as { formula: string }
    expect(sukunimi.formula).toContain('INDEX')
    expect(sukunimi.formula).toContain(`'${tuloskorttiNimi('RA1')}'!`)
  })

  it('näyttää samat sijat kuin sovelluksen sijoituslaskenta', async () => {
    const { store, ws } = await sijoitusSivu()

    const odotus = LUOKAT.flatMap((luokka) =>
      sijoitukset(store.kisa.kilpailijat, 'RA1', luokka, resulRakenne('RA1', LAJIT.RA1)),
    )

    odotus.forEach((r, i) => {
      const rivi = 4 + i
      expect(ws.getCell(rivi, 1).result).toBe(LUOKKA_NIMET[r.tulos.luokka])
      // Hylätty ei kilpaile sijoituksista, joten sijaluvun paikalla on viiva.
      expect(String(ws.getCell(rivi, 2).result)).toBe(r.sija === 0 ? '—' : String(r.sija))
      expect(ws.getCell(rivi, 3).result).toBe(r.kilpailija.sukunimi)
    })
  })

  it('piilottaa järjestyksen laskevat apusarakkeet', async () => {
    const { ws } = await sijoitusSivu()

    // Näkyvä taulukko: 6 perussaraketta + 2 kilpasarjaa + tulos, iskemät ja napakympit.
    const apuAlku = 6 + 2 + 3 + 2
    expect(ws.getColumn(apuAlku).hidden).toBe(true)
    expect(ws.getCell(OTSIKKO_RIVI, apuAlku).value).toBe('_luokka')
  })
})

/**
 * Yhdistyssivu lasketaan kaavoilla tuloskorteilta, joten sen on kestettävä samat käsin
 * tehdyt korjaukset kuin sijoitussivunkin.
 */
describe('yhdistyssivu seuraa tuloskortteja', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /**
   * Solun näkyvä sisältö: kaavasolusta luetaan talletettu tulos.
   *
   * ExcelJS ei kirjoita kaavan valmista arvoa, jos se on epätosi (0 tai tyhjä) — sen
   * `_copyModel` testaa totuusarvon. Nollatulos näkyy siis tässä tyhjänä, vaikka kaava
   * laskee sen oikein; Excel laskee arvottomat kaavasolut tiedostoa avatessa.
   */
  function arvo(solu: ExcelJS.Cell): string {
    const v = solu.value
    if (v && typeof v === 'object' && 'formula' in v) {
      return String((v as { result?: unknown }).result ?? '')
    }
    return String(v ?? '')
  }

  /**
   * Yhden lohkon datarivit. Lohko alkaa väliotsikosta, jonka jälkeen tulee otsikkorivi;
   * data loppuu ensimmäiseen riviin, jolla toinen sarake on tyhjä (varapaikat).
   */
  function lohko(ws: ExcelJS.Worksheet, otsikko: string, sarakkeita: number): string[][] {
    let alku = 0
    for (let r = 1; r <= ws.rowCount; r++) {
      if (arvo(ws.getCell(r, 1)) === otsikko) {
        alku = r + 2
        break
      }
    }
    expect(alku, `lohkoa "${otsikko}" ei löytynyt`).toBeGreaterThan(0)

    const rivit: string[][] = []
    for (let r = alku; r <= ws.rowCount; r++) {
      if (arvo(ws.getCell(r, 2)) === '') break
      rivit.push(Array.from({ length: sarakkeita }, (_, i) => arvo(ws.getCell(r, i + 1))))
    }
    return rivit
  }

  async function vieYhdistykset(kisa: Kisa) {
    const { tavut } = await vieKisa(kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)
    return wb.getWorksheet('Yhdistykset')!
  }

  it('koostuu kaavoista, jotka viittaavat sijoitussivun apusarakkeisiin', async () => {
    const { store } = rakennaKisa()
    const ws = await vieYhdistykset(store.kisa)

    const kaavat: string[] = []
    ws.eachRow((rivi) =>
      rivi.eachCell((c) => {
        const v = c.value
        if (v && typeof v === 'object' && 'formula' in v && v.formula) kaavat.push(v.formula)
      }),
    )

    // Kaikki luvut johdetaan sijoitussivujen apusarakkeista, ei kirjoiteta vakioina.
    expect(kaavat.some((k) => k.includes("'Sijoitukset RA1'!"))).toBe(true)
    expect(kaavat.some((k) => k.includes('SUMIFS'))).toBe(true)
    expect(kaavat.some((k) => k.includes('INDEX'))).toBe(true)
  })

  it('yhteistulos vastaa sovelluksen yhdistyslaskentaa', async () => {
    const { store } = rakennaKisa()
    const ws = await vieYhdistykset(store.kisa)
    const lajit = kisanLajit(store.kisa)
    const parhaita = store.kisa.asetukset.laskettavatParhaat

    const odotus = yhdistysYhteistulos(store.kisa.kilpailijat, lajit, { parhaita }).map((r) => [
      String(r.sija),
      r.yhdistys,
      ...lajit.map((l) => String(r.lajipisteet[l.id] || '')),
      String(r.pisteet),
    ])

    expect(lohko(ws, 'Yhteistulos', 3 + lajit.length)).toEqual(odotus)
  })

  it('kokonaiskilpailu vastaa sovelluksen laskentaa', async () => {
    const { store } = rakennaKisa()
    const ws = await vieYhdistykset(store.kisa)
    const lajit = kisanLajit(store.kisa)

    const odotus = kokonaiskilpailu(store.kisa.kilpailijat, lajit, {
      tasatuloksenRatkaisija: RESUL_TASATULOKSEN_RATKAISIJA,
    }).map((r) => [
      String(r.sija),
      r.kilpailija.sukunimi,
      r.kilpailija.etunimi,
      r.kilpailija.yhdistys,
      // Nolla näkyy tyhjänä, ks. arvo():n selite ExcelJS:n rajoitteesta.
      ...lajit.map((l) => String(r.lajipisteet[l.id] || '')),
      String(r.pisteet || ''),
      String(r.lajeja),
    ])

    expect(lohko(ws, 'Kokonaiskilpailu — henkilökohtainen', 6 + lajit.length)).toEqual(odotus)
  })

  it('hylätty ei kerrytä yhdistyspisteitä mutta pysyy kokonaiskilpailussa nollalla', async () => {
    const { store, aada } = rakennaKisa()
    const ws = await vieYhdistykset(store.kisa)
    const lajit = kisanLajit(store.kisa)

    // Aada on hylätty RA1:ssä, joten KaRes ei saa siitä pisteitä.
    const ra1 = lohko(ws, 'RA1 — Kivääriammunta makuulta', 5)
    expect(ra1.map((r) => r[1])).not.toContain(aada.yhdistys)

    const kokonais = lohko(ws, 'Kokonaiskilpailu — henkilökohtainen', 6 + lajit.length)
    const rivi = kokonais.find((r) => r[1] === aada.sukunimi)
    expect(rivi, 'hylätyn pitää näkyä kokonaiskilpailussa').toBeDefined()
    // Hylätty laji on silti ammuttu: se lasketaan lajimäärään nollan pisteen arvoisena.
    expect(rivi?.[5 + lajit.length]).toBe('1')
  })

  it('ilman joukkuekilpailua yhdistystaulukoita ei kirjoiteta', async () => {
    const { store } = rakennaKisa()
    store.kisa.asetukset.joukkuekilpailu = false
    const ws = await vieYhdistykset(store.kisa)

    const tekstit: string[] = []
    ws.eachRow((rivi) => rivi.eachCell((c) => tekstit.push(arvo(c))))
    expect(tekstit).not.toContain('Yhteistulos')
    expect(tekstit).toContain('Kokonaiskilpailu — henkilökohtainen')
  })
})

describe('kierros: vienti → tuonti', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('säilyttää kisatiedot', async () => {
    const { store } = rakennaKisa()
    const { kisa } = await kierrata(store.kisa)
    expect(kisa.kisatiedot.nimi).toBe('Nupureksen mestaruuskilpailut')
    expect(kisa.kisatiedot.jarjestaja).toBe('Nummi-Pusulan Reserviläiset ry')
    expect(kisa.kisatiedot.paikka).toBe('Hyvinkää')
    expect(kisa.kisatiedot.pvm).toBe('15.6.2026')
  })

  it('säilyttää kisan tunnuksen ja asetukset', async () => {
    const { store } = rakennaKisa()
    store.asetaLaskettavatParhaat(4)
    const { kisa } = await kierrata(store.kisa)
    expect(kisa.kisaId).toBe(store.kisa.kisaId)
    expect(kisa.asetukset.laskettavatParhaat).toBe(4)
  })

  /*
   * Ilman tätä tiedostoon vietäisiin "ei järjestetä", mutta tuonti palauttaisi
   * yhdistyskilpailun päälle — ja tuloksiin ilmestyisi kilpailu jota ei ollut.
   */
  it('säilyttää tiedon siitä ettei yhdistyskilpailua järjestetä', async () => {
    const { store } = rakennaKisa()
    store.asetaJoukkuekilpailu(false)
    const { kisa } = await kierrata(store.kisa)
    expect(kisa.asetukset.joukkuekilpailu).toBe(false)
  })

  it('vanha tiedosto ilman tietoa tulkitaan järjestetyksi', async () => {
    const { store } = rakennaKisa()
    const { kisa } = await kierrata(store.kisa)
    expect(kisa.asetukset.joukkuekilpailu).toBe(true)
  })

  it('yhdistää saman kilpailijan lajit yhdeksi kilpailijaksi', async () => {
    const { store } = rakennaKisa()
    const { kisa, kilpailijoita } = await kierrata(store.kisa)

    expect(kilpailijoita).toBe(3)
    const sanna = kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    // Hakala esiintyy sekä RA1- että RA2-välilehdellä, mutta on yksi kilpailija.
    expect(Object.keys(sanna.osallistumiset).sort()).toEqual(['RA1', 'RA2'])
  })

  it('säilyttää laukaukset merkkeineen', async () => {
    const { store } = rakennaKisa()
    const { kisa } = await kierrata(store.kisa)

    const sanna = kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    const laukaukset = sanna.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset
    expect(laukaukset).toEqual(['*', 2, '*', 10, 9, 8, '-', 7, 6, 5])
    expect(sanna.osallistumiset.RA1!.kilpasarjat[1]!.laukaukset.every((l) => l === 4)).toBe(true)
  })

  it('säilyttää lasketut tulokset identtisinä', async () => {
    const { store, sanna } = rakennaKisa()
    const ennen = laskeLaji('RA1', LAJIT.RA1, sanna.osallistumiset.RA1!)

    const { kisa } = await kierrata(store.kisa)
    const tuotu = kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    const jalkeen = laskeLaji('RA1', kisa.asetukset.lajiMaaritykset.RA1, tuotu.osallistumiset.RA1!)

    expect(jalkeen.pisteet).toBe(ennen.pisteet)
    expect(jalkeen.peruste.navat).toBe(ennen.peruste.navat)
    expect(jalkeen.peruste.iskemat).toBe(ennen.peruste.iskemat)
    expect(jalkeen.laskevaSarja).toBe(ennen.laskevaSarja)
  })

  it('säilyttää luokan, ikäsarjan, rangaistukset, hylkäyksen ja huomion', async () => {
    const { store } = rakennaKisa()
    const { kisa } = await kierrata(store.kisa)

    const sanna = kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    expect(sanna.osallistumiset.RA1!.luokka).toBe('vakio')
    expect(sanna.osallistumiset.RA2!.luokka).toBe('avoin')
    expect(sanna.osallistumiset.RA1!.rangaistuksia).toBe(1)

    const aada = kisa.kilpailijat.find((k) => k.sukunimi === 'Ahonen')!
    expect(aada.ikasarja).toBe('H50')
    expect(aada.osallistumiset.RA1!.hylatty).toBe(true)
    expect(aada.osallistumiset.RA1!.huom).toBe('Vahingonlaukaus')
  })

  it('säilyttää RA2:n kolmen sarjan rakenteen', async () => {
    const { store } = rakennaKisa()
    const { kisa } = await kierrata(store.kisa)

    const sanna = kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    const ra2 = sanna.osallistumiset.RA2!
    expect(ra2.kilpasarjat).toHaveLength(3)
    expect(ra2.kilpasarjat[0]!.laukaukset).toHaveLength(6)
    expect(ra2.kilpasarjat[2]!.laukaukset.every((l) => l === 9)).toBe(true)
  })

  it('säilyttää muokatun rakenteen', async () => {
    const { store } = rakennaKisa()
    store.asetaLajiMaaritys('RA3', { kilpasarjoja: 3, laukauksiaSarjassa: 5 })

    const { kisa } = await kierrata(store.kisa)
    expect(kisa.asetukset.lajiMaaritykset.RA3.kilpasarjoja).toBe(3)
    expect(kisa.asetukset.lajiMaaritykset.RA3.laukauksiaSarjassa).toBe(5)

    const kalevi = kisa.kilpailijat.find((k) => k.sukunimi === 'Keilaaja')!
    expect(kalevi.osallistumiset.RA3!.kilpasarjat).toHaveLength(3)
    expect(kalevi.osallistumiset.RA3!.kilpasarjat[0]!.laukaukset).toHaveLength(5)
  })

  it('on idempotentti: toinen kierros ei muuta mitään', async () => {
    const { store } = rakennaKisa()
    const ensimmainen = await kierrata(store.kisa)
    const toinen = await kierrata(ensimmainen.kisa)

    expect(toinen.kilpailijoita).toBe(ensimmainen.kilpailijoita)
    const a = ensimmainen.kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    const b = toinen.kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    expect(b.osallistumiset.RA1!.kilpasarjat).toEqual(a.osallistumiset.RA1!.kilpasarjat)
  })
})

describe('kierros: käsin tehdyt korjaukset', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** Muokkaa yhtä laukaussolua kuten järjestäjä tekisi Excelissä. */
  async function muokkaaJaTuo(tavut: ArrayBuffer, muokkaus: (ws: ExcelJS.Worksheet) => void) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)
    muokkaa(wb, muokkaus)
    const uudet = await wb.xlsx.writeBuffer()
    return tuoKisa(uudet as ArrayBuffer)
  }

  function muokkaa(wb: ExcelJS.Workbook, muokkaus: (ws: ExcelJS.Worksheet) => void) {
    muokkaus(wb.getWorksheet(tuloskorttiNimi('RA1'))!)
  }

  it('korjattu laukaus menee läpi ja tulos lasketaan uudelleen', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))

    // Hakala rivi 5: muutetaan toisen sarjan kaikki neloset kympeiksi.
    const tuotu = await muokkaaJaTuo(tavut, (ws) => {
      for (let i = 0; i < 10; i++) ws.getCell(5, a.laukausAlku(1) + i).value = 10
    })

    const sanna = tuotu.kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    const tulos = laskeLaji('RA1', LAJIT.RA1, sanna.osallistumiset.RA1!)
    // Toinen sarja on nyt 100, ja se on parempi; rangaistus −2 → 98.
    expect(tulos.laskevaSarja).toBe(1)
    expect(tulos.pisteet).toBe(98)
  })

  it('vanhentuneet johdetut sarakkeet eivät voi jäädä voimaan', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))

    // Rikotaan tarkoituksella välisumma. Tuonti ei saa käyttää sitä.
    const tuotu = await muokkaaJaTuo(tavut, (ws) => {
      ws.getCell(5, a.sarjaYht(0)).value = 999
      ws.getCell(5, a.tulos).value = 12345
    })

    const sanna = tuotu.kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    const tulos = laskeLaji('RA1', LAJIT.RA1, sanna.osallistumiset.RA1!)
    expect(tulos.pisteet).not.toBe(12345)
    // * 2 * 10 9 8 - 7 6 5 → 10+2+10+10+9+8+0+7+6+5 = 67
    expect(tulos.sarjat[0]!.pisteet).toBe(67)
  })

  it('käsin lisätty kilpailija ilman tunnusta luetaan uutena', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))

    const tuotu = await muokkaaJaTuo(tavut, (ws) => {
      const rivi = 7
      ws.getCell(rivi, 2).value = 'Uusi'
      ws.getCell(rivi, 3).value = 'Tulokas'
      ws.getCell(rivi, 4).value = 'FoRe'
      ws.getCell(rivi, 5).value = 'H'
      ws.getCell(rivi, 6).value = 'vakio'
      for (let i = 0; i < 10; i++) ws.getCell(rivi, a.laukausAlku(0) + i).value = 7
    })

    expect(tuotu.kilpailijoita).toBe(4)
    const uusi = tuotu.kisa.kilpailijat.find((k) => k.sukunimi === 'Uusi')!
    expect(uusi.etunimi).toBe('Tulokas')
    expect(uusi.yhdistys).toBe('FoRe')
    expect(laskeLaji('RA1', LAJIT.RA1, uusi.osallistumiset.RA1!).pisteet).toBe(70)
  })

  it('poistettu rivi poistaa osallistumisen', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)

    const tuotu = await muokkaaJaTuo(tavut, (ws) => {
      // Tyhjennetään Ahosen nimet riviltä 4.
      ws.getCell(4, 2).value = null
      ws.getCell(4, 3).value = null
    })

    expect(tuotu.kisa.kilpailijat.some((k) => k.sukunimi === 'Ahonen')).toBe(false)
  })

  it('kelvoton laukausarvo tulkitaan tyhjäksi eikä kaada tuontia', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const a = luoAsettelu(resulRakenne('RA1', LAJIT.RA1))

    const tuotu = await muokkaaJaTuo(tavut, (ws) => {
      ws.getCell(5, a.laukausAlku(0)).value = 'roskaa'
      ws.getCell(5, a.laukausAlku(0) + 1).value = 42
    })

    const sanna = tuotu.kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    const laukaukset = sanna.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset
    expect(laukaukset[0]).toBeNull()
    expect(laukaukset[1]).toBeNull()
  })
})

describe('tuonnin virhetilanteet', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('kelvoton tiedosto antaa selkeän virheen', async () => {
    const roska = new TextEncoder().encode('en ole xlsx').buffer
    await expect(tuoKisa(roska)).rejects.toThrow(TuontiVirhe)
  })

  it('ilman _meta-välilehteä tuonti kieltäytyy', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Tuloskortti RA1')
    const tavut = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    await expect(tuoKisa(tavut)).rejects.toThrow(/_meta/)
  })

  it('uudempi tiedostoversio hylätään selkeästi', async () => {
    const wb = new ExcelJS.Workbook()
    const meta = wb.addWorksheet(META_VALILEHTI)
    meta.getCell(1, 1).value = 'tiedostoVersio'
    meta.getCell(1, 2).value = 99
    wb.addWorksheet('Tuloskortti RA1')
    const tavut = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    await expect(tuoKisa(tavut)).rejects.toThrow(/uudemmalla sovellusversiolla/)
  })

  it('ilman tuloskortteja tuonti kieltäytyy', async () => {
    const wb = new ExcelJS.Workbook()
    const meta = wb.addWorksheet(META_VALILEHTI)
    meta.getCell(1, 1).value = 'tiedostoVersio'
    meta.getCell(1, 2).value = 1
    wb.addWorksheet('Jotain muuta')
    const tavut = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    await expect(tuoKisa(tavut)).rejects.toThrow(/Tuloskortti/)
  })
})

/*
 * Mukautetun kisan sarjanimet kulkevat tiedoston läpi sellaisenaan. Aiemmin tuonti
 * pakotti tunnistamattoman sarjan H:ksi, mikä olisi hukannut koko luokittelun — ja
 * juuri tiedostosta luettu sarja on se, jonka järjestäjä on saattanut korjata käsin.
 */
describe('mukautetun kisan sarjat tiedostossa', () => {
  it('säilyttää järjestäjän omat sarjanimet', async () => {
    const { store } = rakennaKisa()
    const sanna = store.kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    store.paivitaKilpailija(sanna.id, { ikasarja: 'Veteraanit' })

    const { kisa } = await kierrata(store.kisa)

    const tuotu = kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')
    expect(tuotu?.ikasarja).toBe('Veteraanit')
  })

  it('tyhjä sarja palautuu H:ksi eikä jää tyhjäksi', async () => {
    const { store } = rakennaKisa()
    const sanna = store.kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')!
    store.paivitaKilpailija(sanna.id, { ikasarja: '   ' })

    const { kisa } = await kierrata(store.kisa)

    const tuotu = kisa.kilpailijat.find((k) => k.sukunimi === 'Hakala')
    expect(tuotu?.ikasarja).toBe('H')
  })
})

/**
 * Excelin sivunimet mukautetussa kisassa.
 *
 * Lajikoodi on käyttäjän kirjoittamaa tekstiä, mutta Excelin sivunimi on enintään 31
 * merkkiä eikä siinä saa olla merkkejä `: \ / ? * [ ]`. Kielletty merkki saisi Excelin
 * hylkäämään koko tiedoston, joten nimi on siistittävä ennen kirjoittamista.
 */
describe('sivunimien rajoitukset', () => {
  it('poistaa Excelin kieltämät merkit', () => {
    expect(puhdistaSivunNimi('RA1/RA2')).toBe('RA1-RA2')
    expect(puhdistaSivunNimi('Kisa: [2026]')).toBe('Kisa- -2026-')
    expect(puhdistaSivunNimi('Miksi*tämä?')).toBe('Miksi-tämä-')
    expect(puhdistaSivunNimi('polku\\alku')).toBe('polku-alku')
  })

  it('katkaisee 31 merkkiin', () => {
    const pitka = 'Tämä on aivan liian pitkä lajin nimi Exceliin'
    expect(puhdistaSivunNimi(pitka)).toHaveLength(31)
  })

  it('tyhjästä tulee oletusnimi', () => {
    expect(puhdistaSivunNimi('')).toBe('Laji')
    expect(puhdistaSivunNimi('   ')).toBe('Laji')
    // Heittomerkki nimen reunassa ei kelpaa Excelille.
    expect(puhdistaSivunNimi("'Makuu'")).toBe('Makuu')
  })

  it('erottaa samannimiset lajit toisistaan', () => {
    const kaytetyt = new Set<string>()
    expect(uniikkiSivunNimi('Makuu', kaytetyt)).toBe('Makuu')
    expect(uniikkiSivunNimi('Makuu', kaytetyt)).toBe('Makuu (2)')
    // Excel vertaa nimiä kirjainkoosta riippumatta.
    expect(uniikkiSivunNimi('makuu', kaytetyt)).toBe('makuu (3)')
  })

  it('uniikki nimi pysyy 31 merkissä myös numeropäätteellä', () => {
    const kaytetyt = new Set<string>()
    const pitka = 'Kolmen asennon kisa pitkällä nimellä'
    uniikkiSivunNimi(pitka, kaytetyt)
    const toinen = uniikkiSivunNimi(pitka, kaytetyt)
    expect(toinen.length).toBeLessThanOrEqual(31)
    expect(toinen.endsWith('(2)')).toBe(true)
  })
})

/**
 * Mukautetun kisan vienti ja tuonti.
 *
 * Tuonti ei etsi välilehteä lajikoodin perusteella vaan `_meta`:n tallentaman nimen
 * mukaan: koodi on käyttäjän tekstiä ja nimi on voinut siistiytyä tai saada
 * numeropäätteen, joten arvaus osuisi väärään välilehteen tai ei mihinkään.
 */
describe('mukautettu kisa Excelissä', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function rakennaMukautettu() {
    const store = useKisaStore()
    store.asetaKisaTyyppi('mukautettu')
    store.kisa.kisatiedot.nimi = 'Kolmen asennon kisa'
    store.lisaaSarja('Veteraanit')

    const laji = store.lisaaMukautettuLaji({ koodi: '3-as', nimi: 'Kolme asentoa' })
    store.asetaKilpasarjat(laji.id, [
      { nimi: 'Makuu', laukauksia: 3 },
      { nimi: 'Polvi', laukauksia: 2 },
      { nimi: 'Pysty', laukauksia: 1 },
    ])

    const k = store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    store.paivitaKilpailija(k.id, { ikasarja: 'Veteraanit' })
    store.lisaaOsallistuminen(k.id, laji.id)
    store.asetaLaukaus(k.id, laji.id, 0, 0, 10)
    store.asetaLaukaus(k.id, laji.id, 0, 1, '*')
    store.asetaLaukaus(k.id, laji.id, 1, 0, 9)
    store.asetaLaukaus(k.id, laji.id, 2, 0, 8)

    return { store, lajiId: laji.id }
  }

  it('säilyttää kisan muodon ja lajin määrittelyn', async () => {
    const { store } = rakennaMukautettu()

    const { kisa } = await kierrata(store.kisa)

    expect(kisa.tyyppi).toBe('mukautettu')
    expect(kisa.lajit).toHaveLength(1)
    expect(kisa.lajit?.[0]?.koodi).toBe('3-as')
    expect(kisa.lajit?.[0]?.nimi).toBe('Kolme asentoa')
    expect(kisa.lajit?.[0]?.tulosSaanto).toBe('summa')
  })

  it('säilyttää eri mittaiset ja nimetyt sarjat', async () => {
    const { store } = rakennaMukautettu()

    const { kisa } = await kierrata(store.kisa)

    expect(kisa.lajit?.[0]?.kilpasarjat).toEqual([
      { nimi: 'Makuu', laukauksia: 3 },
      { nimi: 'Polvi', laukauksia: 2 },
      { nimi: 'Pysty', laukauksia: 1 },
    ])
  })

  it('säilyttää kirjatut laukaukset oikeissa sarjoissa', async () => {
    const { store, lajiId } = rakennaMukautettu()

    const { kisa } = await kierrata(store.kisa)

    const o = kisa.kilpailijat[0]?.osallistumiset[lajiId]
    expect(o?.kilpasarjat.map((s) => s.laukaukset)).toEqual([[10, '*', null], [9, null], [8]])
  })

  it('säilyttää kisan sarjat ja kilpailijan sarjan', async () => {
    const { store } = rakennaMukautettu()

    const { kisa } = await kierrata(store.kisa)

    expect(kisa.sarjat).toEqual(['Yleinen', 'Veteraanit'])
    expect(kisa.kilpailijat[0]?.ikasarja).toBe('Veteraanit')
  })

  /* Kielletty merkki koodissa ei saa estää vientiä eikä katkaista tuontia. */
  it('lajikoodin kielletyt merkit eivät riko tiedostoa', async () => {
    const { store, lajiId } = rakennaMukautettu()
    store.paivitaMukautettuLaji(lajiId, { koodi: '3/as:[x]' })

    const { kisa } = await kierrata(store.kisa)

    expect(kisa.lajit?.[0]?.koodi).toBe('3/as:[x]')
    expect(kisa.kilpailijat[0]?.osallistumiset[lajiId]?.kilpasarjat[0]?.laukaukset[0]).toBe(10)
  })

  /* Kaksi samannimistä lajia päätyy eri välilehdille eikä sekoitu keskenään. */
  it('samannimiset lajit pysyvät erillään', async () => {
    const { store, lajiId } = rakennaMukautettu()
    const toinen = store.lisaaMukautettuLaji({ koodi: '3-as', nimi: 'Kolme asentoa' })
    store.asetaKilpasarjat(toinen.id, [{ laukauksia: 2 }])
    const k = store.kisa.kilpailijat[0]!
    store.lisaaOsallistuminen(k.id, toinen.id)
    store.asetaLaukaus(k.id, toinen.id, 0, 0, 7)

    const { kisa } = await kierrata(store.kisa)

    expect(kisa.lajit).toHaveLength(2)
    const tuotu = kisa.kilpailijat[0]!
    expect(tuotu.osallistumiset[lajiId]?.kilpasarjat[0]?.laukaukset[0]).toBe(10)
    expect(tuotu.osallistumiset[toinen.id]?.kilpasarjat[0]?.laukaukset[0]).toBe(7)
  })
})

/*
 * Tiedostoon merkitty sovellusversio oli käsin ylläpidetty vakio ja jäänyt arvoon
 * 0.1.0, joten jokainen viety tiedosto väitti olevansa siitä versiosta. Se on juuri
 * se tieto, jota vikaa selvitettäessä katsotaan, joten se johdetaan nyt
 * package.jsonista samoin kuin sovelluksen alalaidassa näkyvä versio.
 */
describe('tiedostoon merkitty versio', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('on sovelluksen oikea versio', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)

    const ws = wb.getWorksheet(META_VALILEHTI)!
    const arvot = new Map<string, string>()
    ws.eachRow((rivi) => {
      arvot.set(String(rivi.getCell(1).value ?? ''), String(rivi.getCell(2).value ?? ''))
    })

    expect(arvot.get('sovellusVersio')).toBe(VERSIO)
    expect(arvot.get('sovellusVersio')).not.toBe('0.1.0')
    expect(arvot.get('sovellusVersio')).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

/*
 * Yhdistys- ja kokonaiskilpailu Excelissä mukautetussa kisassa.
 *
 * Nämä osiot laskettiin RESUL-lajeista, joten mukautetun kisan taulukot jäivät
 * tyhjiksi. Vika paljastui vasta kun lajilistan antaminen tehtiin pakolliseksi —
 * oletus RESUL-lajeihin oli piilottanut sen.
 */
describe('mukautetun kisan yhdistyssivu', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function vieMukautettu() {
    const store = useKisaStore()
    store.asetaKisaTyyppi('mukautettu')
    const laji = store.lisaaMukautettuLaji({ koodi: '3-as', nimi: 'Kolme asentoa' })
    store.asetaKilpasarjat(laji.id, [{ laukauksia: 2 }, { laukauksia: 2 }])

    const k = store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    store.lisaaOsallistuminen(k.id, laji.id)
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 2; i++) store.asetaLaukaus(k.id, laji.id, s, i, 10)
    }

    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)
    return wb.getWorksheet('Yhdistykset')!
  }

  /** Solun näkyvä sisältö: kaavasolusta luetaan talletettu tulos. */
  function teksti(arvo: unknown): string {
    if (arvo && typeof arvo === 'object' && 'formula' in arvo) {
      return String((arvo as { result?: unknown }).result ?? '')
    }
    return String(arvo ?? '')
  }

  function kaikkiTekstit(ws: ExcelJS.Worksheet): string[] {
    const tekstit: string[] = []
    ws.eachRow((rivi) => rivi.eachCell((c) => tekstit.push(teksti(c.value))))
    return tekstit
  }

  it('lajisarakkeet tulevat kisan omista lajeista', async () => {
    const ws = await vieMukautettu()

    const otsikot: string[] = []
    ws.getRow(5).eachCell((c) => otsikot.push(String(c.value ?? '')))
    expect(otsikot).toContain('3-as')
    expect(otsikot).not.toContain('RA1')
  })

  it('yhdistyksen tulos on mukana eikä taulukko jää tyhjäksi', async () => {
    const ws = await vieMukautettu()

    const tekstit = kaikkiTekstit(ws)
    expect(tekstit).toContain('Nupures')
    // 4 × 10 summana.
    expect(tekstit).toContain('40')
  })

  it('kokonaiskilpailu näyttää mukautetun kisan kilpailijan', async () => {
    const ws = await vieMukautettu()

    const tekstit = kaikkiTekstit(ws)
    expect(tekstit).toContain('Kokonaiskilpailu — henkilökohtainen')
    expect(tekstit).toContain('Hakala')
  })
})
