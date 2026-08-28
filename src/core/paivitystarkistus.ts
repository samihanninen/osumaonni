/**
 * Uuden version etsiminen taustalla.
 *
 * Service worker tarkistaa itsensä vain sivunlatauksen yhteydessä. Asennettu sovellus
 * ei kuitenkaan lataudu uudelleen juuri koskaan: puhelimessa se herää taustalta samaan
 * välilehteen viikkokausia, jolloin `needRefresh` ei ehdi nousta eikä päivitysilmoitus
 * ilmesty — sovellus jää vanhaan versioon vaikka uusi on julkaistu. Siksi versiota
 * kysytään erikseen.
 */

/** Kuinka usein uutta versiota kysytään, kun sovellus on auki ja näkyvissä. */
export const TARKISTUSVALI_MS = 60 * 60 * 1000

/** Se osa ServiceWorkerRegistrationia, jota tarkistus käyttää. */
export interface Paivitettava {
  update: () => Promise<unknown>
}

export interface Tarkistusymparisto {
  verkossa: () => boolean
  hae: (osoite: string, asetukset?: RequestInit) => Promise<{ status: number }>
}

const oletusymparisto: Tarkistusymparisto = {
  verkossa: () => !('onLine' in navigator) || navigator.onLine,
  hae: (osoite, asetukset) => fetch(osoite, asetukset),
}

/**
 * Kysyy palvelimelta, onko service worker vaihtunut.
 *
 * Palauttaa `true` vain jos päivitys todella kysyttiin. Tarkistus ohitetaan kahdessa
 * tapauksessa:
 *
 * 1. Ilman verkkoyhteyttä. Ampumaradalla ollaan usein katvessa, ja koko sovelluksen
 *    idea on toimia siellä ilman verkkoa.
 * 2. Kun palvelin vastaa muuta kuin 200. Kirjautumis- tai virhesivu ei ole uusi versio,
 *    ja sellaisen syöttäminen `update()`:lle voi purkaa rekisteröinnin — jolloin
 *    offline-tuki katoaisi juuri siinä tilanteessa, jossa sitä eniten tarvitaan.
 */
export async function tarkistaPaivitys(
  swOsoite: string,
  rekisterointi: Paivitettava,
  ymparisto: Tarkistusymparisto = oletusymparisto,
): Promise<boolean> {
  if (!ymparisto.verkossa()) return false
  try {
    const vastaus = await ymparisto.hae(swOsoite, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    })
    if (vastaus.status !== 200) return false
    await rekisterointi.update()
    return true
  } catch {
    // Verkkovirhe on tavallinen eikä sen takia kannata häiritä käyttäjää kesken
    // kilpailun. Yritetään uudelleen seuraavalla kierroksella.
    return false
  }
}
