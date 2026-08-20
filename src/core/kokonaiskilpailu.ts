import type { Kilpailija, LajiId, LajiMaaritys } from '@/types/kisa'
import { LAJIT, LAJI_KOODIT, type LajiRakenne } from './lajit'
import { laskeLaji } from './laskenta'
import { vertaaNimia, TARKAN_TULKKAUKSEN_RAJA } from './sijoitukset'

/**
 * Kokonaiskilpailu — kilpailijan yhteistulos kaikista lajeista.
 *
 * Tasatulossääntö versioiden 1.6 (2025) mukaan. Kohdan numero ja lajin nimi vaihtelevat
 * asiakirjoittain, mutta sisältö on sama:
 *
 * - RA1 kohta 15.A.4: "Kokonaiskilpailussa parempi **PA2**:n tulos ratkaisee voittajan."
 * - RA2 kohta 15.3:   "Kokonaiskilpailussa parempi **RA2**:n tulos ratkaisee voittajan."
 * - RA3 kohta 15.4:   "Kokonaiskilpailussa parempi **PA2**:n tulos ratkaisee voittajan."
 * - RA4 kohta 15.4:   "Kokonaiskilpailussa parempi **PA2**:n tulos ratkaisee voittajan."
 *
 * PA2 tulkitaan RA2:ksi: RA2 on ainoa laji, jonka omissa säännöissä kohta on kirjoitettu
 * muotoon "RA2". RA2:n luettelossa on kolme kohtaa neljän sijaan, koska siitä puuttuu
 * huonomman kilpasarjan vertailu — se on summalaji, jossa kaikki sarjat lasketaan.
 *
 * Säännöt eivät määrittele, mistä lajeista kokonaiskilpailu muodostuu; kokonaiskilpailu
 * mainitaan asiakirjoissa vain tässä tasatuloskohdassa. Kaikkien lajien summaaminen on
 * siis tämän sovelluksen tulkinta, ei sääntöteksti.
 */

/** RESUL-sääntöjen mukainen tasatuloksen ratkaisijalaji kokonaiskilpailussa. */
export const RESUL_TASATULOKSEN_RATKAISIJA = 'RA2'

export interface KokonaisRivi {
  sija: number
  jaettu: boolean
  kilpailija: Kilpailija
  /** Lajikohtaiset pisteet. Laji johon ei osallistuttu on `null`. */
  lajipisteet: Record<LajiId, number | null>
  pisteet: number
  /** Montako lajia kilpailija on ampunut? */
  lajeja: number
  /** Onko kisan kaikki lajit ammuttu? */
  kaikkiLajit: boolean
}

export interface KokonaisOptiot {
  /**
   * Vaaditaanko kaikki neljä lajia mukaan pääsemiseksi. Oletuksena ei — kesken oleva
   * kisa näyttää silloin osittaisen tilanteen.
   */
  vaadiKaikkiLajit?: boolean
  /**
   * Kisan lajikohtaiset rakenteet. Ilman näitä käytetään sääntöjen oletuksia, jolloin
   * järjestäjän muokkaama tulossääntö ei vaikuttaisi laskentaan. Kutsujan on annettava
   * nämä aina, kun käytettävissä on kisan omat asetukset.
   */
  maaritykset?: Record<LajiId, Pick<LajiMaaritys, 'tulosSaanto'>>
  /**
   * Lajit, joista kokonaiskilpailu muodostuu. Ilman tätä käytetään RESUL-lajeja.
   */
  lajit?: LajiRakenne[]
  /**
   * Laji, jonka parempi tulos ratkaisee tasatuloksen.
   *
   * RESUL-kisassa `RA2`, koska sääntöjen tasatuloskohta sanoo niin. Mukautetussa
   * kisassa vastaavaa sääntöä ei ole, joten ilman tätä tasatulos ratkeaa sukunimen
   * mukaan — arvattu ratkaisijalaji olisi pahempi kuin ei mitään.
   */
  tasatuloksenRatkaisija?: LajiId
}

export function kokonaiskilpailu(
  kilpailijat: Kilpailija[],
  optiot: KokonaisOptiot = {},
): KokonaisRivi[] {
  const { vaadiKaikkiLajit = false, maaritykset, tasatuloksenRatkaisija } = optiot
  const lajit = optiot.lajit
  const tunnisteet = lajit?.map((l) => l.id) ?? LAJI_KOODIT
  const ratkaisija = tasatuloksenRatkaisija ?? (lajit ? undefined : RESUL_TASATULOKSEN_RATKAISIJA)

  const rivit: Omit<KokonaisRivi, 'sija' | 'jaettu'>[] = []

  for (const k of kilpailijat) {
    const lajipisteet = Object.fromEntries(tunnisteet.map((l) => [l, null])) as Record<
      LajiId,
      number | null
    >
    let pisteet = 0
    let lajeja = 0

    for (const laji of tunnisteet) {
      const osallistuminen = k.osallistumiset[laji]
      if (!osallistuminen) continue
      const rakenne =
        maaritykset?.[laji] ??
        lajit?.find((l) => l.id === laji) ??
        LAJIT[laji as keyof typeof LAJIT]
      const tulos = laskeLaji(laji, rakenne, osallistuminen)
      if (!tulos.aloitettu) continue
      // Turvallisuusrike sulkee kilpailijan pois koko kilpailusta.
      if (tulos.hylatty) {
        lajipisteet[laji] = 0
        lajeja++
        continue
      }
      lajipisteet[laji] = tulos.pisteet
      pisteet += tulos.pisteet
      lajeja++
    }

    if (lajeja === 0) continue
    const kaikkiLajit = tunnisteet.every((l) => lajipisteet[l] !== null)
    if (vaadiKaikkiLajit && !kaikkiLajit) continue

    rivit.push({ kilpailija: k, lajipisteet, pisteet, lajeja, kaikkiLajit })
  }

  const jarjestetyt = rivit.sort((a, b) => {
    if (a.pisteet !== b.pisteet) return b.pisteet - a.pisteet
    // Tasatuloksen ratkaisee ratkaisijalajin parempi tulos, jos sellainen on.
    if (ratkaisija) {
      const ero = (b.lajipisteet[ratkaisija] ?? -1) - (a.lajipisteet[ratkaisija] ?? -1)
      if (ero !== 0) return ero
    }
    return vertaaNimia(a.kilpailija, b.kilpailija)
  })

  const tulos: KokonaisRivi[] = jarjestetyt.map((r, i) => ({ ...r, sija: i + 1, jaettu: false }))

  let edellinen: KokonaisRivi | undefined
  for (const nykyinen of tulos) {
    if (edellinen) {
      const samatPisteet = nykyinen.pisteet === edellinen.pisteet
      // Sijoilla 1–8 myös RA2-tulos ratkaisee; sen jälkeen sama yhteistulos riittää.
      const tasa =
        edellinen.sija <= TARKAN_TULKKAUKSEN_RAJA && ratkaisija
          ? samatPisteet &&
            (nykyinen.lajipisteet[ratkaisija] ?? -1) === (edellinen.lajipisteet[ratkaisija] ?? -1)
          : samatPisteet
      if (tasa) nykyinen.sija = edellinen.sija
    }
    edellinen = nykyinen
  }

  const maarat = new Map<number, number>()
  for (const r of tulos) maarat.set(r.sija, (maarat.get(r.sija) ?? 0) + 1)
  for (const r of tulos) r.jaettu = (maarat.get(r.sija) ?? 0) > 1

  return tulos
}
