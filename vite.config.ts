import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

/*
 * Versionumero luetaan package.jsonista, jotta se on yhdessä paikassa. Numero näkyy
 * sovelluksen alalaidassa: kun kaksi laitetta ei saa yhdistettyä tuloksiaan, ensimmäinen
 * kysymys on kummassa on mikäkin versio, eikä siihen voi vastata ilman että numero on
 * näkyvissä. Samasta syystä se on myös vikailmoituksissa käyttökelpoinen tieto.
 */
const { version: sovellusVersio } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  define: {
    __SOVELLUS_VERSIO__: JSON.stringify(sovellusVersio),
  },
  /*
   * Served from https://samihanninen.github.io/osumaonni/ — the trailing slash matters.
   *
   * Kaikki pienellä tarkoituksella: GitHub Pages tarjoilee polun kirjainkoolle tarkasti
   * (vain repon nimen kirjoitusasu vastaa, muut antavat 404), eikä sitä voi asetuksella
   * muuttaa. Puhelimessa käsin kirjoitettava osoite on siksi kokonaan pienellä. Repon
   * nimen on vastattava tätä polkua kirjaimelleen.
   */
  base: '/osumaonni/',
  plugins: [
    vue(),
    vueDevTools(),
    /*
     * Offline-tuki ei ole tässä sovelluksessa lisäominaisuus: ampumaradalla ei usein ole
     * kelvollista verkkoyhteyttä, ja kotivalikkoon asennettuna selain myös karsii
     * tallennettuja tietoja epätodennäköisemmin kuin tavallisessa välilehdessä.
     */
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'OsumaOnni — Reserviläisammunnan tuloskortti',
        short_name: 'OsumaOnni',
        description:
          'Reserviläisammunnan tuloskortti. Tulokset tallentuvat vain omalle laitteelle.',
        lang: 'fi',
        theme_color: '#1f6f4a',
        background_color: '#f7f7f8',
        display: 'standalone',
        orientation: 'any',
        // Hash-reititys, joten aloitus osoitteen juuresta riittää.
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // ExcelJS on iso mutta tarvitaan viennissä myös ilman verkkoa.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        /*
         * Vanhat välimuistit siivotaan, jottei laitteelle jää viittauksia lohkoihin,
         * joita ei enää ole palvelimella. Sellainen tila estäisi näkymien latautumisen
         * kokonaan — linkit näyttäisivät toimimattomilta.
         */
        cleanupOutdatedCaches: true,
        // Hash-reititys tarkoittaa, että kaikki osoitteet tarjoillaan index.html:stä.
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    /*
     * ExcelJS on noin 930 kB oma paketti. Se ladataan tarkoituksella vasta kun tuloksia
     * viedään tai tuodaan (dynaaminen import), joten se ei ole mukana sovelluksen
     * käynnistyksessä. Nostetaan raja, jottei odotettu tilanne näytä virheeltä CI:ssä.
     */
    chunkSizeWarningLimit: 1000,
  },
})
