<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useKisaStore, varmuuskopioAvaimet } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'

/**
 * Kisan päättäminen ja tietojen poistaminen.
 *
 * Poistaminen on peruuttamatonta ja tiedot ovat vain tässä laitteessa, joten toiminto
 * kertoo aina viennin tilanteen ja vaatii erillisen vahvistuksen. Kilpailijoiden nimet
 * ja yhdistykset ovat henkilötietoja, joten niiden poistamisen pitää olla helppoa
 * silloin kun kisa on ohi.
 */
const store = useKisaStore()
const laite = useLaiteStore()

type Toiminto = 'uusi' | 'kaikki'
const vahvistettava = ref<Toiminto | null>(null)
const ilmoitus = ref('')

const viety = computed(() => {
  if (!laite.viimeinenVienti) return null
  const d = new Date(laite.viimeinenVienti)
  return Number.isNaN(d.getTime()) ? null : d
})

const onTietoja = computed(() => store.kilpailijoita > 0)

/** Onko tuloksia, joita ei ole viety tiedostoon? */
const viemattaJaljella = computed(() => onTietoja.value && viety.value === null)

function muotoile(d: Date) {
  return d.toLocaleString('fi-FI', { dateStyle: 'short', timeStyle: 'short' })
}

/** Poistaa pysyvän tallennuksen, jottei muistiin jää vanhaa kisaa. */
function tyhjennaTallennus(avaimet: string[]) {
  try {
    for (const avain of avaimet) localStorage.removeItem(avain)
  } catch {
    // Yksityinen selausikkuna voi estää poiston; tila nollataan silti muistista.
  }
}

function aloitaUusiKisa() {
  store.aloitaUusi()
  laite.nollaaKisakohtaiset()
  // Varmuuskopiot sisältävät kilpailijoiden nimiä, joten ne poistuvat kisan mukana.
  tyhjennaTallennus(['kisa', ...varmuuskopioAvaimet()])
  vahvistettava.value = null
  ilmoitus.value = 'Kisan tiedot poistettu. Voit aloittaa uuden kisan.'
}

function poistaKaikki() {
  store.aloitaUusi()
  laite.nollaaLaite()
  tyhjennaTallennus(['kisa', 'laite', ...varmuuskopioAvaimet()])
  vahvistettava.value = null
  ilmoitus.value = 'Kaikki tiedot poistettu tältä laitteelta.'
}
</script>

<template>
  <fieldset class="paattaminen">
    <legend>Kisan päättäminen</legend>

    <p v-if="ilmoitus" class="huomio ilmoitus">{{ ilmoitus }}</p>

    <p v-if="!onTietoja" class="vihje">Tällä laitteella ei ole kisatietoja.</p>

    <template v-else>
      <p class="tilanne" :class="{ varoitus: viemattaJaljella }">
        <template v-if="viety">Tulokset viety tiedostoon {{ muotoile(viety) }}.</template>
        <template v-else>
          <strong>Tuloksia ei ole viety tiedostoon.</strong> Poistaminen hävittää ne
          lopullisesti.
        </template>
      </p>

      <p v-if="viemattaJaljella" class="vientilinkki">
        <RouterLink to="/vienti" class="nappi nappi--ensisijainen">Vie tulokset ensin</RouterLink>
      </p>

      <!-- Uusi kisa: laiteasetukset säilyvät, koska sama laite jatkaa käytössä. -->
      <div class="toiminto">
        <div class="kuvaus">
          <strong>Aloita uusi kisa</strong>
          <small>
            Poistaa kilpailijat ja tulokset. Laitteen asetukset, kuten syöttötapa,
            säilyvät.
          </small>
        </div>
        <template v-if="vahvistettava !== 'uusi'">
          <button type="button" class="nappi" @click="vahvistettava = 'uusi'">
            Aloita uusi kisa
          </button>
        </template>
        <template v-else>
          <p class="varmistus">
            Poistetaanko {{ store.kilpailijoita }} kilpailijan tiedot? Tätä ei voi peruuttaa.
          </p>
          <div class="napit">
            <button type="button" class="nappi nappi--vaarallinen" @click="aloitaUusiKisa">
              Kyllä, poista kisan tiedot
            </button>
            <button type="button" class="nappi" @click="vahvistettava = null">Peruuta</button>
          </div>
        </template>
      </div>

      <!-- Kaikki tiedot: myös laitetunniste, esim. lainalaitetta palautettaessa. -->
      <div class="toiminto">
        <div class="kuvaus">
          <strong>Poista kaikki tiedot tältä laitteelta</strong>
          <small>
            Poistaa myös laitteen nimen ja tunnisteen. Käytä tätä, kun laite ei jää sinulle
            — esimerkiksi lainattu puhelin.
          </small>
        </div>
        <template v-if="vahvistettava !== 'kaikki'">
          <button type="button" class="nappi" @click="vahvistettava = 'kaikki'">
            Poista kaikki tiedot
          </button>
        </template>
        <template v-else>
          <p class="varmistus">
            Poistetaanko kaikki tiedot, myös laitteen asetukset? Tätä ei voi peruuttaa.
          </p>
          <div class="napit">
            <button type="button" class="nappi nappi--vaarallinen" @click="poistaKaikki">
              Kyllä, poista kaikki
            </button>
            <button type="button" class="nappi" @click="vahvistettava = null">Peruuta</button>
          </div>
        </template>
      </div>
    </template>
  </fieldset>
</template>

<style scoped>
.paattaminen {
  border-color: var(--vari-virhe);
}
.paattaminen legend {
  color: var(--vari-virhe);
}

.ilmoitus {
  background: var(--vari-korostus-himmea);
  border-color: var(--vari-korostus);
  color: var(--vari-korostus);
  margin-bottom: 0.85rem;
}

.tilanne {
  font-size: 0.9rem;
  color: var(--vari-teksti-himmea);
  margin-bottom: 0.6rem;
}
.tilanne.varoitus {
  color: var(--vari-virhe);
}
.vientilinkki {
  margin-bottom: 1rem;
}

.toiminto {
  padding: 0.75rem 0;
  border-top: 1px solid var(--vari-reuna);
}
.kuvaus {
  margin-bottom: 0.6rem;
}
.kuvaus small {
  display: block;
  color: var(--vari-teksti-himmea);
  font-size: 0.85rem;
}

.varmistus {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--vari-virhe);
  margin-bottom: 0.5rem;
}
.napit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.nappi--vaarallinen {
  border-color: var(--vari-virhe);
  color: var(--vari-virhe);
}
.vihje {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
}
</style>
