<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useKisaStore } from '@/stores/kisa'
import RosteriValinta from '@/components/RosteriValinta.vue'

/**
 * Rosteri omana sivunaan.
 *
 * Rosteri oli ennen taitettu osio kilpailijalistan yläpuolella. Avattuna samat ihmiset
 * näkyivät sivulla kahdesti — rosterissa ja kisan kilpailijalistassa — eikä kumpaa
 * listaa milloinkin muokkasi erottunut. Omalla sivulla tehdään yksi asia kerrallaan:
 * täpätään päivän väki ja palataan valmiiseen kilpailijalistaan.
 *
 * Sivu on tarkoituksella poissa päävalikosta, ks. `router/index.ts`.
 */
const store = useKisaStore()
const router = useRouter()

/**
 * Paluu `replace`illa eikä `push`illa: rosteri on sivupolku kilpailijalistalta, ei oma
 * määränpäänsä. Pushilla historiaan jäisi Kilpailijat → Rosteri → Kilpailijat, jolloin
 * laitteen paluupainike toisi takaisin rosteriin. `router.back()` taas hajoaisi silloin,
 * kun sivulle on tultu suoralla linkillä tai uudelleenlatauksen jälkeen: paluu veisi
 * ulos sovelluksesta.
 */
function valmis() {
  router.replace('/kilpailijat')
}

/** Paluunappi kertoo lopputuloksen: montako kilpailijaa kisassa täppäämisen jälkeen on. */
const valmisTeksti = computed(() => {
  const n = store.kilpailijoita
  if (n === 0) return 'Takaisin kilpailijoihin'
  return `Valmis — kisassa ${n === 1 ? '1 kilpailija' : `${n} kilpailijaa`}`
})
</script>

<template>
  <section class="sivu">
    <!-- Paluu myös ylhäältä: listan alkupäässä ei haluta kelata pohjalle asti. -->
    <RouterLink to="/kilpailijat" replace class="paluu">← Kilpailijat</RouterLink>

    <h1>Rosteri</h1>
    <p>
      Rosteri on laitteelle jäävä henkilölista. Samat ihmiset ampuvat kisan toisensa jälkeen, joten
      heitä ei tarvitse syöttää uudelleen: rasti tuo henkilön tähän kisaan kaikkine lajeineen, ja
      lajeja voi karsia kilpailijalistalla.
    </p>

    <RosteriValinta />

    <!--
      Paluu myös listan alta. Puhelimella ollaan täppäämisen jälkeen listan pohjalla, eikä
      sieltä haluta kelata takaisin ylös päästäkseen eteenpäin.
    -->
    <div class="ala">
      <button type="button" class="nappi nappi--ensisijainen" @click="valmis">
        {{ valmisTeksti }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.paluu {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 0.9rem;
  color: var(--vari-teksti-himmea);
}
.ala {
  display: flex;
  margin: 1rem 0 0.5rem;
}
.ala .nappi {
  /* Puhelimessa koko leveys: nappi on sivun päätepiste, ei yksi vaihtoehto muiden joukossa. */
  flex: 1 1 auto;
  justify-content: center;
}
@media (min-width: 600px) {
  .ala .nappi {
    flex: 0 0 auto;
  }
}
</style>
