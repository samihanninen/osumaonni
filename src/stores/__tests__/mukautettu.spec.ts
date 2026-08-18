import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKisaStore } from '../kisa'
import { kisanLajit } from '@/core/lajit'
import { laskeLaji } from '@/core/laskenta'

/**
 * Mukautetun kisan lajien määrittely.
 *
 * Painopiste on siinä, ettei jo kirjattu tulos katoa huomaamatta: sarjojen lyhentäminen
 * ja lajin poisto ovat peruuttamattomia, ja käyttöliittymä voi varmistaa ne vain jos
 * store osaa kertoa menetyksen määrän etukäteen.
 */
describe('mukautetun kisan lajit', () => {
  let store: ReturnType<typeof useKisaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
    store.asetaKisaTyyppi('mukautettu')
  })

  it('uusi kisa on mukautettu ja aluksi ilman lajeja', () => {
    expect(store.kisa.tyyppi).toBe('mukautettu')
    expect(store.mukautetutLajit).toEqual([])
  })

  it('lisätty laji saa oman tunnuksen ja oletussarjan', () => {
    const laji = store.lisaaMukautettuLaji()

    expect(laji.id).toBeTruthy()
    expect(laji.kilpasarjat).toEqual([{ laukauksia: 10 }])
    expect(store.mukautetutLajit).toHaveLength(1)
  })

  /* Kolmen asennon kisa on koko ominaisuuden tarkoitus. */
  it('sarjat voivat olla nimettyjä ja eri mittaisia', () => {
    const laji = store.lisaaMukautettuLaji({ koodi: '3-as', nimi: 'Kolme asentoa' })
    store.asetaKilpasarjat(laji.id, [
      { nimi: 'Makuu', laukauksia: 10 },
      { nimi: 'Polvi', laukauksia: 10 },
      { nimi: 'Pysty', laukauksia: 5 },
    ])

    const rakenne = kisanLajit(store.kisa)[0]!
    expect(rakenne.kilpasarjat.map((s) => s.nimi)).toEqual(['Makuu', 'Polvi', 'Pysty'])
    expect(rakenne.kilpasarjat.map((s) => s.laukauksia)).toEqual([10, 10, 5])
  })

  it('osallistuminen luodaan lajin sarjojen mukaisena', () => {
    const laji = store.lisaaMukautettuLaji()
    store.asetaKilpasarjat(laji.id, [{ laukauksia: 3 }, { laukauksia: 5 }])
    const k = store.lisaaKilpailija({ etunimi: 'Sami', sukunimi: 'Hänninen', yhdistys: 'Nupures' })

    store.lisaaOsallistuminen(k.id, laji.id)

    const sarjat = store.kilpailija(k.id)?.osallistumiset[laji.id]?.kilpasarjat
    expect(sarjat?.map((s) => s.laukaukset.length)).toEqual([3, 5])
  })

  /* Molemmat tulossäännöt toimivat mukautetulla lajilla ilman muutoksia laskentaan. */
  it('summa laskee kaikki sarjat, paras vain parhaan', () => {
    const laji = store.lisaaMukautettuLaji({ tulosSaanto: 'summa' })
    store.asetaKilpasarjat(laji.id, [{ laukauksia: 2 }, { laukauksia: 2 }])
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, laji.id)
    store.asetaLaukaus(k.id, laji.id, 0, 0, 10)
    store.asetaLaukaus(k.id, laji.id, 0, 1, 10)
    store.asetaLaukaus(k.id, laji.id, 1, 0, 8)
    store.asetaLaukaus(k.id, laji.id, 1, 1, 8)

    const osallistuminen = store.kilpailija(k.id)!.osallistumiset[laji.id]!
    expect(laskeLaji(laji.id, { tulosSaanto: 'summa' }, osallistuminen).pisteet).toBe(36)
    expect(laskeLaji(laji.id, { tulosSaanto: 'paras' }, osallistuminen).pisteet).toBe(20)
  })

  describe('kirjattujen tulosten suojaaminen', () => {
    function lajiJossaTuloksia() {
      const laji = store.lisaaMukautettuLaji()
      store.asetaKilpasarjat(laji.id, [{ laukauksia: 3 }, { laukauksia: 3 }])
      const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
      store.lisaaOsallistuminen(k.id, laji.id)
      store.asetaLaukaus(k.id, laji.id, 0, 0, 10)
      store.asetaLaukaus(k.id, laji.id, 0, 2, 9)
      store.asetaLaukaus(k.id, laji.id, 1, 0, 8)
      return laji
    }

    it('kertoo montako laukausta on kirjattu', () => {
      const laji = lajiJossaTuloksia()
      expect(store.kirjattujaLaukauksia(laji.id)).toBe(3)
    })

    it('kertoo etukäteen montako laukausta lyhentäminen hävittäisi', () => {
      const laji = lajiJossaTuloksia()

      // Sarjat 3 → 1 laukausta: sarjan 1 kolmas laukaus (9) katoaa.
      expect(store.menetettavatLaukaukset(laji.id, [{ laukauksia: 1 }, { laukauksia: 3 }])).toBe(1)
      // Toinen sarja pois: sen ainoa kirjattu laukaus (8) katoaa.
      expect(store.menetettavatLaukaukset(laji.id, [{ laukauksia: 3 }])).toBe(1)
      // Pidentäminen ei hävitä mitään.
      expect(store.menetettavatLaukaukset(laji.id, [{ laukauksia: 9 }, { laukauksia: 9 }])).toBe(0)
    })

    it('lyhentäminen katkaisee sarjan lopusta ja säilyttää alun', () => {
      const laji = lajiJossaTuloksia()
      const k = store.kisa.kilpailijat[0]!

      store.asetaKilpasarjat(laji.id, [{ laukauksia: 1 }, { laukauksia: 3 }])

      expect(k.osallistumiset[laji.id]?.kilpasarjat[0]?.laukaukset).toEqual([10])
    })

    it('pidentäminen lisää tyhjiä eikä kosketa kirjattuihin', () => {
      const laji = lajiJossaTuloksia()
      const k = store.kisa.kilpailijat[0]!

      store.asetaKilpasarjat(laji.id, [{ laukauksia: 5 }, { laukauksia: 3 }])

      expect(k.osallistumiset[laji.id]?.kilpasarjat[0]?.laukaukset).toEqual([
        10,
        null,
        9,
        null,
        null,
      ])
    })

    it('lajin poisto poistaa myös sen tulokset', () => {
      const laji = lajiJossaTuloksia()
      const k = store.kisa.kilpailijat[0]!

      store.poistaMukautettuLaji(laji.id)

      expect(store.mukautetutLajit).toHaveLength(0)
      expect(k.osallistumiset[laji.id]).toBeUndefined()
    })

    /*
     * Muodon vaihto on rajuin toiminto: lajit tulevat eri paikasta, joten vanhat
     * osallistumiset osoittaisivat lajeihin joita kisassa ei ole. Kilpailijat säilyvät.
     */
    it('muodon vaihto tyhjentää osallistumiset mutta säilyttää kilpailijat', () => {
      const laji = lajiJossaTuloksia()
      void laji

      store.asetaKisaTyyppi('resul')

      expect(store.kilpailijoita).toBe(1)
      expect(store.kisa.kilpailijat[0]?.osallistumiset).toEqual({})
      expect(store.kisa.lajit).toBeUndefined()
    })
  })

  it('lajien järjestystä voi vaihtaa', () => {
    const a = store.lisaaMukautettuLaji({ koodi: 'A' })
    const b = store.lisaaMukautettuLaji({ koodi: 'B' })

    store.siirraMukautettuLaji(b.id, -1)
    expect(store.mukautetutLajit.map((l) => l.koodi)).toEqual(['B', 'A'])

    // Reunan yli ei siirretä.
    store.siirraMukautettuLaji(b.id, -1)
    expect(store.mukautetutLajit.map((l) => l.koodi)).toEqual(['B', 'A'])
    void a
  })
})
