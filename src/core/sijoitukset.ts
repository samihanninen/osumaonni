import type { Kilpailija, LajiId, LajiMaaritys, Luokka } from '@/types/kisa'
import { LAJIT } from './lajit'
import { laskeLaji, vertaaPerusteita, type LajiTulos } from './laskenta'

/**
 * Sijoituslaskenta virallisen tasatulossäännön mukaan (sama RA1–RA4:ssä).
 *
 * Sijat 1–8:
 *   1. tulos
 *   2. iskemien määrä
 *   3. napakymppien määrä, kymppien määrä, yhdeksikköjen määrä jne.
 *   4. ('paras'-lajit) jos paremman kilpasarjan tulokset ovat samat, ratkaistaan
 *      huonomman kilpasarjan perusteella
 *
 * Sijat 9:stä eteenpäin:
 *   Ampujat merkitään samalle sijaluvulle sukunimensä mukaiseen aakkosjärjestykseen.
 *   Seuraavaa sijoitusta määrättäessä otetaan huomioon edelliselle sijaluvulle
 *   merkittyjen ampujien lukumäärä.
 */

/** Sija, jonka jälkeen tarkkaa tulkkausta ei enää tehdä. */
export const TARKAN_TULKKAUKSEN_RAJA = 8

export interface SijoitusRivi {
  /** Sijaluku. Jaetut sijat saavat saman luvun. */
  sija: number
  /** Onko sija jaettu jonkun toisen kanssa? */
  jaettu: boolean
  kilpailija: Kilpailija
  tulos: LajiTulos
}

const vertailija = new Intl.Collator('fi', { sensitivity: 'base' })

/** Aakkosjärjestys sukunimen, sitten etunimen mukaan. */
export function vertaaNimia(a: Kilpailija, b: Kilpailija): number {
  const sukunimi = vertailija.compare(a.sukunimi ?? '', b.sukunimi ?? '')
  if (sukunimi !== 0) return sukunimi
  return vertailija.compare(a.etunimi ?? '', b.etunimi ?? '')
}

/**
 * Vertaa kahta tulosta täydellä tasatulossäännöllä (kohdat 1–4).
 * Negatiivinen tarkoittaa, että `a` sijoittuu ylemmäs.
 */
export function vertaaTuloksia(a: LajiTulos, b: LajiTulos): number {
  if (a.pisteet !== b.pisteet) return b.pisteet - a.pisteet

  const peruste = vertaaPerusteita(a.peruste, b.peruste)
  if (peruste !== 0) return peruste

  // Kohta 3: huonomman kilpasarjan perusteet, vain 'paras'-lajeissa.
  if (a.toissijainenPeruste && b.toissijainenPeruste) {
    if (a.toissijainenPeruste.pisteet !== b.toissijainenPeruste.pisteet) {
      return b.toissijainenPeruste.pisteet - a.toissijainenPeruste.pisteet
    }
    return vertaaPerusteita(a.toissijainenPeruste, b.toissijainenPeruste)
  }

  return 0
}

interface Ehdokas {
  kilpailija: Kilpailija
  tulos: LajiTulos
}

/**
 * Järjestää kilpailijat ja jakaa sijaluvut.
 *
 * Tulkinta säännöstä: tarkkaa tulkkausta (kohdat 2–4) käytetään tasatilanteiden
 * ratkaisuun vain sijoilla 1–8. Sijalta 9 eteenpäin pelkkä sama tulos riittää jaettuun
 * sijaan, ja tasatulokset esitetään sukunimen mukaisessa aakkosjärjestyksessä.
 */
function jaaSijat(ehdokkaat: Ehdokas[]): SijoitusRivi[] {
  const jarjestetyt = [...ehdokkaat].sort((a, b) => {
    const tulos = vertaaTuloksia(a.tulos, b.tulos)
    if (tulos !== 0) return tulos
    return vertaaNimia(a.kilpailija, b.kilpailija)
  })

  const rivit: SijoitusRivi[] = []
  let edellinenSija = 0
  let edellinen: Ehdokas | undefined

  jarjestetyt.forEach((nykyinen, i) => {
    let sija = i + 1

    if (edellinen) {
      // Sijoilla 1–8 tasatulos vaatii täyden vertailun; sijalta 9 riittää sama tulos.
      const tasa =
        edellinenSija <= TARKAN_TULKKAUKSEN_RAJA
          ? vertaaTuloksia(nykyinen.tulos, edellinen.tulos) === 0
          : nykyinen.tulos.pisteet === edellinen.tulos.pisteet
      if (tasa) sija = edellinenSija
    }

    edellinenSija = sija
    edellinen = nykyinen
    rivit.push({ sija, jaettu: false, kilpailija: nykyinen.kilpailija, tulos: nykyinen.tulos })
  })

  // Merkitse jaetut sijat.
  const maarat = new Map<number, number>()
  for (const r of rivit) maarat.set(r.sija, (maarat.get(r.sija) ?? 0) + 1)
  for (const r of rivit) r.jaettu = (maarat.get(r.sija) ?? 0) > 1

  /*
   * Sijalta 9 eteenpäin tarkkaa tulkkausta ei tehdä, joten jaetun sijan sisäistä
   * paremmuusjärjestystä ei ole olemassa. Esitetään ne sukunimen mukaisessa
   * aakkosjärjestyksessä sääntöjen mukaan — muuten lista antaisi ymmärtää
   * järjestyksen, jota tuomarit eivät ole ratkaisseet.
   */
  let i = 0
  while (i < rivit.length) {
    const alku = rivit[i]
    if (!alku) break
    let loppu = i
    while (loppu + 1 < rivit.length && rivit[loppu + 1]?.sija === alku.sija) loppu++
    if (alku.sija > TARKAN_TULKKAUKSEN_RAJA && loppu > i) {
      const ryhma = rivit
        .slice(i, loppu + 1)
        .sort((a, b) => vertaaNimia(a.kilpailija, b.kilpailija))
      rivit.splice(i, ryhma.length, ...ryhma)
    }
    i = loppu + 1
  }

  return rivit
}

export interface SijoitusOptiot {
  /** Näytetäänkö hylätyt kilpailijat listan lopussa? Oletuksena kyllä. */
  naytaHylatyt?: boolean
  /** Otetaanko mukaan kilpailijat, joilla ei ole yhtään laukausta? Oletuksena ei. */
  naytaAloittamattomat?: boolean
}

/**
 * Laskee sijoitukset yhdelle lajille ja aseluokalle.
 *
 * Luokat lasketaan aina erikseen: avoimessa luokassa optiikka on sallittu, joten
 * vakioluokan ja avoimen luokan tuloksia ei voi verrata keskenään.
 */
export function sijoitukset(
  kilpailijat: Kilpailija[],
  laji: LajiId,
  luokka: Luokka,
  /**
   * Lajin rakenne. Vain `tulosSaanto` luetaan, joten mukautetun lajin rakenne kelpaa
   * sellaisenaan. RESUL-lajille oletus tulee säännöistä.
   */
  maaritys: Pick<LajiMaaritys, 'tulosSaanto'> = LAJIT[laji as keyof typeof LAJIT],
  optiot: SijoitusOptiot = {},
): SijoitusRivi[] {
  const { naytaHylatyt = true, naytaAloittamattomat = false } = optiot

  const kaikki: Ehdokas[] = []
  for (const k of kilpailijat) {
    const osallistuminen = k.osallistumiset[laji]
    if (!osallistuminen || osallistuminen.luokka !== luokka) continue
    const tulos = laskeLaji(laji, maaritys, osallistuminen)
    if (!tulos.aloitettu && !naytaAloittamattomat) continue
    kaikki.push({ kilpailija: k, tulos })
  }

  // Hylätyt eivät kilpaile sijoituksista, mutta ne on hyvä näyttää listan lopussa.
  const kilpailevat = kaikki.filter((e) => !e.tulos.hylatty)
  const rivit = jaaSijat(kilpailevat)

  if (naytaHylatyt) {
    const hylatyt = kaikki
      .filter((e) => e.tulos.hylatty)
      .sort((a, b) => vertaaNimia(a.kilpailija, b.kilpailija))
    for (const h of hylatyt) {
      rivit.push({ sija: 0, jaettu: false, kilpailija: h.kilpailija, tulos: h.tulos })
    }
  }

  return rivit
}
