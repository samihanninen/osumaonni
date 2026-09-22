import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * Hash history on purpose: GitHub Pages has no server-side rewrite, so a real
 * history router would 404 on deep links unless we ship a 404.html redirect
 * hack. Hash routing sidesteps that entirely and deep links still work.
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'etusivu',
      component: () => import('@/views/EtusivuView.vue'),
      meta: { otsikko: 'Etusivu' },
    },
    {
      path: '/kisatiedot',
      name: 'kisatiedot',
      component: () => import('@/views/KisatiedotView.vue'),
      meta: { otsikko: 'Kisatiedot' },
    },
    {
      path: '/kilpailijat',
      name: 'kilpailijat',
      component: () => import('@/views/KilpailijatView.vue'),
      meta: { otsikko: 'Kilpailijat' },
    },
    /*
     * Rosteri on tarkoituksella poissa päävalikosta (`App.vue`): se ei ole kisadataa
     * vaan tämän laitteen oma nimilista, ja sinne mennään kilpailijalistalta ja
     * palataan takaisin. Valikossa se näyttäisi kisan osalta.
     */
    {
      path: '/rosteri',
      name: 'rosteri',
      component: () => import('@/views/RosteriView.vue'),
      meta: { otsikko: 'Rosteri' },
    },
    {
      path: '/syota/:laji',
      name: 'syotto',
      component: () => import('@/views/SyottoView.vue'),
      meta: { otsikko: 'Tulosten syöttö' },
    },
    {
      path: '/tulokset/:laji',
      name: 'sijoitukset',
      component: () => import('@/views/SijoituksetView.vue'),
      meta: { otsikko: 'Sijoitukset' },
    },
    {
      path: '/yhdistykset',
      name: 'yhdistykset',
      component: () => import('@/views/YhdistyksetView.vue'),
      meta: { otsikko: 'Yhdistyskilpailu' },
    },
    {
      path: '/yhdista',
      name: 'yhdista',
      component: () => import('@/views/YhdistaView.vue'),
      meta: { otsikko: 'Yhdistä tulokset' },
    },
    {
      path: '/vienti',
      name: 'vienti',
      component: () => import('@/views/VientiView.vue'),
      meta: { otsikko: 'Vienti ja tuonti' },
    },
    {
      path: '/ohje',
      name: 'ohje',
      component: () => import('@/views/OhjeView.vue'),
      meta: { otsikko: 'Kilpailupäivän ohje' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'ei-loytynyt',
      component: () => import('@/views/EiLoytynytView.vue'),
      meta: { otsikko: 'Sivua ei löytynyt' },
    },
  ],
})

/**
 * Palautuminen vanhentuneesta välimuistista.
 *
 * Näkymät ladataan dynaamisesti, ja jokainen julkaisu tuottaa uudet tiedostonimet. Jos
 * laitteessa on vanha service worker tai välimuistissa vanha index.html, se yrittää
 * hakea lohkoa jota ei enää ole. Vue Router hylkää silloin siirtymän hiljaisesti:
 * käyttäjälle se näyttää siltä, että linkit eivät toimi lainkaan.
 *
 * Ladataan tällöin sivu kertaalleen uudelleen, jolloin uusin versio haetaan
 * palvelimelta. Merkintä pidetään sessionStoragessa, jottei synny loputonta silmukkaa
 * silloin kun vika on jokin muu.
 */
const LATAUSMERKINTA = 'osumaonni-lohkolataus'

/** Onko virhe lohkotiedoston latausvirhe? Selaimet sanovat sen eri tavoin. */
export function onLohkonLatausVirhe(virhe: unknown): boolean {
  const viesti = virhe instanceof Error ? `${virhe.name}: ${virhe.message}` : String(virhe)
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Failed to fetch dynamically/i.test(
    viesti,
  )
}

router.onError((virhe, kohde) => {
  if (!onLohkonLatausVirhe(virhe)) return
  try {
    if (sessionStorage.getItem(LATAUSMERKINTA)) return
    sessionStorage.setItem(LATAUSMERKINTA, '1')
  } catch {
    return // yksityinen selaus: ei yritetä uudelleen
  }
  // Siirrytään haluttuun osoitteeseen ja haetaan sovellus uudelleen palvelimelta.
  window.location.hash = `#${kohde.fullPath}`
  window.location.reload()
})

router.afterEach(() => {
  try {
    sessionStorage.removeItem(LATAUSMERKINTA)
  } catch {
    // ei väliä
  }
})

export default router
