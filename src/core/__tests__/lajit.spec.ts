import { describe, it, expect } from 'vitest'
import { kisanLajit, rakenteenLaukaukset, LAJIT } from '../lajit'
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
