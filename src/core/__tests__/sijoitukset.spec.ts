import { describe, it, expect } from 'vitest'
import type { Kilpailija, Kilpasarja, Laji, Luokka } from '@/types/kisa'
import { LAJIT, type LajiRakenne } from '../lajit'
import { sijoitukset, vertaaNimia, TARKAN_TULKKAUKSEN_RAJA } from '../sijoitukset'
import {
  yhdistysLaji,
  yhdistysYhteistulos,
  onJoukkuekilpailu,
  JOUKKUEEN_KOKO,
} from '../yhdistykset'
import { kokonaiskilpailu, RESUL_TASATULOKSEN_RATKAISIJA } from '../kokonaiskilpailu'

let seuraavaId = 0

interface AmpujaMaaritys {
  nimi: string
  yhdistys?: string
  luokka?: Luokka
  laji?: Laji
  sarjat: Kilpasarja[]
  rangaistuksia?: number
  hylatty?: boolean
  lajit?: Partial<Record<Laji, Kilpasarja[]>>
}

function ampuja(m: AmpujaMaaritys): Kilpailija {
  const osat = m.nimi.split(' ')
  const etunimi = osat.slice(0, -1).join(' ') || m.nimi
  const sukunimi = osat.length > 1 ? (osat[osat.length - 1] ?? '') : ''
  const luokka = m.luokka ?? 'vakio'

  const osallistumiset: Kilpailija['osallistumiset'] = {}
  const lahteet: Partial<Record<Laji, Kilpasarja[]>> = m.lajit ?? { [m.laji ?? 'RA1']: m.sarjat }

  for (const [laji, sarjat] of Object.entries(lahteet) as [Laji, Kilpasarja[]][]) {
    osallistumiset[laji] = {
      luokka,
      kilpasarjat: sarjat.map((laukaukset) => ({ laukaukset })),
      rangaistuksia: m.rangaistuksia ?? 0,
      hylatty: m.hylatty ?? false,
    }
  }

  return {
    id: `k${seuraavaId++}`,
    etunimi,
    sukunimi,
    yhdistys: m.yhdistys ?? 'Nupures',
    ikasarja: 'H',
    osallistumiset,
  }
}

/** RA1-sarja, jossa `pisteet` jaettu kymmeneen laukaukseen mahdollisimman tasaisesti. */
function ra1Sarja(laukaukset: Kilpasarja): Kilpasarja {
  const s = [...laukaukset]
  while (s.length < 10) s.push('-')
  return s
}

function tasainen(arvo: number, pituus = 10): Kilpasarja {
  return Array.from({ length: pituus }, () => arvo)
}

describe('sijoitukset — perusjärjestys', () => {
  it('järjestää tuloksen mukaan laskevasti', () => {
    const kilpailijat = [
      ampuja({ nimi: 'Aaro Ahonen', sarjat: [tasainen(7), tasainen(7)] }), // 70
      ampuja({ nimi: 'Bertta Berg', sarjat: [tasainen(9), tasainen(9)] }), // 90
      ampuja({ nimi: 'Cecil Cronberg', sarjat: [tasainen(8), tasainen(8)] }), // 80
    ]
    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    expect(rivit.map((r) => r.kilpailija.sukunimi)).toEqual(['Berg', 'Cronberg', 'Ahonen'])
    expect(rivit.map((r) => r.sija)).toEqual([1, 2, 3])
  })

  it('jättää aloittamattomat pois oletuksena', () => {
    const kilpailijat = [
      ampuja({ nimi: 'Aaro Ahonen', sarjat: [tasainen(7), tasainen(7)] }),
      ampuja({ nimi: 'Tyhjä Tekijä', sarjat: [ra1Sarja([]), ra1Sarja([])] }),
    ]
    // ra1Sarja täyttää ohilaukauksilla, joten käytetään aitoja tyhjiä.
    kilpailijat[1]!.osallistumiset.RA1!.kilpasarjat = [
      { laukaukset: Array.from({ length: 10 }, () => null) },
      { laukaukset: Array.from({ length: 10 }, () => null) },
    ]
    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    expect(rivit).toHaveLength(1)
    expect(rivit[0]!.kilpailija.sukunimi).toBe('Ahonen')
  })
})

describe('sijoitukset — luokat kilpailevat erikseen', () => {
  it('vakio ja avoin eivät sekoitu', () => {
    const kilpailijat = [
      ampuja({ nimi: 'Vakio Ampuja', luokka: 'vakio', sarjat: [tasainen(7), tasainen(7)] }),
      ampuja({ nimi: 'Avoin Ampuja', luokka: 'avoin', sarjat: [tasainen(10), tasainen(10)] }),
    ]
    const vakio = sijoitukset(kilpailijat, 'RA1', 'vakio')
    const avoin = sijoitukset(kilpailijat, 'RA1', 'avoin')

    expect(vakio).toHaveLength(1)
    expect(vakio[0]!.kilpailija.etunimi).toBe('Vakio')
    expect(vakio[0]!.sija).toBe(1)

    expect(avoin).toHaveLength(1)
    expect(avoin[0]!.kilpailija.etunimi).toBe('Avoin')
    expect(avoin[0]!.sija).toBe(1)
  })
})

describe('sijoitukset — tasatulossääntö sijoilla 1–8', () => {
  it('enemmän iskemiä sijoittuu ylemmäs samalla tuloksella', () => {
    // Molemmilla 50 pistettä: toisella 5 × 10, toisella 10 × 5.
    const kilpailijat = [
      ampuja({ nimi: 'Harva Osuja', sarjat: [ra1Sarja([10, 10, 10, 10, 10]), ra1Sarja([])] }),
      ampuja({ nimi: 'Tiheä Osuja', sarjat: [tasainen(5), ra1Sarja([])] }),
    ]
    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    expect(rivit[0]!.tulos.pisteet).toBe(50)
    expect(rivit[1]!.tulos.pisteet).toBe(50)
    expect(rivit[0]!.kilpailija.etunimi).toBe('Tiheä')
    expect(rivit.map((r) => r.sija)).toEqual([1, 2])
  })

  it('iskemien jälkeen ratkaisee napakymppien määrä', () => {
    const kilpailijat = [
      ampuja({ nimi: 'Ilman Napoja', sarjat: [tasainen(10), ra1Sarja([])] }),
      ampuja({
        nimi: 'Napoja Paljon',
        sarjat: [['*', '*', '*', 10, 10, 10, 10, 10, 10, 10], ra1Sarja([])],
      }),
    ]
    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    expect(rivit[0]!.tulos.pisteet).toBe(100)
    expect(rivit[1]!.tulos.pisteet).toBe(100)
    expect(rivit[0]!.kilpailija.etunimi).toBe('Napoja')
    expect(rivit[0]!.sija).toBe(1)
    expect(rivit[1]!.sija).toBe(2)
  })

  it('huonompi kilpasarja ratkaisee, jos parempi on identtinen (paras-lajit)', () => {
    const parempi: Kilpasarja = tasainen(9)
    const kilpailijat = [
      ampuja({ nimi: 'Heikko Toinen', sarjat: [parempi, tasainen(5)] }),
      ampuja({ nimi: 'Vahva Toinen', sarjat: [parempi, tasainen(8)] }),
    ]
    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    expect(rivit[0]!.kilpailija.etunimi).toBe('Vahva')
    expect(rivit.map((r) => r.sija)).toEqual([1, 2])
  })

  it('täysin identtiset tulokset jakavat sijan', () => {
    const kilpailijat = [
      ampuja({ nimi: 'Bertta Berg', sarjat: [tasainen(8), tasainen(7)] }),
      ampuja({ nimi: 'Aaro Ahonen', sarjat: [tasainen(8), tasainen(7)] }),
    ]
    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    expect(rivit.map((r) => r.sija)).toEqual([1, 1])
    expect(rivit.every((r) => r.jaettu)).toBe(true)
    // Jaetut esitetään sukunimen mukaisessa aakkosjärjestyksessä.
    expect(rivit.map((r) => r.kilpailija.sukunimi)).toEqual(['Ahonen', 'Berg'])
  })

  it('jaetun sijan jälkeen seuraava sijaluku ottaa huomioon jakajien määrän', () => {
    const kilpailijat = [
      ampuja({ nimi: 'Aa Yksi', sarjat: [tasainen(9), tasainen(9)] }),
      ampuja({ nimi: 'Bb Kaksi', sarjat: [tasainen(9), tasainen(9)] }),
      ampuja({ nimi: 'Cc Kolme', sarjat: [tasainen(5), tasainen(5)] }),
    ]
    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    expect(rivit.map((r) => r.sija)).toEqual([1, 1, 3])
  })
})

describe('sijoitukset — sijat 9:stä eteenpäin', () => {
  it('samalla tuloksella jaetaan sija ilman tarkkaa tulkkausta', () => {
    // Yhdeksän parempaa, sitten kaksi samalla tuloksella mutta eri iskemämäärillä.
    const kilpailijat: Kilpailija[] = []
    for (let i = 0; i < 8; i++) {
      kilpailijat.push(
        ampuja({ nimi: `Kärki${i} Ampuja${i}`, sarjat: [tasainen(10), tasainen(10)] }),
      )
    }
    // Näillä molemmilla 50 pistettä, mutta eri iskemämäärä.
    kilpailijat.push(
      ampuja({ nimi: 'Zeta Harva', sarjat: [ra1Sarja([10, 10, 10, 10, 10]), ra1Sarja([])] }),
    )
    kilpailijat.push(ampuja({ nimi: 'Alfa Tihea', sarjat: [tasainen(5), ra1Sarja([])] }))

    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    const hannat = rivit.slice(8)

    expect(hannat).toHaveLength(2)
    // Sijalta 9 alkaen pelkkä sama tulos riittää jaettuun sijaan.
    expect(hannat.map((r) => r.sija)).toEqual([9, 9])
    expect(hannat.every((r) => r.jaettu)).toBe(true)
    // Ja tasatulokset esitetään aakkosjärjestyksessä sukunimen mukaan.
    expect(hannat.map((r) => r.kilpailija.sukunimi)).toEqual(['Harva', 'Tihea'])
  })

  it('raja on kahdeksan', () => {
    expect(TARKAN_TULKKAUKSEN_RAJA).toBe(8)
  })
})

describe('sijoitukset — hylätyt', () => {
  it('hylätty ei kilpaile sijoista mutta näkyy listan lopussa', () => {
    const kilpailijat = [
      ampuja({ nimi: 'Reilu Ampuja', sarjat: [tasainen(6), tasainen(6)] }),
      ampuja({ nimi: 'Hylätty Ampuja', sarjat: [tasainen(10), tasainen(10)], hylatty: true }),
    ]
    const rivit = sijoitukset(kilpailijat, 'RA1', 'vakio')
    expect(rivit).toHaveLength(2)
    expect(rivit[0]!.kilpailija.etunimi).toBe('Reilu')
    expect(rivit[0]!.sija).toBe(1)
    expect(rivit[1]!.kilpailija.etunimi).toBe('Hylätty')
    expect(rivit[1]!.sija).toBe(0)
  })
})

describe('nimien aakkosjärjestys', () => {
  it('järjestää sukunimen mukaan', () => {
    const a = ampuja({ nimi: 'Yrjö Aaltonen', sarjat: [] })
    const b = ampuja({ nimi: 'Aada Överi', sarjat: [] })
    expect(vertaaNimia(a, b)).toBeLessThan(0)
  })

  it('samalla sukunimellä ratkaisee etunimi', () => {
    const a = ampuja({ nimi: 'Bertta Virtanen', sarjat: [] })
    const b = ampuja({ nimi: 'Aaro Virtanen', sarjat: [] })
    expect(vertaaNimia(a, b)).toBeGreaterThan(0)
  })
})

describe('yhdistyskilpailu', () => {
  it('laskee parhaiden kolmen summan', () => {
    expect(JOUKKUEEN_KOKO).toBe(3)
    const kilpailijat = [
      ampuja({ nimi: 'A Yksi', yhdistys: 'Nupures', sarjat: [tasainen(10), tasainen(10)] }), // 100
      ampuja({ nimi: 'B Kaksi', yhdistys: 'Nupures', sarjat: [tasainen(9), tasainen(9)] }), // 90
      ampuja({ nimi: 'C Kolme', yhdistys: 'Nupures', sarjat: [tasainen(8), tasainen(8)] }), // 80
      ampuja({ nimi: 'D Nelja', yhdistys: 'Nupures', sarjat: [tasainen(7), tasainen(7)] }), // 70, ei mukaan
      ampuja({ nimi: 'E Viisi', yhdistys: 'KaRes', sarjat: [tasainen(6), tasainen(6)] }), // 60
    ]
    const rivit = yhdistysLaji(kilpailijat, 'RA1')
    const nupures = rivit.find((r) => r.yhdistys === 'Nupures')!
    expect(nupures.pisteet).toBe(270)
    expect(nupures.huomioidut).toHaveLength(3)
    expect(nupures.kilpailijoita).toBe(4)
    expect(nupures.taysiJoukkue).toBe(true)
    expect(nupures.sija).toBe(1)

    const kares = rivit.find((r) => r.yhdistys === 'KaRes')!
    expect(kares.pisteet).toBe(60)
    expect(kares.taysiJoukkue).toBe(false)
  })

  it('vajaa joukkue lasketaan silti', () => {
    const kilpailijat = [
      ampuja({ nimi: 'A Yksi', yhdistys: 'FoRe', sarjat: [tasainen(5), tasainen(5)] }),
    ]
    const rivit = yhdistysLaji(kilpailijat, 'RA1')
    expect(rivit[0]!.pisteet).toBe(50)
    expect(rivit[0]!.taysiJoukkue).toBe(false)
  })

  it('hylätty ei kerrytä yhdistyksen pisteitä', () => {
    const kilpailijat = [
      ampuja({ nimi: 'A Yksi', yhdistys: 'Nupures', sarjat: [tasainen(5), tasainen(5)] }),
      ampuja({
        nimi: 'B Kaksi',
        yhdistys: 'Nupures',
        sarjat: [tasainen(10), tasainen(10)],
        hylatty: true,
      }),
    ]
    const rivit = yhdistysLaji(kilpailijat, 'RA1')
    expect(rivit[0]!.pisteet).toBe(50)
    expect(rivit[0]!.kilpailijoita).toBe(1)
  })

  it('yhteistulos summaa kaikki lajit', () => {
    const kilpailijat = [
      ampuja({
        nimi: 'A Yksi',
        yhdistys: 'Nupures',
        sarjat: [],
        lajit: {
          RA1: [tasainen(10), tasainen(10)], // paras 100
          RA2: [tasainen(9, 6), tasainen(9, 6), tasainen(9, 6)], // summa 162
        },
      }),
    ]
    const rivit = yhdistysYhteistulos(kilpailijat)
    expect(rivit[0]!.lajipisteet.RA1).toBe(100)
    expect(rivit[0]!.lajipisteet.RA2).toBe(162)
    expect(rivit[0]!.pisteet).toBe(262)
  })
})

describe('kokonaiskilpailu', () => {
  it('summaa kilpailijan lajitulokset', () => {
    const kilpailijat = [
      ampuja({
        nimi: 'A Yksi',
        sarjat: [],
        lajit: {
          RA1: [tasainen(8), tasainen(8)], // 80
          RA3: [tasainen(7), tasainen(7)], // 70
        },
      }),
    ]
    const rivit = kokonaiskilpailu(kilpailijat)
    expect(rivit[0]!.pisteet).toBe(150)
    expect(rivit[0]!.lajeja).toBe(2)
    expect(rivit[0]!.kaikkiLajit).toBe(false)
    expect(rivit[0]!.lajipisteet.RA2).toBeNull()
  })

  it('tasatuloksen ratkaisee parempi RA2-tulos', () => {
    const heikkoRa2 = ampuja({
      nimi: 'Heikko Kakkonen',
      sarjat: [],
      lajit: {
        RA1: [tasainen(10), tasainen(10)], // 100
        RA2: [tasainen(5, 6), tasainen(5, 6), tasainen(5, 6)], // 90
      },
    })
    const vahvaRa2 = ampuja({
      nimi: 'Vahva Kakkonen',
      sarjat: [],
      lajit: {
        RA1: [tasainen(9, 10), ra1Sarja([9, 9, 9, 9, 9, 9, 9, 9, 9])], // 90
        RA2: [
          [10, 10, 10, 10, 10, 10],
          [10, 10, 10, 10, 10, 10],
          [10, 10, 10, 10, 10, 10],
        ], // 180 → mutta yhteistulos pitää saada samaksi
      },
    })
    // Rakennetaan tarkoituksella sama yhteistulos: 190 kummallekin.
    heikkoRa2.osallistumiset.RA2!.kilpasarjat = [
      { laukaukset: tasainen(5, 6) },
      { laukaukset: tasainen(5, 6) },
      { laukaukset: tasainen(5, 6) },
    ] // 90 → yhteensä 190
    vahvaRa2.osallistumiset.RA1!.kilpasarjat = [
      { laukaukset: tasainen(1, 10) },
      { laukaukset: tasainen(1, 10) },
    ] // 10
    vahvaRa2.osallistumiset.RA2!.kilpasarjat = [
      { laukaukset: tasainen(10, 6) },
      { laukaukset: tasainen(10, 6) },
      { laukaukset: tasainen(10, 6) },
    ] // 180 → yhteensä 190

    const rivit = kokonaiskilpailu([heikkoRa2, vahvaRa2])
    expect(rivit[0]!.pisteet).toBe(190)
    expect(rivit[1]!.pisteet).toBe(190)
    expect(rivit[0]!.kilpailija.etunimi).toBe('Vahva')
    expect(rivit.map((r) => r.sija)).toEqual([1, 2])
  })

  it('vaadiKaikkiLajit rajaa keskeneräiset pois', () => {
    const kilpailijat = [
      ampuja({ nimi: 'Yksi Laji', sarjat: [], lajit: { RA1: [tasainen(8), tasainen(8)] } }),
    ]
    expect(kokonaiskilpailu(kilpailijat)).toHaveLength(1)
    expect(kokonaiskilpailu(kilpailijat, { vaadiKaikkiLajit: true })).toHaveLength(0)
  })
})

describe('RA2 sijoitukset käyttävät summaa', () => {
  it('kolmen sarjan summa ratkaisee', () => {
    const kilpailijat = [
      ampuja({
        nimi: 'Tasainen Ampuja',
        sarjat: [],
        lajit: { RA2: [tasainen(8, 6), tasainen(8, 6), tasainen(8, 6)] }, // 144
      }),
      ampuja({
        nimi: 'Epatasainen Ampuja',
        sarjat: [],
        lajit: { RA2: [tasainen(10, 6), tasainen(10, 6), tasainen(4, 6)] }, // 144
      }),
    ]
    const rivit = sijoitukset(kilpailijat, 'RA2', 'vakio', LAJIT.RA2)
    expect(rivit[0]!.tulos.pisteet).toBe(144)
    expect(rivit[1]!.tulos.pisteet).toBe(144)
    // Molemmilla 18 iskemää ja ei napoja; kympit ratkaisevat.
    expect(rivit[0]!.kilpailija.etunimi).toBe('Epatasainen')
  })
})

/*
 * Järjestäjä voi muokata lajien rakennetta asetuksista. Muokkaus vaikutti aiemmin vain
 * lajikohtaisiin sijoituksiin: kokonaiskilpailu ja yhdistysten yhteistulos laskivat
 * sääntöjen oletuksilla, joten sama kisa saattoi näyttää kahta eri tulosta yhtä aikaa.
 */
describe('kisan omat rakenteet laskennassa', () => {
  /** RA1 summana parhaan sarjan sijaan — kuten jos sääntö olisi muuttunut. */
  const muokatut = { ...LAJIT, RA1: { ...LAJIT.RA1, tulosSaanto: 'summa' as const } }

  function kaksiTaytta() {
    return ampuja({
      nimi: 'A Yksi',
      yhdistys: 'Nupures',
      sarjat: [],
      lajit: { RA1: [tasainen(10), tasainen(10)] },
    })
  }

  it('kokonaiskilpailu käyttää kisan rakenteita eikä oletuksia', () => {
    const kilpailijat = [kaksiTaytta()]

    expect(kokonaiskilpailu(kilpailijat)[0]!.pisteet).toBe(100)
    expect(kokonaiskilpailu(kilpailijat, { maaritykset: muokatut })[0]!.pisteet).toBe(200)
  })

  it('yhdistysten yhteistulos käyttää kisan rakenteita eikä oletuksia', () => {
    const kilpailijat = [kaksiTaytta()]

    expect(yhdistysYhteistulos(kilpailijat)[0]!.pisteet).toBe(100)
    expect(yhdistysYhteistulos(kilpailijat, { maaritykset: muokatut })[0]!.pisteet).toBe(200)
  })

  /*
   * Rakenteet poimitaan lajikohtaisesti. Aiemmin yhteen lajiin tarkoitettu rakenne
   * välittyi sellaisenaan kaikkiin lajeihin, jolloin RA2:n summa olisi laskettu RA1:n
   * säännöllä.
   */
  it('yhteistulos poimii rakenteen lajikohtaisesti', () => {
    const kilpailijat = [
      ampuja({
        nimi: 'B Kaksi',
        yhdistys: 'Nupures',
        sarjat: [],
        lajit: {
          RA1: [tasainen(10), tasainen(10)], // summa 200 muokatuilla
          RA2: [tasainen(9, 6), tasainen(9, 6), tasainen(9, 6)], // summa 162 aina
        },
      }),
    ]

    const rivi = yhdistysYhteistulos(kilpailijat, { maaritykset: muokatut })[0]!
    expect(rivi.lajipisteet.RA1).toBe(200)
    expect(rivi.lajipisteet.RA2).toBe(162)
    expect(rivi.pisteet).toBe(362)
  })
})

/*
 * Säännöt kaikissa neljässä lajissa: "Mikäli joukkuekilpailu järjestetään, on siitä
 * mainittava kilpailukutsussa." Yhdistyskilpailu ei siis ole automaattinen.
 */
describe('yhdistyskilpailun valinnaisuus', () => {
  it('puuttuva asetus tarkoittaa päällä', () => {
    expect(onJoukkuekilpailu({})).toBe(true)
    expect(onJoukkuekilpailu({ joukkuekilpailu: undefined })).toBe(true)
  })

  it('vain nimenomainen epätosi sammuttaa sen', () => {
    expect(onJoukkuekilpailu({ joukkuekilpailu: false })).toBe(false)
    expect(onJoukkuekilpailu({ joukkuekilpailu: true })).toBe(true)
  })
})

/**
 * Mukautetun kisan tulokset.
 *
 * Sijoitus- ja yhdistyslaskenta ovat lajista riippumattomia, joten mukautettu laji
 * kelpaa niihin sellaisenaan. Kokonaiskilpailu on poikkeus: sen tasatuloksen ratkaisee
 * RESUL-säännöissä RA2, eikä mukautetussa kisassa ole vastaavaa sääntöä.
 */
describe('mukautetun kisan tulokset', () => {
  /** Kolmen asennon laji: sarjat eri mittaisia, kaikki lasketaan yhteen. */
  const kolmeAsentoa: LajiRakenne = {
    id: 'x1',
    koodi: '3-as',
    nimi: 'Kolme asentoa',
    kilpasarjat: [
      { nimi: 'Makuu', laukauksia: 2 },
      { nimi: 'Polvi', laukauksia: 2 },
      { nimi: 'Pysty', laukauksia: 1 },
    ],
    tulosSaanto: 'summa',
  }

  function mukautettuAmpuja(nimi: string, sarjat: Kilpasarja[], yhdistys = 'Nupures'): Kilpailija {
    const k = ampuja({ nimi, yhdistys, sarjat: [] })
    k.osallistumiset = {
      x1: {
        luokka: 'vakio',
        kilpasarjat: sarjat.map((laukaukset) => ({ laukaukset })),
        rangaistuksia: 0,
        hylatty: false,
      },
    }
    return k
  }

  it('sijoittaa mukautetun lajin tulokset', () => {
    const kilpailijat = [
      mukautettuAmpuja('Parempi Ampuja', [[10, 10], [9, 9], [10]]), // 48
      mukautettuAmpuja('Heikompi Ampuja', [[8, 8], [8, 8], [8]]), // 40
    ]

    const rivit = sijoitukset(kilpailijat, 'x1', 'vakio', kolmeAsentoa)

    expect(rivit[0]?.tulos.pisteet).toBe(48)
    expect(rivit[0]?.kilpailija.etunimi).toBe('Parempi')
    expect(rivit[1]?.tulos.pisteet).toBe(40)
  })

  it('laskee eri mittaiset sarjat oikein summana', () => {
    const kilpailijat = [mukautettuAmpuja('A Yksi', [[10, 10], [10, 10], [10]])]

    const rivit = sijoitukset(kilpailijat, 'x1', 'vakio', kolmeAsentoa)

    // 5 laukausta × 10 = 50, ei 6 × 10.
    expect(rivit[0]?.tulos.pisteet).toBe(50)
    expect(rivit[0]?.tulos.sarjat).toHaveLength(3)
  })

  it('yhdistyskilpailu laskee mukautetut lajit', () => {
    const kilpailijat = [
      mukautettuAmpuja('A Yksi', [[10, 10], [10, 10], [10]], 'Nupures'),
      mukautettuAmpuja('B Kaksi', [[9, 9], [9, 9], [9]], 'Nupures'),
    ]

    const rivit = yhdistysYhteistulos(kilpailijat, { lajit: [kolmeAsentoa] })

    expect(rivit[0]?.yhdistys).toBe('Nupures')
    expect(rivit[0]?.lajipisteet.x1).toBe(50 + 45)
    expect(rivit[0]?.pisteet).toBe(95)
  })

  /*
   * Tämä on se kohta, jossa RESUL-sääntöä ei voi soveltaa: mukautetussa kisassa ei ole
   * RA2:ta eikä muuta sääntöjen nimeämää ratkaisijalajia. Arvattu ratkaisija päättäisi
   * sijoituksia perusteella, jota kilpailijoille ei ole kerrottu.
   */
  it('kokonaiskilpailussa tasatulos jää jaetuksi ilman ratkaisijalajia', () => {
    const kilpailijat = [
      mukautettuAmpuja('Aakkonen Ensin', [[10, 8], [9, 9], [10]]), // 46
      mukautettuAmpuja('Bee Toinen', [[9, 9], [10, 8], [10]]), // 46
    ]

    const rivit = kokonaiskilpailu(kilpailijat, { lajit: [kolmeAsentoa] })

    expect(rivit[0]?.pisteet).toBe(46)
    expect(rivit[1]?.pisteet).toBe(46)
    expect(rivit[0]?.sija).toBe(1)
    expect(rivit[1]?.sija).toBe(1)
    expect(rivit.every((r) => r.jaettu)).toBe(true)
    // Järjestys sukunimen mukaan, koska muuta perustetta ei ole.
    expect(rivit[0]?.kilpailija.sukunimi).toBe('Ensin')
  })

  it('RESUL-kisassa ratkaisijalaji purkaa saman tasatuloksen', () => {
    // Kummallakin yhteensä 130, mutta RA2:n osuus eri: 30 vs. 60.
    const heikkoRa2 = ampuja({
      nimi: 'Aakkonen Ensin',
      sarjat: [],
      lajit: { RA1: [tasainen(10)], RA2: [tasainen(5, 6)] },
    })
    const vahvaRa2 = ampuja({
      nimi: 'Bee Toinen',
      sarjat: [],
      lajit: { RA1: [tasainen(7)], RA2: [tasainen(10, 6)] },
    })

    const rivit = kokonaiskilpailu([heikkoRa2, vahvaRa2], {
      tasatuloksenRatkaisija: RESUL_TASATULOKSEN_RATKAISIJA,
    })

    expect(rivit.map((r) => r.pisteet)).toEqual([130, 130])
    // Parempi RA2 ratkaisee, joten sukunimi ei ratkaise järjestystä.
    expect(rivit[0]?.kilpailija.sukunimi).toBe('Toinen')
    expect(rivit[0]?.sija).toBe(1)
    expect(rivit[1]?.sija).toBe(2)
  })
})
