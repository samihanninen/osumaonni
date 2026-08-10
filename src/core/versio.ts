/**
 * Sovelluksen versionumero.
 *
 * Arvo tulee package.jsonista käännösaikana, joten se ei voi jäädä jälkeen todellisesta
 * versiosta. Numero näytetään jokaisen sivun alalaidassa.
 *
 * Syy näkyvyyteen on käytännöllinen. Tulosten yhdistäminen QR-koodilla tarkistaa
 * siirtomuodon version, ja eri versiot voivat kieltäytyä lukemasta toistensa koodeja
 * (`SIIRTO_VERSIO`, ks. `io/siirto.ts`). Silloin sovellus kehottaa päivittämään — mutta
 * kehotus on toimintakelvoton, jos kumpikaan käyttäjä ei näe kummassa laitteessa on
 * mikäkin versio. Sama koskee vikailmoituksia: ilman numeroa ei tiedä mistä versiosta
 * puhutaan.
 */
export const VERSIO: string = __SOVELLUS_VERSIO__
