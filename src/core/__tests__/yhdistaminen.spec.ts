import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import {
  YhdistamisVirhe,
  kuvaaPaketti,
  laskeVersio,
  ristiriidanAvain,
  yhdista,
  type RistiriidanValinta,
} from '../yhdistaminen'
import { rakennaOsapaketti, rakennaTayspaketti } from '@/io/siirto'
import { laskeLaji } from '../laskenta'
import { LAJIT } from '../lajit'
import type { Kisa, Laukaus } from '@/types/kisa'

const TUNNISTEET = {
  laiteId: 'laite-B',
  laiteNimi: 'Koje 2',
  versio: 10,
  aika: '2026-06-15T12:00:00.000Z',
}

/** Syväkopio ilman reaktiivisuutta. structuredClone ei kelpaa Vuen Proxylle. */
function kloonaa<T>(arvo: T): T {
  return JSON.parse(JSON.stringify(arvo)) as T
}

/** Luo kisan, jossa on annetut kilpailijat RA1-lajissa. */
function luoKisa(nimet: [string, string][]): {
  store: ReturnType<typeof useKisaStore>
  kisa: Kisa
} {
  const store = useKisaStore()
  for (const [etunimi, sukunimi] of nimet) {
    const k = store.lisaaKilpailija({ etunimi, sukunimi, yhdistys: 'Nupures' })
    store.lisaaOsallistuminen(k.id, 'RA1')
  }
  return { store, kisa: store.kisa }
}

/** Kirjaa laukaukset kilpailijan ensimmäiseen kilpasarjaan. */
function kirjaa(
  store: ReturnType<typeof useKisaStore>,
  id: string,
  arvot: Laukaus[],
  kilpasarja = 0,
) {
  arvot.forEach((arvo, i) => store.asetaLaukaus(id, 'RA1', kilpasarja, i, arvo))
}

/** Rakentaa "toisen laitteen" kisan samalla kisaId:llä ja samoilla kilpailijatunnisteilla. */
function toinenLaite(alkuperainen: Kisa): { store: ReturnType<typeof useKisaStore>; kisa: Kisa } {
  setActivePinia(createPinia())
  const store = useKisaStore()
  store.korvaaKisa(kloonaa(alkuperainen))
  return { store, kisa: store.kisa }
}

describe('yhdistäminen — perusteet', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('eri kisan osittainen paketti hylätään', () => {
    const { kisa } = luoKisa([['A', 'Aaa']])
    const vieras = rakennaOsapaketti({ ...kloonaa(kisa), kisaId: 'ERI' }, TUNNISTEET)

    expect(() => yhdista(kisa, vieras)).toThrow(YhdistamisVirhe)
    // Viestin on kerrottava mitä tehdä, ei vain että jokin on pielessä.
    expect(() => yhdista(kisa, vieras)).toThrow(/koko kisa/)
  })

  it('eri kisan voi silti sallia erikseen', () => {
    const { kisa } = luoKisa([['A', 'Aaa']])
    const vieras = rakennaOsapaketti({ ...kloonaa(kisa), kisaId: 'ERI' }, TUNNISTEET)
    expect(() => yhdista(kisa, vieras, { salliEriKisa: true })).not.toThrow()
  })

  it('täysi paketti hyväksytään, vaikka kisatunnus poikkeaa', () => {
    /*
     * Luovutuksen koko idea on antaa kisa laitteelle, jolla sitä ei vielä ole. Tunnusten
     * vaatiminen samaksi estäisi sen juuri silloin kun sitä tarvitaan.
     */
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id

    const b = toinenLaite(kisa)
    b.store.kisa.kisaId = 'TOINEN'
    kirjaa(b.store, id, [10, 10, 10])
    const paketti = rakennaTayspaketti(b.kisa, TUNNISTEET)

    expect(() => yhdista(store.kisa, paketti)).not.toThrow()
    const tulos = yhdista(store.kisa, paketti)
    // Vastaanottaja saa myös lähettäjän kisatunnuksen, jotta jatkossa ollaan samassa kisassa.
    expect(tulos.kisa.kisaId).toBe('TOINEN')
  })

  it('eri kisasta yhdistettäessä kilpailija tunnistetaan nimen perusteella', () => {
    const { store } = luoKisa([['Sanna', 'Hakala']])

    // Toinen laite on perustanut oman kisan, joten tunnisteet ovat eri.
    setActivePinia(createPinia())
    const toinen = useKisaStore()
    const k = toinen.lisaaKilpailija({
      etunimi: 'Sanna',
      sukunimi: 'Hakala',
      yhdistys: 'Nupures',
    })
    toinen.lisaaOsallistuminen(k.id, 'RA1')
    kirjaa(toinen, k.id, [9, 9, 9])
    const paketti = rakennaOsapaketti(toinen.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti, { salliEriKisa: true })

    // Sama henkilö, ei kaksoiskappaletta.
    expect(tulos.kisa.kilpailijat).toHaveLength(1)
    expect(tulos.lisatytKilpailijat).toHaveLength(0)
    expect(tulos.kisa.kilpailijat[0]!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(9)
  })

  it('eri niminen kilpailija lisätään uutena', () => {
    const { store } = luoKisa([['Sanna', 'Hakala']])

    setActivePinia(createPinia())
    const toinen = useKisaStore()
    const k = toinen.lisaaKilpailija({ etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes' })
    toinen.lisaaOsallistuminen(k.id, 'RA1')
    kirjaa(toinen, k.id, [7, 7, 7])
    const paketti = rakennaOsapaketti(toinen.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti, { salliEriKisa: true })
    expect(tulos.kisa.kilpailijat).toHaveLength(2)
    expect(tulos.lisatytKilpailijat).toHaveLength(1)
  })

  it('ei muuta alkuperäistä kisaa', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id

    const b = toinenLaite(kisa)
    kirjaa(b.store, id, [9, 9, 9])
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    const ennen = JSON.stringify(store.kisa)
    yhdista(store.kisa, paketti)
    expect(JSON.stringify(store.kisa)).toBe(ennen)
  })
})

describe('yhdistäminen — tyhjä ja samanlainen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('saapuva tulos täyttää tyhjän kilpasarjan', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id

    const b = toinenLaite(kisa)
    kirjaa(b.store, id, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti)
    expect(tulos.ristiriidat).toHaveLength(0)
    expect(tulos.paivitetytSarjat).toBe(1)

    const yhdistetty = tulos.kisa.kilpailijat[0]!.osallistumiset.RA1!
    expect(laskeLaji('RA1', LAJIT.RA1, yhdistetty).pisteet).toBe(100)
    // Lähde merkitään, jotta jäljitys onnistuu.
    expect(yhdistetty.kilpasarjat[0]!.laiteId).toBe('laite-B')
  })

  it('tyhjä saapuva ei pyyhi omia tuloksia', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id
    kirjaa(store, id, [8, 8, 8])

    // Toisella laitteella ei ole mitään kirjattuna.
    const b = toinenLaite(kisa)
    b.store.kisa.kilpailijat[0]!.osallistumiset.RA1!.kilpasarjat.forEach((s) => {
      s.laukaukset = s.laukaukset.map(() => null)
    })
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti)
    expect(tulos.ristiriidat).toHaveLength(0)
    expect(tulos.paivitetytSarjat).toBe(0)
    expect(tulos.kisa.kilpailijat[0]!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(8)
  })

  it('samanlainen tulos on tyhjä toimenpide', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id
    kirjaa(store, id, [7, 7, 7])

    const b = toinenLaite(kisa)
    kirjaa(b.store, id, [7, 7, 7])
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti)
    expect(tulos.ristiriidat).toHaveLength(0)
    expect(tulos.samatSarjat).toBeGreaterThan(0)
  })

  it('yhdistäminen on idempotenttia', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id

    const b = toinenLaite(kisa)
    kirjaa(b.store, id, [9, 9, 9])
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    const eka = yhdista(store.kisa, paketti)
    const toka = yhdista(eka.kisa, paketti)

    expect(toka.ristiriidat).toHaveLength(0)
    expect(toka.paivitetytSarjat).toBe(0)
    expect(JSON.stringify(toka.kisa.kilpailijat)).toBe(JSON.stringify(eka.kisa.kilpailijat))
  })
})

describe('yhdistäminen — ristiriidat', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** Kaksi laitetta ovat kirjanneet saman sarjan eri tavalla. */
  function ristiriitaTilanne() {
    const { store, kisa } = luoKisa([['Sanna', 'Hakala']])
    const id = kisa.kilpailijat[0]!.id
    kirjaa(store, id, [9, 9, 9])

    const b = toinenLaite(kisa)
    kirjaa(b.store, id, [10, 10, 10])
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    return { store, id, paketti }
  }

  it('eroava tulos ei ylikirjoita mitään ilman valintaa', () => {
    const { store, id, paketti } = ristiriitaTilanne()
    const tulos = yhdista(store.kisa, paketti)

    expect(tulos.ristiriidat).toHaveLength(1)
    expect(tulos.paivitetytSarjat).toBe(0)
    // Omat tulokset säilyvät koskemattomina, kunnes käyttäjä päättää.
    expect(tulos.kisa.kilpailijat[0]!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(9)

    const r = tulos.ristiriidat[0]!
    expect(r.avain).toBe(ristiriidanAvain(id, 'RA1', 0))
    expect(r.nimi).toBe('Hakala, Sanna')
    expect(r.omaPisteet).toBe(27)
    expect(r.saapuvaPisteet).toBe(30)
  })

  it('valinta "saapuva" korvaa oman tuloksen', () => {
    const { store, id, paketti } = ristiriitaTilanne()
    const valinnat = new Map<string, RistiriidanValinta>([
      [ristiriidanAvain(id, 'RA1', 0), 'saapuva'],
    ])

    const tulos = yhdista(store.kisa, paketti, { valinnat })
    expect(tulos.ristiriidat).toHaveLength(0)
    expect(tulos.paivitetytSarjat).toBe(1)
    expect(tulos.kisa.kilpailijat[0]!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(10)
  })

  it('valinta "oma" säilyttää oman tuloksen', () => {
    const { store, id, paketti } = ristiriitaTilanne()
    const valinnat = new Map<string, RistiriidanValinta>([[ristiriidanAvain(id, 'RA1', 0), 'oma']])

    const tulos = yhdista(store.kisa, paketti, { valinnat })
    expect(tulos.ristiriidat).toHaveLength(0)
    expect(tulos.paivitetytSarjat).toBe(0)
    expect(tulos.kisa.kilpailijat[0]!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(9)
  })

  it('ristiriita vain samassa sarjassa — muut sarjat yhdistyvät normaalisti', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id
    kirjaa(store, id, [9, 9, 9], 0)

    const b = toinenLaite(kisa)
    kirjaa(b.store, id, [10, 10, 10], 0) // ristiriita
    kirjaa(b.store, id, [8, 8, 8], 1) // oma on tyhjä → menee läpi
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti)
    expect(tulos.ristiriidat).toHaveLength(1)
    expect(tulos.paivitetytSarjat).toBe(1)
    expect(tulos.kisa.kilpailijat[0]!.osallistumiset.RA1!.kilpasarjat[1]!.laukaukset[0]).toBe(8)
  })
})

describe('yhdistäminen — kilpailijat ja tuomarin merkinnät', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('tuntematon kilpailija lisätään nimitietoineen', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])

    const b = toinenLaite(kisa)
    const uusi = b.store.lisaaKilpailija({
      etunimi: 'Jälki',
      sukunimi: 'Ilmoittautunut',
      yhdistys: 'KaRes',
    })
    b.store.lisaaOsallistuminen(uusi.id, 'RA1')
    kirjaa(b.store, uusi.id, [6, 6, 6])
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti)
    expect(tulos.lisatytKilpailijat).toHaveLength(1)
    expect(tulos.kisa.kilpailijat).toHaveLength(2)

    const lisatty = tulos.kisa.kilpailijat.find((k) => k.sukunimi === 'Ilmoittautunut')!
    expect(lisatty.yhdistys).toBe('KaRes')
    expect(lisatty.osallistumiset.RA1?.kilpasarjat[0]?.laukaukset[0]).toBe(6)
  })

  it('rangaistuksista jää voimaan ankarampi', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id
    store.asetaRangaistukset(id, 'RA1', 1)

    const b = toinenLaite(kisa)
    b.store.asetaRangaistukset(id, 'RA1', 3)
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti)
    expect(tulos.kisa.kilpailijat[0]!.osallistumiset.RA1!.rangaistuksia).toBe(3)
  })

  it('pienempi rangaistusmäärä ei pyyhi suurempaa', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id
    store.asetaRangaistukset(id, 'RA1', 4)

    const b = toinenLaite(kisa)
    b.store.asetaRangaistukset(id, 'RA1', 0)
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    expect(
      yhdista(store.kisa, paketti).kisa.kilpailijat[0]!.osallistumiset.RA1!.rangaistuksia,
    ).toBe(4)
  })

  it('hylkäys säilyy kummalta laitteelta tahansa', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id

    const b = toinenLaite(kisa)
    b.store.asetaHylatty(id, 'RA1', true)
    const paketti = rakennaOsapaketti(b.kisa, TUNNISTEET)

    // Turvallisuusrike ei saa kadota yhdistämisessä.
    expect(yhdista(store.kisa, paketti).kisa.kilpailijat[0]!.osallistumiset.RA1!.hylatty).toBe(true)
  })
})

describe('vuorottelu — täysi paketti', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('korvaa koko kisan', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id

    const b = toinenLaite(kisa)
    kirjaa(b.store, id, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
    b.store.lisaaKilpailija({ etunimi: 'Uusi', sukunimi: 'Bbb', yhdistys: 'X' })
    const paketti = rakennaTayspaketti(b.kisa, TUNNISTEET)

    const tulos = yhdista(store.kisa, paketti)
    expect(tulos.kisa.kilpailijat).toHaveLength(2)
    expect(tulos.ristiriidat).toHaveLength(0)
    expect(tulos.vanhempiVersio).toBe(false)
  })

  it('vanhemman tilan tuominen uudemman päälle havaitaan', () => {
    const { kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id

    // Saapuva paketti on vanhemmasta tilanteesta: vain kaksi laukausta kirjattuna.
    // Kloonataan ennen omia kirjauksia, jotta tila on aidosti vanhempi eikä vain
    // saman tilan päälle kirjoitettu.
    const b = toinenLaite(kisa)
    kirjaa(b.store, id, [9, 9])
    const paketti = rakennaTayspaketti(b.kisa, {
      ...TUNNISTEET,
      versio: laskeVersio(b.kisa),
    })
    expect(paketti.versio).toBe(2)

    // Oma laite on sen jälkeen kirjannut paljon enemmän.
    setActivePinia(createPinia())
    const oma = useKisaStore()
    oma.korvaaKisa(kloonaa(kisa))
    kirjaa(oma, id, [9, 9, 9, 9, 9, 9, 9, 9, 9, 9])
    expect(laskeVersio(oma.kisa)).toBe(10)
    const store2 = oma

    const tulos = yhdista(store2.kisa, paketti)
    // Vaihto tehdään, mutta käyttäjää on varoitettava.
    expect(tulos.vanhempiVersio).toBe(true)
  })

  it('versionumero kasvaa kirjattujen laukausten myötä', () => {
    const { store, kisa } = luoKisa([['A', 'Aaa']])
    const id = kisa.kilpailijat[0]!.id
    expect(laskeVersio(store.kisa)).toBe(0)

    kirjaa(store, id, [9, 9, 9])
    expect(laskeVersio(store.kisa)).toBe(3)
  })
})

describe('paketin kuvaus', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('kertoo mitä ollaan tuomassa', () => {
    const { store, kisa } = luoKisa([
      ['A', 'Aaa'],
      ['B', 'Bbb'],
    ])
    store.lisaaOsallistuminen(kisa.kilpailijat[0]!.id, 'RA3')

    const paketti = rakennaOsapaketti(kisa, TUNNISTEET)
    const kuvaus = kuvaaPaketti(paketti, kisa)

    expect(kuvaus.tyyppi).toBe('osa')
    expect(kuvaus.laiteNimi).toBe('Koje 2')
    expect(kuvaus.kilpailijoita).toBe(2)
    expect(kuvaus.lajit).toEqual(['RA1', 'RA3'])
    expect(kuvaus.eriKisa).toBe(false)
  })

  it('tunnistaa eri kisan', () => {
    const { kisa } = luoKisa([['A', 'Aaa']])
    const paketti = rakennaOsapaketti({ ...kloonaa(kisa), kisaId: 'MUU' }, TUNNISTEET)
    expect(kuvaaPaketti(paketti, kisa).eriKisa).toBe(true)
  })

  it('kuvaa myös täyden paketin', () => {
    const { kisa } = luoKisa([['A', 'Aaa']])
    const kuvaus = kuvaaPaketti(rakennaTayspaketti(kisa, TUNNISTEET), kisa)
    expect(kuvaus.tyyppi).toBe('taysi')
    expect(kuvaus.kilpailijoita).toBe(1)
  })
})

/*
 * Mukautetun kisan tulosten yhdistäminen.
 *
 * Osallistumisen rakenne haettiin aiemmin RESUL-oletuksista, joita mukautetulle lajille
 * ei ole. Yhdistäminen kaatui siis juuri siinä tilanteessa, jonka ohje suosittelee:
 * rinnakkainen kirjaaminen, jossa vastaanottajalla ei vielä ole osallistumista.
 */
describe('mukautetun kisan yhdistäminen', () => {
  function mukautettuKisa(): Kisa {
    return {
      schemaVersion: 2,
      tyyppi: 'mukautettu',
      kisaId: 'ABCD2345',
      kisatiedot: {
        nimi: '',
        jarjestaja: '',
        paikka: '',
        pvm: '',
        kilpailunjohtaja: '',
        tuomari: '',
        kirjuri: '',
        muistiinpanot: '',
      },
      asetukset: { laskettavatParhaat: 3, lajiMaaritykset: LAJIT },
      sarjat: ['Yleinen'],
      lajit: [
        {
          id: 'x1',
          koodi: '3-as',
          nimi: 'Kolme asentoa',
          kilpasarjat: [{ laukauksia: 3 }, { laukauksia: 2 }],
          tulosSaanto: 'summa',
        },
      ],
      kilpailijat: [
        {
          id: 'k1',
          etunimi: 'Sanna',
          sukunimi: 'Hakala',
          yhdistys: 'Nupures',
          ikasarja: 'Yleinen',
          osallistumiset: {},
        },
      ],
    }
  }

  /** Osapaketti, jossa on tuloksia lajille jota vastaanottajalla ei vielä ole. */
  function osapaketti(laji: string) {
    return {
      v: 3,
      tyyppi: 'osa' as const,
      kisaId: 'ABCD2345',
      versio: 5,
      laiteId: 'laite-b',
      aika: '2026-06-15T10:00:00.000Z',
      rivit: [
        {
          id: 'k1',
          laji,
          luokka: 'vakio' as const,
          sarjat: ['A9H', 'A8'],
          rangaistuksia: 0,
          hylatty: false,
        },
      ],
    }
  }

  it('luo osallistumisen mukautetun lajin rakenteen mukaan', () => {
    const tulos = yhdista(mukautettuKisa(), osapaketti('x1'))

    const sarjat = tulos.kisa.kilpailijat[0]?.osallistumiset.x1?.kilpasarjat
    expect(sarjat?.map((s) => s.laukaukset.length)).toEqual([3, 2])
    expect(sarjat?.[0]?.laukaukset).toEqual([10, 9, '-'])
    expect(sarjat?.[1]?.laukaukset).toEqual([10, 8])
  })

  it('tuntematon laji ohitetaan eikä yhdistäminen kaadu', () => {
    const tulos = yhdista(mukautettuKisa(), osapaketti('eiOlemassa'))

    expect(tulos.kisa.kilpailijat[0]?.osallistumiset.eiOlemassa).toBeUndefined()
    expect(tulos.paivitetytSarjat).toBe(0)
  })
})
