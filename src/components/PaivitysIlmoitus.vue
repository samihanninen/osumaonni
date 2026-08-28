<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { TARKISTUSVALI_MS, tarkistaPaivitys } from '@/core/paivitystarkistus'

/**
 * Sovelluksen päivitys.
 *
 * Päivitystä ei asenneta itsestään: kesken kilpailun tapahtuva uudelleenlataus olisi
 * hämmentävää, joten käyttäjä päättää ajankohdan. Tiedot säilyvät kummassakin
 * tapauksessa, koska ne ovat localStoragessa.
 */

/*
 * Ajastimet ja kuuntelijat puretaan kerralla täältä.
 *
 * `onScopeDispose` on kutsuttava suoraan setupissa. Aiemmin sitä kutsuttiin
 * watch-takaisinkutsun sisältä, jolloin aktiivista scopea ei enää ollut: ajastin jäi
 * siivoamatta ja Vue varoitti kehityksessä. Sama virhe toistuisi nyt helposti
 * `onRegisteredSW`:ssä, joka on niin ikään asynkroninen.
 */
const siivoukset: Array<() => void> = []
onScopeDispose(() => {
  while (siivoukset.length) siivoukset.pop()?.()
})

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
  onRegisteredSW: (swOsoite, rekisterointi) => {
    if (rekisterointi) ajastaTarkistukset(swOsoite, rekisterointi)
  },
})
const piilotettu = ref(false)

/** Offline-ilmoitus on pelkkä tiedote, joten se poistuu itsestään. */
const OFFLINE_NAKYVISSA_MS = 8000

watch(offlineReady, (valmis) => {
  if (!valmis) return
  const ajastin = setTimeout(() => (offlineReady.value = false), OFFLINE_NAKYVISSA_MS)
  siivoukset.push(() => clearTimeout(ajastin))
})

/** Etsii uutta versiota niin kauan kuin sovellus on auki. */
function ajastaTarkistukset(swOsoite: string, rekisterointi: ServiceWorkerRegistration) {
  const tarkista = () => void tarkistaPaivitys(swOsoite, rekisterointi)

  const ajastin = setInterval(tarkista, TARKISTUSVALI_MS)
  siivoukset.push(() => clearInterval(ajastin))

  /*
   * Pelkkä ajastin ei riitä: taustalle jäänyt välilehti jäädytetään, jolloin ajastin ei
   * laukea lainkaan. Juuri niin asennettu sovellus käyttäytyy puhelimessa — se herää
   * taustalta samaan istuntoon eikä lataudu uudelleen. Paluu sovellukseen on siis
   * käytännössä ainoa hetki, jolloin puhelin voi huomata uuden version.
   */
  const kunPalataan = () => {
    if (document.visibilityState === 'visible') tarkista()
  }
  document.addEventListener('visibilitychange', kunPalataan)
  siivoukset.push(() => document.removeEventListener('visibilitychange', kunPalataan))
}

function paivita() {
  void updateServiceWorker(true)
}

function ohita() {
  piilotettu.value = true
  needRefresh.value = false
  offlineReady.value = false
}
</script>

<template>
  <aside
    v-if="!piilotettu && (needRefresh || offlineReady)"
    class="ilmoitus"
    role="status"
    aria-live="polite"
  >
    <template v-if="needRefresh">
      <span class="teksti">
        <strong>Uusi versio saatavilla.</strong> Kirjatut tulokset säilyvät päivityksessä.
      </span>
      <button type="button" class="nappi nappi--ensisijainen pieni" @click="paivita">
        Päivitä
      </button>
      <button type="button" class="nappi pieni" @click="ohita">Myöhemmin</button>
    </template>
    <template v-else>
      <span class="teksti">
        <strong>Sovellus toimii nyt myös ilman verkkoyhteyttä.</strong>
      </span>
      <button type="button" class="nappi pieni" @click="ohita">Selvä</button>
    </template>
  </aside>
</template>

<style scoped>
/*
 * Ilmoitus on tavallisessa tekstivirrassa, EI kelluvana laatikkona.
 *
 * Aiemmin tämä oli `position: fixed` näytön alalaidassa, jolloin se peitti juuri sen
 * kohdan, johon laukausnäppäimistö on kiinnitetty — eli esti tulosten kirjaamisen,
 * kunnes ilmoitus suljettiin. Vika ei näkynyt kehityspalvelimella, koska service worker
 * rekisteröidään vasta tuotantoversiossa; selaintestit tuotantobuildia vasten paljastivat
 * sen. Tekstivirrassa ilmoitus ei voi peittää mitään.
 */
.ilmoitus {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--vari-korostus);
  border-radius: var(--reunapyoristys);
  background: var(--vari-tausta-korotettu);
  font-size: 0.88rem;
}
.teksti {
  flex: 1 1 14rem;
}
.pieni {
  min-height: 38px;
  padding: 0.3rem 0.7rem;
  font-size: 0.85rem;
}

@media print {
  .ilmoitus {
    display: none;
  }
}
</style>
