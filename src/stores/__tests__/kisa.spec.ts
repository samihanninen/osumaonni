import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKisaStore } from '../kisa'
import { laskeLaji } from '@/core/laskenta'
import { LAJIT } from '@/core/lajit'

describe('kisa-store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('aloittaa tyhjästä kisasta, jolla on tunnus ja oletusasetukset', () => {
    const store = useKisaStore()
    expect(store.kisa.kilpailijat).toHaveLength(0)
    expect(store.kisa.kisaId).toMatch(/^[A-Z2-9]{8}$/)
    expect(store.kisa.asetukset.laskettavatParhaat).toBe(3)
    expect(store.kisa.asetukset.lajiMaaritykset.RA2.kilpasarjoja).toBe(3)
  })

  it('lajimääritykset ovat kopio, joten muokkaus ei muuta vakioita', () => {
    const store = useKisaStore()
    store.asetaLajiMaaritys('RA1', { kilpasarjoja: 5 })
    expect(store.kisa.asetukset.lajiMaaritykset.RA1.kilpasarjoja).toBe(5)
    expect(LAJIT.RA1.kilpasarjoja).toBe(2)
  })

  it('lisää kilpailijan ja siistii välilyönnit', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({
      etunimi: '  Sanna ',
      sukunimi: ' Hakala ',
      yhdistys: ' Nupures ',
    })
    expect(k.etunimi).toBe('Sanna')
    expect(k.sukunimi).toBe('Hakala')
    expect(k.yhdistys).toBe('Nupures')
    expect(k.ikasarja).toBe('H')
    expect(store.kilpailijoita).toBe(1)
  })

  it('osallistuminen luodaan lajin rakenteen mukaisena', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })

    store.lisaaOsallistuminen(k.id, 'RA1')
    store.lisaaOsallistuminen(k.id, 'RA2', 'avoin')

    const ra1 = store.kilpailija(k.id)?.osallistumiset.RA1
    expect(ra1?.kilpasarjat).toHaveLength(2)
    expect(ra1?.kilpasarjat[0]?.laukaukset).toHaveLength(10)
    expect(ra1?.luokka).toBe('vakio')

    const ra2 = store.kilpailija(k.id)?.osallistumiset.RA2
    expect(ra2?.kilpasarjat).toHaveLength(3)
    expect(ra2?.kilpasarjat[0]?.laukaukset).toHaveLength(6)
    expect(ra2?.luokka).toBe('avoin')
  })

  it('sama laji ei lisäänny kahdesti eikä ylikirjoita tuloksia', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    store.asetaLaukaus(k.id, 'RA1', 0, 0, 10)
    store.lisaaOsallistuminen(k.id, 'RA1')
    expect(store.kilpailija(k.id)?.osallistumiset.RA1?.kilpasarjat[0]?.laukaukset[0]).toBe(10)
  })

  it('asetaLaukaus kirjaa arvon sekä muokkausajan ja laitteen', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    store.asetaLaukaus(k.id, 'RA1', 0, 3, '*')

    const sarja = store.kilpailija(k.id)?.osallistumiset.RA1?.kilpasarjat[0]
    expect(sarja?.laukaukset[3]).toBe('*')
    expect(sarja?.muokattu).toBeTruthy()
    expect(sarja?.laiteId).toBeTruthy()
  })

  it('asetaLaukaus ei kirjoita sarjan ulkopuolelle', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    store.asetaLaukaus(k.id, 'RA1', 0, 99, 10)
    store.asetaLaukaus(k.id, 'RA1', 0, -1, 10)
    const laukaukset = store.kilpailija(k.id)?.osallistumiset.RA1?.kilpasarjat[0]?.laukaukset
    expect(laukaukset).toHaveLength(10)
    expect(laukaukset?.every((l) => l === null)).toBe(true)
  })

  it('tyhjentää kilpasarjan', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    store.asetaLaukaus(k.id, 'RA1', 0, 0, 9)
    store.tyhjennaKilpasarja(k.id, 'RA1', 0)
    const laukaukset = store.kilpailija(k.id)?.osallistumiset.RA1?.kilpasarjat[0]?.laukaukset
    expect(laukaukset?.every((l) => l === null)).toBe(true)
  })

  it('rakenteen kasvattaminen säilyttää kirjatut laukaukset', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA2') // 3 × 6
    store.asetaLaukaus(k.id, 'RA2', 0, 0, 10)

    store.asetaLajiMaaritys('RA2', { laukauksiaSarjassa: 10, kilpasarjoja: 4 })

    const o = store.kilpailija(k.id)?.osallistumiset.RA2
    expect(o?.kilpasarjat).toHaveLength(4)
    expect(o?.kilpasarjat[0]?.laukaukset).toHaveLength(10)
    expect(o?.kilpasarjat[0]?.laukaukset[0]).toBe(10)
    expect(o?.kilpasarjat[3]?.laukaukset).toHaveLength(10)
  })

  it('rakenteen pienentäminen katkaisee sarjat oikeaan mittaan', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1') // 2 × 10
    store.asetaLaukaus(k.id, 'RA1', 1, 9, 10)

    store.asetaLajiMaaritys('RA1', { kilpasarjoja: 1, laukauksiaSarjassa: 5 })

    const o = store.kilpailija(k.id)?.osallistumiset.RA1
    expect(o?.kilpasarjat).toHaveLength(1)
    expect(o?.kilpasarjat[0]?.laukaukset).toHaveLength(5)
  })

  it('oletusrakenteiden palautus korjaa muokatun rakenteen', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA2')
    store.asetaLajiMaaritys('RA2', { kilpasarjoja: 1, laukauksiaSarjassa: 3 })
    store.palautaOletusRakenteet()

    expect(store.kisa.asetukset.lajiMaaritykset.RA2.kilpasarjoja).toBe(3)
    const o = store.kilpailija(k.id)?.osallistumiset.RA2
    expect(o?.kilpasarjat).toHaveLength(3)
    expect(o?.kilpasarjat[0]?.laukaukset).toHaveLength(6)
  })

  it('poistaa osallistumisen tuloksineen mutta jättää kilpailijan', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    store.poistaOsallistuminen(k.id, 'RA1')
    expect(store.kilpailija(k.id)?.osallistumiset.RA1).toBeUndefined()
    expect(store.kilpailijoita).toBe(1)
  })

  it('yhdistysehdotukset ovat uniikkeja ja järjestyksessä', () => {
    const store = useKisaStore()
    store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'A', yhdistys: 'Nupures' })
    store.lisaaKilpailija({ etunimi: 'B', sukunimi: 'B', yhdistys: 'KaRes' })
    store.lisaaKilpailija({ etunimi: 'C', sukunimi: 'C', yhdistys: 'Nupures' })
    store.lisaaKilpailija({ etunimi: 'D', sukunimi: 'D', yhdistys: '' })
    expect(store.yhdistysEhdotukset).toEqual(['KaRes', 'Nupures'])
  })

  it('laskee osallistujat ja valmiit lajikohtaisesti', () => {
    const store = useKisaStore()
    const a = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'A', yhdistys: 'X' })
    const b = store.lisaaKilpailija({ etunimi: 'B', sukunimi: 'B', yhdistys: 'X' })
    store.lisaaOsallistuminen(a.id, 'RA1')
    store.lisaaOsallistuminen(b.id, 'RA1')

    expect(store.osallistujia('RA1')).toBe(2)
    expect(store.osallistujia('RA2')).toBe(0)
    expect(store.valmiita('RA1')).toBe(0)

    // Täytetään A:n kaikki 20 laukausta.
    for (let sarja = 0; sarja < 2; sarja++) {
      for (let i = 0; i < 10; i++) store.asetaLaukaus(a.id, 'RA1', sarja, i, 8)
    }
    expect(store.valmiita('RA1')).toBe(1)
  })

  it('rangaistukset ja hylkäys vaikuttavat laskettuun tulokseen', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    for (let i = 0; i < 10; i++) store.asetaLaukaus(k.id, 'RA1', 0, i, 10)

    const maaritys = store.kisa.asetukset.lajiMaaritykset.RA1
    const osallistuminen = () => store.kilpailija(k.id)!.osallistumiset.RA1!

    expect(laskeLaji('RA1', maaritys, osallistuminen()).pisteet).toBe(100)

    store.asetaRangaistukset(k.id, 'RA1', 2)
    expect(laskeLaji('RA1', maaritys, osallistuminen()).pisteet).toBe(96)

    store.asetaHylatty(k.id, 'RA1', true)
    expect(laskeLaji('RA1', maaritys, osallistuminen()).pisteet).toBe(0)
  })

  it('rangaistusten määrä ei voi olla negatiivinen', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    store.asetaRangaistukset(k.id, 'RA1', -5)
    expect(store.kilpailija(k.id)?.osallistumiset.RA1?.rangaistuksia).toBe(0)
  })

  it('aloitaUusi tyhjentää kisan ja antaa uuden tunnuksen', () => {
    const store = useKisaStore()
    const vanhaId = store.kisa.kisaId
    store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.aloitaUusi()
    expect(store.kilpailijoita).toBe(0)
    expect(store.kisa.kisaId).not.toBe(vanhaId)
  })
})
