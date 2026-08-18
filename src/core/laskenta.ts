import {
  NAPAKYMPPI,
  type Kilpasarja,
  type LajiId,
  type LajiMaaritys,
  type Laukaus,
  type Luokka,
  type Osallistuminen,
} from '@/types/kisa'

/** Sääntörikkeen suuruus pisteinä. Sääntöjen kohta 12: "vähentämällä joka kerralla kaksi (2) pistettä". */
export const RANGAISTUS_PISTEET = 2

/** Onko laukaus iskemä? Ohilaukaus ja tyhjä eivät ole. Nolla tulkitaan ohilaukaukseksi. */
export function onIskema(l: Laukaus): boolean {
  if (l === NAPAKYMPPI) return true
  return typeof l === 'number' && l >= 1
}

/** Onko laukaus napakymppi? */
export function onNapakymppi(l: Laukaus): boolean {
  return l === NAPAKYMPPI
}

/** Onko laukaus syötetty (osuma tai ohi)? */
export function onSyotetty(l: Laukaus): boolean {
  return l !== null && l !== undefined
}

/** Yksittäisen laukauksen pisteet. */
export function laukauksenPisteet(l: Laukaus): number {
  if (l === NAPAKYMPPI) return 10
  if (typeof l === 'number' && l >= 1) return Math.min(l, 10)
  return 0
}

/** Yhden kilpasarjan laskettu tulos. */
export interface KilpasarjaTulos {
  pisteet: number
  /** Napakymppien määrä. */
  navat: number
  /** Iskemien määrä (osumat numerorenkaisiin). */
  iskemat: number
  /**
   * Osumien jakauma arvon mukaan: indeksi = laukauksen arvo 0–10.
   * Indeksi 10 sisältää **myös napakympit**, koska napakymppi on kymppi.
   * Napakymppien erillinen määrä on kentässä `navat`.
   */
  arvojakauma: number[]
  /** Onko kaikki sarjan laukaukset syötetty? */
  valmis: boolean
  /** Syötettyjen laukausten määrä. */
  syotetty: number
}

/** Tyhjä arvojakauma indekseille 0–10. */
function nollaJakauma(): number[] {
  return Array.from({ length: 11 }, () => 0)
}

/** Turvallinen luku jakaumasta. */
function jakaumasta(jakauma: number[], arvo: number): number {
  return jakauma[arvo] ?? 0
}

export function laskeKilpasarja(laukaukset: Kilpasarja): KilpasarjaTulos {
  const arvojakauma = nollaJakauma()
  let pisteet = 0
  let navat = 0
  let iskemat = 0
  let syotetty = 0

  for (const l of laukaukset) {
    if (onSyotetty(l)) syotetty++
    const p = laukauksenPisteet(l)
    pisteet += p
    if (onNapakymppi(l)) navat++
    if (onIskema(l)) {
      iskemat++
      arvojakauma[p] = jakaumasta(arvojakauma, p) + 1
    }
  }

  return {
    pisteet,
    navat,
    iskemat,
    arvojakauma,
    valmis: laukaukset.length > 0 && syotetty === laukaukset.length,
    syotetty,
  }
}

/** Tasatulosperuste: iskemät, navat ja arvojakauma yhdestä tai useammasta sarjasta. */
export interface Tasaperuste {
  pisteet: number
  iskemat: number
  navat: number
  arvojakauma: number[]
}

function yhdistaPerusteet(tulokset: KilpasarjaTulos[]): Tasaperuste {
  const arvojakauma = nollaJakauma()
  let pisteet = 0
  let iskemat = 0
  let navat = 0
  for (const t of tulokset) {
    pisteet += t.pisteet
    iskemat += t.iskemat
    navat += t.navat
    for (let i = 0; i <= 10; i++) {
      arvojakauma[i] = jakaumasta(arvojakauma, i) + jakaumasta(t.arvojakauma, i)
    }
  }
  return { pisteet, iskemat, navat, arvojakauma }
}

/**
 * Vertaa kahta tasatulosperustetta virallisen säännön kohtien 1–2 mukaan.
 *
 * 1. iskemien määrä
 * 2. napakymppien määrä, kymppien määrä, yhdeksikköjen määrä jne.
 *
 * Palauttaa negatiivisen, jos `a` sijoittuu ylemmäs (eli `a` on parempi).
 */
export function vertaaPerusteita(a: Tasaperuste, b: Tasaperuste): number {
  if (a.iskemat !== b.iskemat) return b.iskemat - a.iskemat
  if (a.navat !== b.navat) return b.navat - a.navat
  for (let arvo = 10; arvo >= 1; arvo--) {
    const ax = jakaumasta(a.arvojakauma, arvo)
    const bx = jakaumasta(b.arvojakauma, arvo)
    if (ax !== bx) return bx - ax
  }
  return 0
}

/** Vertaa kahta kilpasarjaa paremmuusjärjestykseen (pisteet ensin, sitten tasatulosperusteet). */
function vertaaKilpasarjoja(a: KilpasarjaTulos, b: KilpasarjaTulos): number {
  if (a.pisteet !== b.pisteet) return b.pisteet - a.pisteet
  return vertaaPerusteita(a, b)
}

/** Kilpailijan tulos yhdessä lajissa. */
export interface LajiTulos {
  laji: LajiId
  luokka: Luokka
  /** Kaikkien kilpasarjojen tulokset syöttöjärjestyksessä. */
  sarjat: KilpasarjaTulos[]
  /** Laskennassa huomioitavan sarjan indeksi ('paras'-lajeissa); 'summa'-lajeissa -1. */
  laskevaSarja: number
  /** Kilpailutulos ennen rangaistuksia. */
  bruttoPisteet: number
  /** Kilpailutulos rangaistusten jälkeen. Hylätyllä 0. */
  pisteet: number
  rangaistuksia: number
  hylatty: boolean
  /** Tasatulosperuste huomioitavista sarjoista. */
  peruste: Tasaperuste
  /**
   * 'paras'-lajeissa huonomman sarjan peruste. Sääntöjen kohta 15.3: jos paremman
   * kilpasarjan tulokset ovat samat, ratkaistaan huonomman sarjan perusteella.
   * 'summa'-lajeissa `undefined`, koska niiden säännöissä tätä kohtaa ei ole.
   */
  toissijainenPeruste?: Tasaperuste
  /** Onko kaikki lajin laukaukset syötetty? */
  valmis: boolean
  /** Onko lajiin syötetty yhtään laukausta? */
  aloitettu: boolean
}

/**
 * Laskee kilpailijan tuloksen yhdessä lajissa.
 *
 * - `paras` (RA1, RA3, RA4): huomioidaan vain paras kilpasarja
 * - `summa` (RA2): kaikkien kilpasarjojen summa
 *
 * Rangaistukset vähennetään lopputuloksesta, ja hylätyn tulos on nolla.
 */
export function laskeLaji(
  laji: LajiId,
  /** Vain `tulosSaanto` luetaan, joten mukautetun lajin rakenne kelpaa sellaisenaan. */
  maaritys: Pick<LajiMaaritys, 'tulosSaanto'>,
  osallistuminen: Osallistuminen,
): LajiTulos {
  const sarjat = osallistuminen.kilpasarjat.map((s) => laskeKilpasarja(s.laukaukset))

  let laskevaSarja = -1
  let peruste: Tasaperuste
  let toissijainenPeruste: Tasaperuste | undefined

  const [ensimmainen, ...loput] = sarjat

  if (maaritys.tulosSaanto === 'paras' && ensimmainen) {
    // Paras sarja: pisteet ensin, tasatilanteessa tasatulosperusteet.
    let paras = ensimmainen
    laskevaSarja = 0
    loput.forEach((ehdokas, i) => {
      if (vertaaKilpasarjoja(ehdokas, paras) < 0) {
        paras = ehdokas
        laskevaSarja = i + 1
      }
    })
    peruste = yhdistaPerusteet([paras])
    const muut = sarjat.filter((s) => s !== paras)
    if (muut.length > 0) toissijainenPeruste = yhdistaPerusteet(muut)
  } else {
    peruste = yhdistaPerusteet(sarjat)
  }

  const bruttoPisteet = peruste.pisteet
  const rangaistuksia = osallistuminen.rangaistuksia ?? 0
  const hylatty = osallistuminen.hylatty === true
  const pisteet = hylatty ? 0 : Math.max(0, bruttoPisteet - rangaistuksia * RANGAISTUS_PISTEET)

  return {
    laji,
    luokka: osallistuminen.luokka,
    sarjat,
    laskevaSarja,
    bruttoPisteet,
    pisteet,
    rangaistuksia,
    hylatty,
    peruste,
    toissijainenPeruste,
    valmis: sarjat.length > 0 && sarjat.every((s) => s.valmis),
    aloitettu: sarjat.some((s) => s.syotetty > 0),
  }
}
