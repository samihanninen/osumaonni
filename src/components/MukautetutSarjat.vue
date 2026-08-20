<script setup lang="ts">
import { computed, ref } from 'vue'
import { useKisaStore } from '@/stores/kisa'
import type { SarjaId } from '@/types/kisa'

/**
 * Mukautetun kisan sarjat.
 *
 * RESUL-kisassa sarjat ovat sääntöjen mukaan H ja H50 eikä niitä voi muuttaa. Mukautetussa
 * kisassa järjestäjä nimeää ne itse, eikä niiden tarvitse liittyä ikään — sarja voi olla
 * myös esimerkiksi aloittelijat ja konkarit.
 *
 * Sijoitukset lasketaan sarjan sisällä, joten sarjajako ratkaisee kenet palkitaan.
 */
const store = useKisaStore()

const sarjat = computed(() => store.sarjat)

const uusi = ref('')
const virhe = ref('')

/** Poistettava sarja ja sen kilpailijamäärä. */
const poistettava = ref<{ sarja: SarjaId; maara: number } | null>(null)

function lisaa() {
  const nimi = uusi.value.trim()
  if (!nimi) return
  if (!store.lisaaSarja(nimi)) {
    virhe.value = `Sarja "${nimi}" on jo olemassa.`
    return
  }
  virhe.value = ''
  uusi.value = ''
}

function nimea(vanha: SarjaId, arvo: string) {
  const nimi = arvo.trim()
  if (!nimi || nimi === vanha) return
  if (!store.nimeaSarja(vanha, nimi)) {
    virhe.value = `Sarja "${nimi}" on jo olemassa.`
    return
  }
  virhe.value = ''
}

/**
 * Poisto siirtää sarjan kilpailijat ensimmäiseen jäljelle jäävään sarjaan, joten siitä
 * kerrotaan etukäteen — kilpailija ei saa jäädä sarjaan jota ei ole.
 */
function poista(sarja: SarjaId) {
  const maara = store.sarjassa(sarja)
  if (maara === 0) {
    store.poistaSarja(sarja)
    return
  }
  poistettava.value = { sarja, maara }
}

function vahvistaPoisto() {
  if (!poistettava.value) return
  store.poistaSarja(poistettava.value.sarja)
  poistettava.value = null
}
</script>

<template>
  <fieldset>
    <legend>Kisan sarjat</legend>

    <p class="vihje">
      Sarja on kilpailuluokka, esimerkiksi <em>Yleinen</em> ja <em>Veteraanit</em>. Sijoitukset
      voidaan laskea sarjan sisällä, joten sarjajako ratkaisee kenet palkitaan. Sarjan ei tarvitse
      liittyä ikään.
    </p>

    <p v-if="virhe" class="huomio huomio--virhe" role="alert">{{ virhe }}</p>

    <ul class="lista">
      <li v-for="sarja in sarjat" :key="sarja" class="sarja">
        <input
          type="text"
          :aria-label="`Sarjan nimi: ${sarja}`"
          :value="sarja"
          @change="nimea(sarja, ($event.target as HTMLInputElement).value)"
        />
        <span class="maara">{{ store.sarjassa(sarja) }} kilpailijaa</span>
        <button
          type="button"
          class="pikkunappi vaarallinen"
          :disabled="sarjat.length <= 1"
          :title="sarjat.length <= 1 ? 'Viimeistä sarjaa ei voi poistaa' : ''"
          @click="poista(sarja)"
        >
          Poista
        </button>
      </li>
    </ul>

    <p v-if="poistettava" class="varmistus" role="alert">
      <strong>Poistetaanko sarja {{ poistettava.sarja }}?</strong>
      Sen {{ poistettava.maara }} kilpailijaa siirtyvät sarjaan
      <strong>{{ sarjat.find((s) => s !== poistettava?.sarja) }}</strong
      >. Tulokset säilyvät.
      <span class="napit">
        <button type="button" class="pikkunappi vaarallinen" @click="vahvistaPoisto">
          Kyllä, poista
        </button>
        <button type="button" class="pikkunappi" @click="poistettava = null">Peruuta</button>
      </span>
    </p>

    <div class="lisays">
      <label for="uusi-sarja">Uuden sarjan nimi</label>
      <div class="rivi">
        <input
          id="uusi-sarja"
          v-model="uusi"
          type="text"
          placeholder="esim. Veteraanit"
          @keydown.enter.prevent="lisaa"
        />
        <button type="button" class="nappi" @click="lisaa">Lisää sarja</button>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.lista {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
}
.sarja {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.35rem 0;
}
.sarja input {
  flex: 1 1 10rem;
  max-width: 16rem;
}
.maara {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
  flex: 0 0 auto;
}
.vaarallinen {
  border-color: var(--vari-virhe);
  color: var(--vari-virhe);
}

.lisays {
  margin-top: 0.85rem;
}
.lisays .rivi {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.lisays input {
  flex: 1 1 12rem;
  max-width: 16rem;
}

.varmistus {
  margin-top: 0.6rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--vari-virhe);
  border-radius: var(--reunapyoristys);
  background: var(--vari-virhe-tausta);
  color: var(--vari-virhe);
  font-size: 0.88rem;
}
.napit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
</style>
