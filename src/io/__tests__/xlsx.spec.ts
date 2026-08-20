import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ExcelJS from 'exceljs'
import { useKisaStore } from '@/stores/kisa'
import { vieKisa, vientiTiedostonimi } from '../xlsxVienti'
import { tuoKisa, TuontiVirhe } from '../xlsxTuonti'
import { luoAsettelu, sarakeKirjain, tuloskorttiNimi, META_VALILEHTI } from '../xlsxAsettelu'
import { LAJIT } from '@/core/lajit'
import { laskeLaji } from '@/core/laskenta'
import type { Kisa } from '@/types/kisa'

function rakennaKisa() {
  const store = useKisaStore()
  store.kisa.kisatiedot.nimi = 'Nupureksen mestaruuskilpailut'
  store.kisa.kisatiedot.jarjestaja = 'Nummi-Pusulan Reserviläiset ry'
  store.kisa.kisatiedot.paikka = 'Hyvinkää'
  store.kisa.kisatiedot.pvm = '15.6.2026'

  // RA1 (2 × 10, parempi sarja) — napakymppejä, ohilaukauksia ja rangaistus.
  const sami = store.lisaaKilpailija({
    etunimi: 'Sami',
    sukunimi: 'Hänninen',
    yhdistys: 'Nupures',
  })
  store.lisaaOsallistuminen(sami.id, 'RA1', 'vakio')
  const ra1 = ['*', 2, '*', 10, 9, 8, '-', 7, 6, 5] as const
  ra1.forEach((v, i) => store.asetaLaukaus(sami.id, 'RA1', 0, i, v))
  for (let i = 0; i < 10; i++) store.asetaLaukaus(sami.id, 'RA1', 1, i, 4)
  store.asetaRangaistukset(sami.id, 'RA1', 1)

  // RA2 (3 × 6, summa) samalle kilpailijalle — testaa myös roolin yhdistämisen.
  store.lisaaOsallistuminen(sami.id, 'RA2', 'avoin')
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 6; i++) store.asetaLaukaus(sami.id, 'RA2', s, i, 7 + s)
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

  return { store, sami, aada, kalevi }
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
    const a = luoAsettelu(LAJIT.RA1)
    expect(a.laukausAlku(0)).toBe(7)
    expect(a.laukausLoppu(0)).toBe(16)
    expect(a.sarjaYht(0)).toBe(17)
    expect(a.laukausAlku(1)).toBe(20)
    expect(a.laukausLoppu(1)).toBe(29)
  })

  it('RA2: kolme kuuden laukauksen lohkoa', () => {
    const a = luoAsettelu(LAJIT.RA2)
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
    const a = luoAsettelu(LAJIT.RA1)
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
    const { store, sami } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)

    const ws = wb.getWorksheet(tuloskorttiNimi('RA1'))!
    const a = luoAsettelu(LAJIT.RA1)
    const odotettu = laskeLaji('RA1', LAJIT.RA1, sami.osallistumiset.RA1!)

    // Hänninen on toinen rivi (Ahonen ensin).
    const rivi = 5
    expect(ws.getCell(rivi, 2).value).toBe('Hänninen')
    expect(ws.getCell(rivi, a.sarjaYht(0)).result).toBe(odotettu.sarjat[0]!.pisteet)
    expect(ws.getCell(rivi, a.tulos).result).toBe(odotettu.pisteet)
  })

  it('napakymppi ja ohilaukaus kirjoitetaan merkkeinä', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(tavut)

    const ws = wb.getWorksheet(tuloskorttiNimi('RA1'))!
    const a = luoAsettelu(LAJIT.RA1)
    const rivi = 5 // Hänninen
    expect(ws.getCell(rivi, a.laukausAlku(0)).value).toBe('*')
    expect(ws.getCell(rivi, a.laukausAlku(0) + 1).value).toBe(2)
    expect(ws.getCell(rivi, a.laukausAlku(0) + 6).value).toBe('-')
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
    const sami = kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    // Hänninen esiintyy sekä RA1- että RA2-välilehdellä, mutta on yksi kilpailija.
    expect(Object.keys(sami.osallistumiset).sort()).toEqual(['RA1', 'RA2'])
  })

  it('säilyttää laukaukset merkkeineen', async () => {
    const { store } = rakennaKisa()
    const { kisa } = await kierrata(store.kisa)

    const sami = kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    const laukaukset = sami.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset
    expect(laukaukset).toEqual(['*', 2, '*', 10, 9, 8, '-', 7, 6, 5])
    expect(sami.osallistumiset.RA1!.kilpasarjat[1]!.laukaukset.every((l) => l === 4)).toBe(true)
  })

  it('säilyttää lasketut tulokset identtisinä', async () => {
    const { store, sami } = rakennaKisa()
    const ennen = laskeLaji('RA1', LAJIT.RA1, sami.osallistumiset.RA1!)

    const { kisa } = await kierrata(store.kisa)
    const tuotu = kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    const jalkeen = laskeLaji('RA1', kisa.asetukset.lajiMaaritykset.RA1, tuotu.osallistumiset.RA1!)

    expect(jalkeen.pisteet).toBe(ennen.pisteet)
    expect(jalkeen.peruste.navat).toBe(ennen.peruste.navat)
    expect(jalkeen.peruste.iskemat).toBe(ennen.peruste.iskemat)
    expect(jalkeen.laskevaSarja).toBe(ennen.laskevaSarja)
  })

  it('säilyttää luokan, ikäsarjan, rangaistukset, hylkäyksen ja huomion', async () => {
    const { store } = rakennaKisa()
    const { kisa } = await kierrata(store.kisa)

    const sami = kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    expect(sami.osallistumiset.RA1!.luokka).toBe('vakio')
    expect(sami.osallistumiset.RA2!.luokka).toBe('avoin')
    expect(sami.osallistumiset.RA1!.rangaistuksia).toBe(1)

    const aada = kisa.kilpailijat.find((k) => k.sukunimi === 'Ahonen')!
    expect(aada.ikasarja).toBe('H50')
    expect(aada.osallistumiset.RA1!.hylatty).toBe(true)
    expect(aada.osallistumiset.RA1!.huom).toBe('Vahingonlaukaus')
  })

  it('säilyttää RA2:n kolmen sarjan rakenteen', async () => {
    const { store } = rakennaKisa()
    const { kisa } = await kierrata(store.kisa)

    const sami = kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    const ra2 = sami.osallistumiset.RA2!
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
    const a = ensimmainen.kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    const b = toinen.kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
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
    const a = luoAsettelu(LAJIT.RA1)

    // Hänninen rivi 5: muutetaan toisen sarjan kaikki neloset kympeiksi.
    const tuotu = await muokkaaJaTuo(tavut, (ws) => {
      for (let i = 0; i < 10; i++) ws.getCell(5, a.laukausAlku(1) + i).value = 10
    })

    const sami = tuotu.kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    const tulos = laskeLaji('RA1', LAJIT.RA1, sami.osallistumiset.RA1!)
    // Toinen sarja on nyt 100, ja se on parempi; rangaistus −2 → 98.
    expect(tulos.laskevaSarja).toBe(1)
    expect(tulos.pisteet).toBe(98)
  })

  it('vanhentuneet johdetut sarakkeet eivät voi jäädä voimaan', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const a = luoAsettelu(LAJIT.RA1)

    // Rikotaan tarkoituksella välisumma. Tuonti ei saa käyttää sitä.
    const tuotu = await muokkaaJaTuo(tavut, (ws) => {
      ws.getCell(5, a.sarjaYht(0)).value = 999
      ws.getCell(5, a.tulos).value = 12345
    })

    const sami = tuotu.kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    const tulos = laskeLaji('RA1', LAJIT.RA1, sami.osallistumiset.RA1!)
    expect(tulos.pisteet).not.toBe(12345)
    // * 2 * 10 9 8 - 7 6 5 → 10+2+10+10+9+8+0+7+6+5 = 67
    expect(tulos.sarjat[0]!.pisteet).toBe(67)
  })

  it('käsin lisätty kilpailija ilman tunnusta luetaan uutena', async () => {
    const { store } = rakennaKisa()
    const { tavut } = await vieKisa(store.kisa)
    const a = luoAsettelu(LAJIT.RA1)

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
    const a = luoAsettelu(LAJIT.RA1)

    const tuotu = await muokkaaJaTuo(tavut, (ws) => {
      ws.getCell(5, a.laukausAlku(0)).value = 'roskaa'
      ws.getCell(5, a.laukausAlku(0) + 1).value = 42
    })

    const sami = tuotu.kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    const laukaukset = sami.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset
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
    const sami = store.kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    store.paivitaKilpailija(sami.id, { ikasarja: 'Veteraanit' })

    const { kisa } = await kierrata(store.kisa)

    const tuotu = kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')
    expect(tuotu?.ikasarja).toBe('Veteraanit')
  })

  it('tyhjä sarja palautuu H:ksi eikä jää tyhjäksi', async () => {
    const { store } = rakennaKisa()
    const sami = store.kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')!
    store.paivitaKilpailija(sami.id, { ikasarja: '   ' })

    const { kisa } = await kierrata(store.kisa)

    const tuotu = kisa.kilpailijat.find((k) => k.sukunimi === 'Hänninen')
    expect(tuotu?.ikasarja).toBe('H')
  })
})
