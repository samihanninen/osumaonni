import type { Kilpailija, Laji, LajiMaaritys, Luokka } from '@/types/kisa'
import { LAJIT, LAJI_KOODIT } from './lajit'
import { laskeLaji } from './laskenta'

/**
 * Yhdistys- ja joukkuekilpailu.
 *
 * Sääntöjen mukaan joukkueen koko on 3 ampujaa, joten laskettavien parhaiden oletusarvo
 * on 3. Joukkue H on avoin kaikille ikään ja sukupuoleen katsomatta.
 */
export const JOUKKUEEN_KOKO = 3

export interface YhdistysLajiTulos {
  yhdistys: string
  /** Laskennassa huomioitujen kilpailijoiden tulokset parhaasta alkaen. */
  huomioidut: { kilpailija: Kilpailija; pisteet: number }[]
  /** Yhdistyksen kilpailijoiden kokonaismäärä tässä lajissa. */
  kilpailijoita: number
  pisteet: number
  /** Onko yhdistyksellä täysi joukkue? */
  taysiJoukkue: boolean
}

export interface YhdistysKokonaisTulos {
  sija: number
  jaettu: boolean
  yhdistys: string
  /** Lajikohtaiset pisteet. Puuttuva laji on 0. */
  lajipisteet: Record<Laji, number>
  pisteet: number
}

function lisaaSijat<T extends { pisteet: number }>(
  rivit: T[],
): (T & { sija: number; jaettu: boolean })[] {
  const jarjestetyt = [...rivit].sort((a, b) => b.pisteet - a.pisteet)
  const tulos = jarjestetyt.map((r, i) => ({ ...r, sija: i + 1, jaettu: false }))

  let edellinen: (T & { sija: number; jaettu: boolean }) | undefined
  for (const r of tulos) {
    if (edellinen && r.pisteet === edellinen.pisteet) r.sija = edellinen.sija
    edellinen = r
  }
  const maarat = new Map<number, number>()
  for (const r of tulos) maarat.set(r.sija, (maarat.get(r.sija) ?? 0) + 1)
  for (const r of tulos) r.jaettu = (maarat.get(r.sija) ?? 0) > 1
  return tulos
}

export interface YhdistysOptiot {
  /** Laskettavien parhaiden määrä. Oletus 3 (joukkueen koko). */
  parhaita?: number
  /** Rajaa laskenta yhteen aseluokkaan. Ilman rajausta kaikki luokat lasketaan yhteen. */
  luokka?: Luokka
  /**
   * Kisan lajikohtaiset rakenteet. Ilman näitä käytetään sääntöjen oletuksia, jolloin
   * järjestäjän muokkaama tulossääntö ei vaikuttaisi laskentaan. Kutsujan on annettava
   * nämä aina, kun käytettävissä on kisan omat asetukset.
   */
  maaritykset?: Record<Laji, LajiMaaritys>
}

/**
 * Laskee yhdistysten tulokset yhdessä lajissa: parhaiden N kilpailijan pisteiden summa.
 * Jos yhdistyksellä on vähemmän kuin N kilpailijaa, lasketaan kaikki mitä on.
 */
export function yhdistysLaji(
  kilpailijat: Kilpailija[],
  laji: Laji,
  optiot: YhdistysOptiot = {},
): (YhdistysLajiTulos & { sija: number; jaettu: boolean })[] {
  const { parhaita = JOUKKUEEN_KOKO, luokka } = optiot
  const maaritys = optiot.maaritykset?.[laji] ?? LAJIT[laji]

  const ryhmat = new Map<string, { kilpailija: Kilpailija; pisteet: number }[]>()

  for (const k of kilpailijat) {
    const osallistuminen = k.osallistumiset[laji]
    if (!osallistuminen) continue
    if (luokka && osallistuminen.luokka !== luokka) continue

    const tulos = laskeLaji(laji, maaritys, osallistuminen)
    // Hylätyn tulos on mitätöity, joten se ei kerrytä yhdistyksen pisteitä.
    if (tulos.hylatty || !tulos.aloitettu) continue

    const yhdistys = (k.yhdistys ?? '').trim()
    if (!yhdistys) continue

    const rivit = ryhmat.get(yhdistys) ?? []
    rivit.push({ kilpailija: k, pisteet: tulos.pisteet })
    ryhmat.set(yhdistys, rivit)
  }

  const tulokset: YhdistysLajiTulos[] = []
  for (const [yhdistys, rivit] of ryhmat) {
    const jarjestetyt = [...rivit].sort((a, b) => b.pisteet - a.pisteet)
    const huomioidut = jarjestetyt.slice(0, parhaita)
    tulokset.push({
      yhdistys,
      huomioidut,
      kilpailijoita: rivit.length,
      pisteet: huomioidut.reduce((s, r) => s + r.pisteet, 0),
      taysiJoukkue: rivit.length >= parhaita,
    })
  }

  return lisaaSijat(tulokset)
}

/**
 * Laskee yhdistysten yhteistuloksen kaikista lajeista.
 *
 * Optiot välitetään sellaisenaan lajikohtaiseen laskentaan, joka poimii `maaritykset`-
 * taulusta oikean lajin rakenteen. Näin sama rakenne ei voi vahingossa päteä kaikkiin
 * lajeihin.
 */
export function yhdistysYhteistulos(
  kilpailijat: Kilpailija[],
  optiot: YhdistysOptiot = {},
): YhdistysKokonaisTulos[] {
  const kertyma = new Map<string, Record<Laji, number>>()

  for (const laji of LAJI_KOODIT) {
    for (const rivi of yhdistysLaji(kilpailijat, laji, optiot)) {
      const nykyinen =
        kertyma.get(rivi.yhdistys) ?? ({ RA1: 0, RA2: 0, RA3: 0, RA4: 0 } as Record<Laji, number>)
      nykyinen[laji] = rivi.pisteet
      kertyma.set(rivi.yhdistys, nykyinen)
    }
  }

  const rivit = [...kertyma].map(([yhdistys, lajipisteet]) => ({
    yhdistys,
    lajipisteet,
    pisteet: LAJI_KOODIT.reduce((s, l) => s + lajipisteet[l], 0),
  }))

  return lisaaSijat(rivit)
}
