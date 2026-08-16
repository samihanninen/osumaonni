import type { Kilpailija, Laji, LajiMaaritys } from '@/types/kisa'
import { LAJIT, LAJI_KOODIT } from './lajit'
import { laskeLaji } from './laskenta'
import { vertaaNimia, TARKAN_TULKKAUKSEN_RAJA } from './sijoitukset'

/**
 * Kokonaiskilpailu — kilpailijan yhteistulos kaikista lajeista.
 *
 * Sääntöjen tasatuloskohta 4 kaikissa neljässä lajissa: "Kokonaiskilpailussa parempi
 * RA2:n tulos ratkaisee voittajan." (RA1:n ja RA3:n vanhemmissa versioissa sama kohta
 * on kirjoitettu muotoon "PA2:n tulos", mutta tarkoittaa samaa.)
 */

export interface KokonaisRivi {
  sija: number
  jaettu: boolean
  kilpailija: Kilpailija
  /** Lajikohtaiset pisteet. Laji johon ei osallistuttu on `null`. */
  lajipisteet: Record<Laji, number | null>
  pisteet: number
  /** Montako lajia kilpailija on ampunut? */
  lajeja: number
  /** Onko kaikki neljä lajia ammuttu? */
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
  maaritykset?: Record<Laji, LajiMaaritys>
}

export function kokonaiskilpailu(
  kilpailijat: Kilpailija[],
  optiot: KokonaisOptiot = {},
): KokonaisRivi[] {
  const { vaadiKaikkiLajit = false, maaritykset } = optiot

  const rivit: Omit<KokonaisRivi, 'sija' | 'jaettu'>[] = []

  for (const k of kilpailijat) {
    const lajipisteet = { RA1: null, RA2: null, RA3: null, RA4: null } as Record<
      Laji,
      number | null
    >
    let pisteet = 0
    let lajeja = 0

    for (const laji of LAJI_KOODIT) {
      const osallistuminen = k.osallistumiset[laji]
      if (!osallistuminen) continue
      const tulos = laskeLaji(laji, maaritykset?.[laji] ?? LAJIT[laji], osallistuminen)
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
    const kaikkiLajit = LAJI_KOODIT.every((l) => lajipisteet[l] !== null)
    if (vaadiKaikkiLajit && !kaikkiLajit) continue

    rivit.push({ kilpailija: k, lajipisteet, pisteet, lajeja, kaikkiLajit })
  }

  const jarjestetyt = rivit.sort((a, b) => {
    if (a.pisteet !== b.pisteet) return b.pisteet - a.pisteet
    // Tasatuloksen ratkaisee parempi RA2:n tulos.
    const ra2 = (b.lajipisteet.RA2 ?? -1) - (a.lajipisteet.RA2 ?? -1)
    if (ra2 !== 0) return ra2
    return vertaaNimia(a.kilpailija, b.kilpailija)
  })

  const tulos: KokonaisRivi[] = jarjestetyt.map((r, i) => ({ ...r, sija: i + 1, jaettu: false }))

  let edellinen: KokonaisRivi | undefined
  for (const nykyinen of tulos) {
    if (edellinen) {
      const samatPisteet = nykyinen.pisteet === edellinen.pisteet
      // Sijoilla 1–8 myös RA2-tulos ratkaisee; sen jälkeen sama yhteistulos riittää.
      const tasa =
        edellinen.sija <= TARKAN_TULKKAUKSEN_RAJA
          ? samatPisteet && (nykyinen.lajipisteet.RA2 ?? -1) === (edellinen.lajipisteet.RA2 ?? -1)
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
