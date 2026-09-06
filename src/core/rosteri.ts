import type { SarjaId } from '@/types/kisa'

/**
 * Rosteri eli laitteelle jäävä henkilölista.
 *
 * Pienessä yhdistyksessä samat ihmiset ampuvat kisan toisensa jälkeen, mutta kisa on
 * kertakäyttöinen: `Aloita uusi kisa` poistaa kilpailijat, ja seuraavana kertana samat
 * nimet, yhdistykset ja sarjat naputellaan uudelleen. Rosteri on se lista, joka jää —
 * siitä täpätään kisaan sen päivän väki.
 *
 * **Rosteri ei ole osa kisadataa.** Sitä ei viedä Exceliin, ei lähetetä QR-koodissa eikä
 * yhdistetä laitteiden välillä: se kuvaa tätä laitetta ja sen käyttäjän omaa porukkaa,
 * ei kilpailua. Yhdistäminen tunnistaa kilpailijan nimestä ja tunnisteesta, joten
 * rosterin ei tarvitse siirtyä mukana.
 *
 * Nimet ja yhdistykset ovat henkilötietoja, ja rosteri säilyttää niitä pidempään kuin
 * yksi kisa — tarkoituksella. Siksi rosterista pitää päästä eroon yhtä helposti kuin
 * kisasta: yksitellen kilpailijalistalta ja kokonaan Kisatiedot-sivun alaosasta.
 */
export interface RosteriHenkilo {
  /**
   * Pysyvä tunniste. Sama tunniste annetaan kisaan lisätylle kilpailijalle, joten sama
   * henkilö tunnistetaan kisasta suoraan — myös silloin kun nimeä on kisan puolella
   * korjattu.
   */
  id: string
  etunimi: string
  /** Pakollinen: kilpailija ei kelpaa kisaan ilman sukunimeä, joten ei rosteriin. */
  sukunimi: string
  yhdistys: string
  /**
   * Viimeksi käytetty sarja. Otetaan käyttöön vain jos kisassa on samanniminen sarja:
   * RESUL-kisan H50 ei tarkoita mitään mukautetussa kisassa, jossa sarjat ovat
   * järjestäjän itse nimeämiä.
   */
  ikasarja?: SarjaId
}

/**
 * Henkilön tunnistus nimen ja yhdistyksen perusteella.
 *
 * Sama muoto kuin tulosten yhdistämisessä (`core/yhdistaminen`), ja tarkoituksella
 * yhteinen funktio: jos normalisointi eroaisi, sama henkilö tunnistettaisiin
 * yhdistämisessä ja rosterissa eri tavalla. Yhdistys kuuluu avaimeen, koska
 * yhdistyskilpailussa kaksi samannimistä eri yhdistyksestä ovat eri kilpailijat.
 */
export function henkiloAvain(h: { etunimi: string; sukunimi: string; yhdistys: string }): string {
  return [h.sukunimi, h.etunimi, h.yhdistys]
    .map((osa) => (osa ?? '').trim().toLocaleLowerCase('fi'))
    .join('|')
}

/** Järjestää henkilöt sukunimen mukaan, kuten kilpailijalista. */
export function jarjestaHenkilot(lista: readonly RosteriHenkilo[]): RosteriHenkilo[] {
  return [...lista].sort(
    (a, b) =>
      a.sukunimi.localeCompare(b.sukunimi, 'fi') || a.etunimi.localeCompare(b.etunimi, 'fi'),
  )
}

function teksti(arvo: unknown): string {
  return typeof arvo === 'string' ? arvo.trim() : ''
}

/**
 * Tulkitsee laitteelle tallennetun rosterin.
 *
 * Rosteri ei ole versioitua kisadataa (ks. `core/skeema`) — se on uudelleen kirjattavissa
 * oleva mukavuuslista, joten tuntematonta ei oteta talteen vaan kelvottomat rivit
 * yksinkertaisesti pudotetaan. Puhdistus on tässä eikä storessa, jotta se on
 * testattavissa ilman selainta.
 */
export function puhdistaRosteri(arvo: unknown): RosteriHenkilo[] {
  if (!Array.isArray(arvo)) return []
  const tulos: RosteriHenkilo[] = []
  const nahdyt = new Set<string>()

  for (const rivi of arvo) {
    if (!rivi || typeof rivi !== 'object') continue
    const r = rivi as Record<string, unknown>
    const id = teksti(r.id)
    const sukunimi = teksti(r.sukunimi)
    // Ilman tunnistetta tai sukunimeä henkilöä ei voi lisätä kisaan, joten rivi on turha.
    if (!id || !sukunimi) continue

    const henkilo: RosteriHenkilo = {
      id,
      etunimi: teksti(r.etunimi),
      sukunimi,
      yhdistys: teksti(r.yhdistys),
      ...(teksti(r.ikasarja) ? { ikasarja: teksti(r.ikasarja) } : {}),
    }

    // Sama henkilö vain kertaalleen: kaksoiskappale näkyisi listassa kahtena rastina,
    // joista toinen ei tekisi mitään.
    const avain = henkiloAvain(henkilo)
    if (nahdyt.has(avain) || nahdyt.has(id)) continue
    nahdyt.add(avain)
    nahdyt.add(id)
    tulos.push(henkilo)
  }
  return tulos
}
