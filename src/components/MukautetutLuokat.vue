<script setup lang="ts">
import { computed, ref } from 'vue'
import { useKisaStore } from '@/stores/kisa'
import { luokanNimi } from '@/core/lajit'
import type { LuokkaId } from '@/types/kisa'

/**
 * Mukautetun kisan aseluokat.
 *
 * RESUL-kisassa luokat ovat sääntöjen mukaan Vakio ja Avoin — avoimessa optiikka on
 * sallittu, joten ne kilpailevat erikseen — eikä niitä voi muuttaa. Mukautetussa kisassa
 * järjestäjä nimeää ne itse, eikä niiden tarvitse liittyä aseeseen lainkaan: luokka voi
 * olla myös esimerkiksi ikäryhmä tai joukkue.
 *
 * Luokka on kilpailijakohtaisen sijaan **lajikohtainen** valinta, koska se seuraa
 * käytettyä asetta. Siksi poiston hinta lasketaan osallistumisina eikä kilpailijoina.
 */
const store = useKisaStore()

const luokat = computed(() => store.luokat)

const uusi = ref('')
const virhe = ref('')

/** Poistettava luokka ja sen osallistumismäärä. */
const poistettava = ref<{ luokka: LuokkaId; maara: number } | null>(null)

function lisaa() {
  const nimi = uusi.value.trim()
  if (!nimi) return
  if (!store.lisaaLuokka(nimi)) {
    virhe.value = `Luokka "${nimi}" on jo olemassa.`
    return
  }
  virhe.value = ''
  uusi.value = ''
}

function nimea(vanha: LuokkaId, arvo: string) {
  const nimi = arvo.trim()
  if (!nimi || nimi === vanha) return
  if (!store.nimeaLuokka(vanha, nimi)) {
    virhe.value = `Luokka "${nimi}" on jo olemassa.`
    return
  }
  virhe.value = ''
}

/**
 * Poisto siirtää luokan osallistumiset ensimmäiseen jäljelle jäävään luokkaan, joten
 * siitä kerrotaan etukäteen — kilpailija ei saa jäädä luokkaan jota ei ole.
 */
function poista(luokka: LuokkaId) {
  const maara = store.luokassa(luokka)
  if (maara === 0) {
    store.poistaLuokka(luokka)
    return
  }
  poistettava.value = { luokka, maara }
}

function vahvistaPoisto() {
  if (!poistettava.value) return
  store.poistaLuokka(poistettava.value.luokka)
  poistettava.value = null
}
</script>

<template>
  <fieldset>
    <legend>Kisan aseluokat</legend>

    <p class="vihje">
      Aseluokka valitaan lajikohtaisesti, koska se seuraa käytettyä asetta. Sijoitukset lasketaan
      luokan sisällä, joten luokkajako ratkaisee kenet palkitaan. Luokan ei tarvitse liittyä
      aseeseen — se voi olla myös esimerkiksi <em>Aloittelijat</em> ja <em>Konkarit</em>.
    </p>

    <p v-if="virhe" class="huomio huomio--virhe" role="alert">{{ virhe }}</p>

    <ul class="lista">
      <li v-for="luokka in luokat" :key="luokka" class="luokka">
        <input
          type="text"
          :aria-label="`Luokan nimi: ${luokanNimi(luokka)}`"
          :value="luokanNimi(luokka)"
          @change="nimea(luokka, ($event.target as HTMLInputElement).value)"
        />
        <span class="maara">{{ store.luokassa(luokka) }} osallistumista</span>
        <button
          type="button"
          class="pikkunappi vaarallinen"
          :disabled="luokat.length <= 1"
          :title="luokat.length <= 1 ? 'Viimeistä luokkaa ei voi poistaa' : ''"
          @click="poista(luokka)"
        >
          Poista
        </button>
      </li>
    </ul>

    <p v-if="poistettava" class="varmistus" role="alert">
      <strong>Poistetaanko luokka {{ luokanNimi(poistettava.luokka) }}?</strong>
      Sen {{ poistettava.maara }} osallistumista siirtyvät luokkaan
      <strong>{{ luokanNimi(luokat.find((l) => l !== poistettava?.luokka) ?? '') }}</strong
      >. Tulokset säilyvät.
      <span class="napit">
        <button type="button" class="pikkunappi vaarallinen" @click="vahvistaPoisto">
          Kyllä, poista
        </button>
        <button type="button" class="pikkunappi" @click="poistettava = null">Peruuta</button>
      </span>
    </p>

    <div class="lisays">
      <label for="uusi-luokka">Uuden luokan nimi</label>
      <div class="rivi">
        <input
          id="uusi-luokka"
          v-model="uusi"
          type="text"
          placeholder="esim. Optiikka"
          @keydown.enter.prevent="lisaa"
        />
        <button type="button" class="nappi" @click="lisaa">Lisää luokka</button>
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
.luokka {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.35rem 0;
}
.luokka input {
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
