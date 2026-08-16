<script setup lang="ts">
import { computed } from 'vue'
import { useKisaStore } from '@/stores/kisa'

/**
 * Kertoo, kun laitteella ollutta tallennusta ei voitu avata.
 *
 * Ilman tätä tilanne näyttäisi kirjaajalta siltä, että kisa on kadonnut: sovellus
 * avautuu tyhjänä eikä mikään kerro miksi. Tallennus on kuitenkin tallessa, eikä sitä
 * ole poistettu — se on juuri se tieto, jota radalla tarvitaan ennen kuin ehtii
 * päätellä pahinta ja aloittaa kirjaamisen alusta.
 */
const store = useKisaStore()

const nakyy = computed(() => store.skeemaTila === 'uudempi' || store.skeemaTila === 'vioittunut')
</script>

<template>
  <aside v-if="nakyy" class="varoitus" role="alert">
    <span class="merkki" aria-hidden="true">🛟</span>
    <span class="teksti">
      <template v-if="store.skeemaTila === 'uudempi'">
        <strong>Laitteen kisa on tallennettu uudemmalla sovellusversiolla.</strong>
        Sitä ei avattu, koska tämä versio ei tunne sen rakennetta.
        <strong>Tiedot ovat tallessa eikä niitä ole poistettu.</strong> Päivitä sovellus uusimpaan
        versioon, niin kisa avautuu — älä kirjaa tuloksia tähän tyhjään kisaan sitä ennen.
      </template>
      <template v-else>
        <strong>Laitteelle tallennettua kisaa ei voitu lukea.</strong>
        Sovellus aloitti tyhjästä kisasta.
        <strong>Vanha tallennus on otettu talteen eikä sitä ole poistettu</strong>, joten tulokset
        voi vielä palauttaa. Ota yhteys ylläpitoon ennen kuin tyhjennät selaimen tiedot tästä
        laitteesta.
      </template>
    </span>
  </aside>
</template>

<style scoped>
/* Sama hahmo kuin tallennusvaroituksessa, jotta ylälaidan huomautukset ovat tunnistettavia. */
.varoitus {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  padding: 0.6rem 0.85rem;
  margin-bottom: 1rem;
  border: 1px solid var(--vari-virhe);
  border-radius: var(--reunapyoristys);
  background: var(--vari-virhe-tausta);
  color: var(--vari-virhe);
  font-size: 0.88rem;
}
.merkki {
  font-size: 1.1rem;
  flex: 0 0 auto;
}
.teksti {
  flex: 1 1 16rem;
  min-width: 0;
}

/*
 * Tämä varoitus näkyy myös tulosteessa, toisin kuin vientimuistutus: jos tuloste on
 * tehty tyhjästä kisasta, paperilla on syytä lukea miksi se on tyhjä.
 */
</style>
