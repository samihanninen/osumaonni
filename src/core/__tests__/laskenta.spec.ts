import { describe, it, expect } from 'vitest'
import type { Kilpasarja, Laji, Osallistuminen } from '@/types/kisa'
import { LAJIT, laukauksiaYhteensa, suurinTulos, tyhjatKilpasarjat } from '../lajit'
import {
  laskeKilpasarja,
  laskeLaji,
  laukauksenPisteet,
  onIskema,
  vertaaPerusteita,
  RANGAISTUS_PISTEET,
} from '../laskenta'

/** Apuri: rakentaa osallistumisen annetuista kilpasarjoista. */
function osallistuminen(
  kilpasarjat: Kilpasarja[],
  lisa: Partial<Osallistuminen> = {},
): Osallistuminen {
  return {
    luokka: 'vakio',
    kilpasarjat: kilpasarjat.map((laukaukset) => ({ laukaukset })),
    rangaistuksia: 0,
    hylatty: false,
    ...lisa,
  }
}

/** Apuri: sarja, jossa `n` kappaletta arvoa `arvo`, loput täytetty pituuteen `pituus`. */
function sarja(arvot: Kilpasarja, pituus: number): Kilpasarja {
  const s = [...arvot]
  while (s.length < pituus) s.push(null)
  return s
}

describe('lajimääritykset vastaavat virallisia sääntöjä', () => {
  it('RA1: 2 × 10 laukausta, parempi sarja', () => {
    expect(LAJIT.RA1.kilpasarjoja).toBe(2)
    expect(LAJIT.RA1.laukauksiaSarjassa).toBe(10)
    expect(LAJIT.RA1.tulosSaanto).toBe('paras')
    expect(laukauksiaYhteensa(LAJIT.RA1)).toBe(20)
    expect(suurinTulos(LAJIT.RA1)).toBe(100)
  })

  it('RA2: 3 × 6 laukausta, sarjojen summa', () => {
    expect(LAJIT.RA2.kilpasarjoja).toBe(3)
    expect(LAJIT.RA2.laukauksiaSarjassa).toBe(6)
    expect(LAJIT.RA2.tulosSaanto).toBe('summa')
    expect(laukauksiaYhteensa(LAJIT.RA2)).toBe(18)
    expect(suurinTulos(LAJIT.RA2)).toBe(180)
  })

  it('RA3 ja RA4: 2 × 10 laukausta, parempi sarja', () => {
    for (const laji of ['RA3', 'RA4'] as Laji[]) {
      expect(LAJIT[laji].kilpasarjoja).toBe(2)
      expect(LAJIT[laji].laukauksiaSarjassa).toBe(10)
      expect(LAJIT[laji].tulosSaanto).toBe('paras')
      expect(suurinTulos(LAJIT[laji])).toBe(100)
    }
  })

  it('tyhjätKilpasarjat noudattaa lajin rakennetta', () => {
    const ra2 = tyhjatKilpasarjat(LAJIT.RA2)
    expect(ra2).toHaveLength(3)
    expect(ra2[0]).toHaveLength(6)
    expect(ra2.flat().every((l) => l === null)).toBe(true)
  })
})

describe('laukauksen tulkinta', () => {
  it('napakymppi on 10 pistettä ja iskemä', () => {
    expect(laukauksenPisteet('*')).toBe(10)
    expect(onIskema('*')).toBe(true)
  })

  it('ohilaukaus ja nolla eivät ole iskemiä', () => {
    expect(laukauksenPisteet('-')).toBe(0)
    expect(laukauksenPisteet(0)).toBe(0)
    expect(onIskema('-')).toBe(false)
    expect(onIskema(0)).toBe(false)
  })

  it('tyhjä ei ole iskemä eikä tuo pisteitä', () => {
    expect(laukauksenPisteet(null)).toBe(0)
    expect(onIskema(null)).toBe(false)
  })
})

describe('kilpasarjan laskenta', () => {
  it('laskee pisteet, navat ja iskemät', () => {
    // 10 + 2 + 10 + 10 = 32, kaksi napakymppiä, neljä iskemää
    const t = laskeKilpasarja(sarja(['*', 2, '*', 10], 10))
    expect(t.pisteet).toBe(32)
    expect(t.navat).toBe(2)
    expect(t.iskemat).toBe(4)
    expect(t.valmis).toBe(false)
    expect(t.syotetty).toBe(4)
  })

  it('arvojakauman kymppeihin lasketaan myös napakympit', () => {
    const t = laskeKilpasarja(sarja(['*', 10, 9], 10))
    expect(t.arvojakauma[10]).toBe(2)
    expect(t.arvojakauma[9]).toBe(1)
    expect(t.navat).toBe(1)
  })

  it('ohilaukaukset eivät kasvata iskemien määrää', () => {
    const t = laskeKilpasarja(['-', '-', 5, 5, 0, null, null, null, null, null])
    expect(t.pisteet).toBe(10)
    expect(t.iskemat).toBe(2)
  })

  it('täysi sarja on valmis', () => {
    const t = laskeKilpasarja(Array.from({ length: 6 }, () => 8))
    expect(t.valmis).toBe(true)
    expect(t.pisteet).toBe(48)
  })
})

describe('RA1/RA3/RA4 — parempi sarja otetaan huomioon', () => {
  it('valitsee paremman sarjan tuloksen', () => {
    const t = laskeLaji(
      'RA1',
      LAJIT.RA1,
      osallistuminen([
        Array.from({ length: 10 }, () => 8), // 80
        Array.from({ length: 10 }, () => 9), // 90
      ]),
    )
    expect(t.pisteet).toBe(90)
    expect(t.laskevaSarja).toBe(1)
  })

  it('huonompi sarja jää toissijaiseksi perusteeksi', () => {
    const t = laskeLaji(
      'RA1',
      LAJIT.RA1,
      osallistuminen([
        Array.from({ length: 10 }, () => 9), // 90
        Array.from({ length: 10 }, () => 7), // 70
      ]),
    )
    expect(t.pisteet).toBe(90)
    expect(t.laskevaSarja).toBe(0)
    expect(t.toissijainenPeruste?.pisteet).toBe(70)
  })

  it('pistetasatilanteessa paremmaksi valitaan sarja, jossa on enemmän napakymppejä', () => {
    // Molemmissa 100 pistettä, mutta toisessa enemmän napakymppejä.
    const kymppeja = Array.from({ length: 10 }, () => 10)
    const napoja: Kilpasarja = [
      ...Array.from({ length: 5 }, () => 10 as const),
      '*',
      '*',
      '*',
      '*',
      '*',
    ]
    const t = laskeLaji('RA1', LAJIT.RA1, osallistuminen([kymppeja, napoja]))
    expect(t.pisteet).toBe(100)
    expect(t.laskevaSarja).toBe(1)
    expect(t.peruste.navat).toBe(5)
  })

  it('napakymppi lasketaan kympiksi pisteissä', () => {
    const t = laskeLaji(
      'RA3',
      LAJIT.RA3,
      osallistuminen([sarja(['*', '*', '*'], 10), sarja([], 10)]),
    )
    expect(t.pisteet).toBe(30)
    expect(t.peruste.navat).toBe(3)
    expect(t.peruste.iskemat).toBe(3)
  })
})

describe('RA2 — kilpasarjojen summa', () => {
  it('summaa kaikki kolme sarjaa', () => {
    const t = laskeLaji(
      'RA2',
      LAJIT.RA2,
      osallistuminen([
        Array.from({ length: 6 }, () => 5), // 30
        Array.from({ length: 6 }, () => 6), // 36
        Array.from({ length: 6 }, () => 7), // 42
      ]),
    )
    expect(t.pisteet).toBe(108)
    expect(t.laskevaSarja).toBe(-1)
    expect(t.valmis).toBe(true)
  })

  it('ei käytä toissijaista perustetta, koska säännöissä ei ole huonomman sarjan kohtaa', () => {
    const t = laskeLaji(
      'RA2',
      LAJIT.RA2,
      osallistuminen([
        Array.from({ length: 6 }, () => 5),
        Array.from({ length: 6 }, () => 5),
        Array.from({ length: 6 }, () => 5),
      ]),
    )
    expect(t.toissijainenPeruste).toBeUndefined()
  })

  it('kerää navat ja iskemät kaikista sarjoista', () => {
    const t = laskeLaji(
      'RA2',
      LAJIT.RA2,
      osallistuminen([sarja(['*', '*'], 6), sarja(['*'], 6), sarja([9, 9], 6)]),
    )
    expect(t.peruste.navat).toBe(3)
    expect(t.peruste.iskemat).toBe(5)
    expect(t.pisteet).toBe(48)
  })
})

describe('rangaistukset ja hylkäys', () => {
  it('sääntörike vähentää kaksi pistettä', () => {
    const t = laskeLaji(
      'RA1',
      LAJIT.RA1,
      osallistuminen([Array.from({ length: 10 }, () => 9), sarja([], 10)], { rangaistuksia: 1 }),
    )
    expect(t.bruttoPisteet).toBe(90)
    expect(t.pisteet).toBe(90 - RANGAISTUS_PISTEET)
  })

  it('useampi rike vähentää kaksi pistettä kerrallaan', () => {
    const t = laskeLaji(
      'RA1',
      LAJIT.RA1,
      osallistuminen([Array.from({ length: 10 }, () => 9), sarja([], 10)], { rangaistuksia: 3 }),
    )
    expect(t.pisteet).toBe(84)
  })

  it('tulos ei mene negatiiviseksi', () => {
    const t = laskeLaji(
      'RA1',
      LAJIT.RA1,
      osallistuminen([sarja([5], 10), sarja([], 10)], {
        rangaistuksia: 10,
      }),
    )
    expect(t.pisteet).toBe(0)
  })

  it('turvallisuusrike mitätöi tuloksen', () => {
    const t = laskeLaji(
      'RA1',
      LAJIT.RA1,
      osallistuminen([Array.from({ length: 10 }, () => 10), sarja([], 10)], { hylatty: true }),
    )
    expect(t.bruttoPisteet).toBe(100)
    expect(t.pisteet).toBe(0)
    expect(t.hylatty).toBe(true)
  })
})

describe('tasatulosperusteiden vertailu (säännön kohdat 1–2)', () => {
  const peruste = (
    iskemat: number,
    navat: number,
    jakauma: Partial<Record<number, number>> = {},
  ) => {
    const arvojakauma = Array.from({ length: 11 }, () => 0)
    for (const [arvo, maara] of Object.entries(jakauma)) arvojakauma[Number(arvo)] = maara ?? 0
    return { pisteet: 0, iskemat, navat, arvojakauma }
  }

  it('enemmän iskemiä sijoittuu ylemmäs', () => {
    expect(vertaaPerusteita(peruste(10, 0), peruste(9, 5))).toBeLessThan(0)
  })

  it('iskemien jälkeen ratkaisee napakymppien määrä', () => {
    expect(vertaaPerusteita(peruste(10, 3), peruste(10, 2))).toBeLessThan(0)
  })

  it('napojen jälkeen ratkaisee kymppien määrä, sitten ysien', () => {
    expect(vertaaPerusteita(peruste(10, 0, { 10: 4 }), peruste(10, 0, { 10: 3 }))).toBeLessThan(0)
    expect(
      vertaaPerusteita(peruste(10, 0, { 10: 3, 9: 5 }), peruste(10, 0, { 10: 3, 9: 4 })),
    ).toBeLessThan(0)
  })

  it('täysin samat perusteet ovat tasapelissä', () => {
    expect(vertaaPerusteita(peruste(10, 2, { 10: 4 }), peruste(10, 2, { 10: 4 }))).toBe(0)
  })
})

describe('valmiuden ja aloituksen tunnistus', () => {
  it('aloittamaton osallistuminen tunnistetaan', () => {
    const t = laskeLaji('RA1', LAJIT.RA1, osallistuminen(tyhjatKilpasarjat(LAJIT.RA1)))
    expect(t.aloitettu).toBe(false)
    expect(t.valmis).toBe(false)
  })

  it('ohilaukaus on syöte, joten laji on aloitettu', () => {
    const t = laskeLaji('RA1', LAJIT.RA1, osallistuminen([sarja(['-'], 10), sarja([], 10)]))
    expect(t.aloitettu).toBe(true)
    expect(t.pisteet).toBe(0)
  })
})
