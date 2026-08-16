import type { Kisa } from '@/types/kisa'

/**
 * Tallennetun kisan skeemaversio ja siirtymät versiosta toiseen.
 *
 * Selaimen localStorage on ainoa kopio kirjatuista tuloksista. Sovellus päivittyy
 * käyttäjän omalla ajoituksella, joten uusi versio kohtaa väistämättä vanhemmalla
 * versiolla kirjoitettuja tietoja. Ja koska virheellinen julkaisu perutaan julkaisemalla
 * edellinen versio uudelleen, vanha versio kohtaa yhtä väistämättä myös **uudemmalla**
 * versiolla kirjoitettuja tietoja. Kumpikaan suunta ei saa hävittää kisaa.
 *
 * Sääntö on siksi yksi: tietoja luetaan vain silloin, kun niiden rakenne tunnetaan.
 * Tuntematonta ei arvata eikä ylikirjoiteta. Sivuston peruminen palauttaa sovelluksen,
 * mutta ei laitteelle jo kirjoitettuja tietoja — siksi vahinko on estettävä täällä
 * eikä vasta julkaisuputkessa.
 */

/**
 * Tallennusmuodon versio. Kasvatetaan aina, kun `Kisa`-rakenne muuttuu niin, ettei
 * vanha tallennus enää lataudu oikein — ja samalla lisätään migraatio `MIGRAATIOT`-
 * taulukkoon. Pelkkä uusi valinnainen kenttä ei vaadi kasvatusta, koska vanha tallennus
 * latautuu siitä huolimatta oikein.
 */
export const KISA_SKEEMA_VERSIO = 1

/**
 * Miten tallennuksen luku päättyi.
 *
 * - `tyhja` — tallennusta ei ole; ensimmäinen käynnistys
 * - `ok` — versio täsmää, tiedot otetaan käyttöön sellaisenaan
 * - `migroitu` — vanhempi versio päivitettiin nykyiseen rakenteeseen
 * - `uudempi` — tallennus on uudemmalta sovellusversiolta, jota tämä ei osaa lukea
 * - `vioittunut` — tallennusta ei voi tulkita lainkaan
 */
export type SkeemaTila = 'tyhja' | 'ok' | 'migroitu' | 'uudempi' | 'vioittunut'

export interface LuentaTulos {
  tila: SkeemaTila
  /**
   * Käyttöön otettava tila. Puuttuu aina, kun `tila` on `uudempi` tai `vioittunut`:
   * tuntematonta rakennetta ei hydratoida sovellukseen puolittain.
   */
  tallennettu?: { kisa: Kisa }
  /** Tallennuksesta löytynyt versionumero, jos se oli luettavissa. */
  loydettyVersio?: number
}

/** Yhden versioaskeleen siirtymä: versiosta `n` versioon `n + 1`. */
export type Migraatio = (kisa: Record<string, unknown>) => Record<string, unknown>

/**
 * Migraatiot versionumeron mukaan: avain `n` muuntaa version `n` versioksi `n + 1`.
 *
 * Tyhjä, koska versio 1 on ensimmäinen. Ensimmäinen rakennemuutos lisää tänne avaimen
 * `1`, kasvattaa `KISA_SKEEMA_VERSIO`:n kahteen ja tuo mukanaan testin, joka lataa
 * aidon version 1 tallennuksen läpi ketjun.
 */
export const MIGRAATIOT: Record<number, Migraatio> = {}

/**
 * Ajaa migraatiot yksi versio kerrallaan. Ketjuna eikä hyppäyksinä, jotta jokainen
 * askel tulee koetelluksi myös silloin, kun laite on ollut käyttämättä monta versiota.
 *
 * Palauttaa `null`, jos jokin askel puuttuu — silloin lopputulos olisi arvaus.
 */
export function migroi(
  kisa: Record<string, unknown>,
  mista: number,
  mihin: number = KISA_SKEEMA_VERSIO,
  migraatiot: Record<number, Migraatio> = MIGRAATIOT,
): Record<string, unknown> | null {
  let tila = kisa
  for (let v = mista; v < mihin; v++) {
    const askel = migraatiot[v]
    if (!askel) return null
    tila = askel(tila)
  }
  return { ...tila, schemaVersion: mihin }
}

/** Kelpaako arvo versionumeroksi? Vain positiivinen kokonaisluku kelpaa. */
function onVersionumero(arvo: unknown): arvo is number {
  return typeof arvo === 'number' && Number.isInteger(arvo) && arvo >= 1
}

/**
 * Tulkitsee localStorageen tallennetun merkkijonon.
 *
 * Puhdas funktio: ei lue eikä kirjoita selaimen muistia, jotta päätös siitä *saako*
 * tietoja käyttää on testattavissa ilman selainta. Kutsuja vastaa siitä, mitä
 * hylätylle tallennukselle tehdään.
 */
export function lueTallennettu(
  raaka: string | null | undefined,
  migraatiot: Record<number, Migraatio> = MIGRAATIOT,
  nykyinen: number = KISA_SKEEMA_VERSIO,
): LuentaTulos {
  if (!raaka) return { tila: 'tyhja' }

  let jasennetty: unknown
  try {
    jasennetty = JSON.parse(raaka)
  } catch {
    return { tila: 'vioittunut' }
  }

  if (!jasennetty || typeof jasennetty !== 'object') return { tila: 'vioittunut' }

  // Tallennettu muoto on koko storen tila, jonka sisällä kisa on omana kenttänään.
  const pesa = (jasennetty as Record<string, unknown>).kisa
  if (!pesa || typeof pesa !== 'object' || Array.isArray(pesa)) return { tila: 'vioittunut' }

  const kisa = pesa as Record<string, unknown>
  const versio = kisa.schemaVersion

  // Versioton tallennus on tuntematonta alkuperää. Sitä ei tulkita versioksi 1, koska
  // arvaus voisi lukea väärän rakenteen oikeana ja hukata tulokset huomaamatta.
  if (!onVersionumero(versio)) return { tila: 'vioittunut' }

  if (versio > nykyinen) {
    return { tila: 'uudempi', loydettyVersio: versio }
  }

  if (versio < nykyinen) {
    const migroitu = migroi(kisa, versio, nykyinen, migraatiot)
    if (!migroitu) return { tila: 'vioittunut', loydettyVersio: versio }
    return {
      tila: 'migroitu',
      tallennettu: { kisa: migroitu as unknown as Kisa },
      loydettyVersio: versio,
    }
  }

  return { tila: 'ok', tallennettu: { kisa: kisa as unknown as Kisa }, loydettyVersio: versio }
}
