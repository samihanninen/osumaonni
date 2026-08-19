import { describe, it, expect } from 'vitest'
import {
  kisanLajit,
  rakenteenLaukaukset,
  litteaksiIndeksiksi,
  litteastaIndeksista,
  pisinKilpasarja,
  sarjanNimi,
  LAJIT,
  type LajiRakenne,
} from '../lajit'
import { tyhjaKisa } from '@/stores/kisa'
import type { Kisa, MukautettuLaji } from '@/types/kisa'

/**
 * `kisanLajit` on sauma, jonka takaa kutsuja ei näe kumpaa muotoa kisa on. Sen on
 * annettava kummastakin sama esitys, jotta syöttö ja tulokset voivat käsitellä molempia
 * samalla koodilla.
 */
describe('kisan lajit muodosta riippumatta', () => {
  it('RESUL-kisan lajit tulevat säännöistä', () => {
    const lajit = kisanLajit(tyhjaKisa('resul'))

    expect(lajit.map((l) => l.koodi)).toEqual(['RA1', 'RA2', 'RA3', 'RA4'])
    // Tasainen rakenne avataan sarjalistaksi: RA2 on 3 × 6 laukausta.
    const ra2 = lajit.find((l) => l.koodi === 'RA2')!
    expect(ra2.kilpasarjat).toHaveLength(3)
    expect(ra2.kilpasarjat.every((k) => k.laukauksia === 6)).toBe(true)
    expect(ra2.tulosSaanto).toBe('summa')
    expect(rakenteenLaukaukset(ra2)).toBe(18)
  })

  it('RESUL-kisan lajit seuraavat järjestäjän muokkauksia', () => {
    const kisa = tyhjaKisa('resul')
    kisa.asetukset.lajiMaaritykset.RA1 = { ...LAJIT.RA1, kilpasarjoja: 4, tulosSaanto: 'summa' }

    const ra1 = kisanLajit(kisa).find((l) => l.koodi === 'RA1')!
    expect(ra1.kilpasarjat).toHaveLength(4)
    expect(ra1.tulosSaanto).toBe('summa')
  })

  /* Kolmen asennon kisa: sarjat ovat eri asentoja, ja kaikki lasketaan yhteen. */
  it('mukautetun kisan lajit tulevat kisan omasta listasta', () => {
    const kolmeAsentoa: MukautettuLaji = {
      id: 'x1',
      koodi: '3-as',
      nimi: 'Kolmen asennon kisa',
      kilpasarjat: [
        { nimi: 'Makuu', laukauksia: 10 },
        { nimi: 'Polvi', laukauksia: 10 },
        { nimi: 'Pysty', laukauksia: 5 },
      ],
      tulosSaanto: 'summa',
    }
    const kisa: Kisa = { ...tyhjaKisa('mukautettu'), lajit: [kolmeAsentoa] }

    const lajit = kisanLajit(kisa)

    expect(lajit).toHaveLength(1)
    expect(lajit[0]?.id).toBe('x1')
    expect(lajit[0]?.kilpasarjat.map((k) => k.nimi)).toEqual(['Makuu', 'Polvi', 'Pysty'])
    // Eri mittaiset sarjat ovat koko mukautetun muodon syy.
    expect(rakenteenLaukaukset(lajit[0]!)).toBe(25)
  })

  it('mukautettu kisa ilman lajeja on tyhjä eikä palauta RESUL-lajeja', () => {
    expect(kisanLajit(tyhjaKisa('mukautettu'))).toEqual([])
  })
})

/**
 * Taulukkosyöttö liikkuu laukauksesta toiseen yhtenä jonona sarjojen yli. Aiemmin
 * muunnos tehtiin jakolaskulla sarjan pituudella, mikä toimii vain tasamittaisilla
 * sarjoilla — eri mittaisilla se osuisi väärään ruutuun heti ensimmäisen lyhyen
 * sarjan jälkeen.
 */
describe('laukausten juokseva numerointi', () => {
  const eriMittaiset: LajiRakenne = {
    id: 'x',
    koodi: 'X',
    nimi: 'Eri mittaiset',
    kilpasarjat: [{ laukauksia: 3 }, { laukauksia: 1 }, { laukauksia: 2 }],
    tulosSaanto: 'summa',
  }

  it('muuntaa sarjan ja laukauksen juoksevaksi numeroksi', () => {
    expect(litteaksiIndeksiksi(eriMittaiset, 0, 0)).toBe(0)
    expect(litteaksiIndeksiksi(eriMittaiset, 0, 2)).toBe(2)
    // Toinen sarja alkaa kolmannen laukauksen jälkeen, ei kuudennen.
    expect(litteaksiIndeksiksi(eriMittaiset, 1, 0)).toBe(3)
    expect(litteaksiIndeksiksi(eriMittaiset, 2, 1)).toBe(5)
  })

  it('muuntaa juoksevan numeron takaisin sarjaksi ja laukaukseksi', () => {
    expect(litteastaIndeksista(eriMittaiset, 0)).toEqual({ sarja: 0, laukaus: 0 })
    expect(litteastaIndeksista(eriMittaiset, 3)).toEqual({ sarja: 1, laukaus: 0 })
    expect(litteastaIndeksista(eriMittaiset, 4)).toEqual({ sarja: 2, laukaus: 0 })
    expect(litteastaIndeksista(eriMittaiset, 5)).toEqual({ sarja: 2, laukaus: 1 })
  })

  it('rajojen ulkopuolelle ei osu', () => {
    expect(litteastaIndeksista(eriMittaiset, 6)).toBeNull()
    expect(litteastaIndeksista(eriMittaiset, -1)).toBeNull()
  })

  it('muunnos on kaksisuuntainen jokaiselle ruudulle', () => {
    for (let i = 0; i < rakenteenLaukaukset(eriMittaiset); i++) {
      const kohta = litteastaIndeksista(eriMittaiset, i)!
      expect(litteaksiIndeksiksi(eriMittaiset, kohta.sarja, kohta.laukaus)).toBe(i)
    }
  })

  it('sarakkeita on pisimmän sarjan verran', () => {
    expect(pisinKilpasarja(eriMittaiset)).toBe(3)
  })

  it('nimeämätön sarja numeroidaan, nimetty näytetään nimellään', () => {
    expect(sarjanNimi(eriMittaiset, 0)).toBe('Kilpasarja 1')
    expect(sarjanNimi({ ...eriMittaiset, kilpasarjat: [{ laukauksia: 5 }] }, 0)).toBe('Kilpasarja')
    expect(
      sarjanNimi({ ...eriMittaiset, kilpasarjat: [{ nimi: 'Makuu', laukauksia: 5 }] }, 0),
    ).toBe('Makuu')
  })
})
