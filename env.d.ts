/// <reference types="vite/client" />

/*
 * Lataa pinia-plugin-persistedstate:n tyyppilaajennus, joka lisää `persist`-asetuksen
 * Pinian storeihin. Sovelluskoodissa laajennus tulisi main.ts:n importin kautta, mutta
 * testiprojekti (tsconfig.vitest.json) sisältää vain testitiedostot ja ylikirjoittaa
 * `types`-asetuksen, joten laajennus on viitattava tässä. env.d.ts kuuluu molempiin
 * projekteihin.
 */
/// <reference types="pinia-plugin-persistedstate" />

/* Tyypit vite-plugin-pwa:n virtuaalimoduulille `virtual:pwa-register/vue`. */
/// <reference types="vite-plugin-pwa/vue" />
/// <reference types="vite-plugin-pwa/client" />

/*
 * Sovelluksen versionumero. Vite korvaa tämän käännösaikana package.jsonin versiolla
 * (`define` vite.config.ts:ssä), joten arvoa ei voi unohtaa päivittää erikseen.
 *
 * HUOM: tämän on pysyttävä kaikkien /// <reference> -rivien jälkeen. Ne ovat voimassa
 * vain tiedoston alussa ennen ensimmäistä lausetta, ja tämän siirtäminen ylemmäs
 * katkaisee alapuolelleen jäävät viittaukset.
 */
declare const __SOVELLUS_VERSIO__: string
