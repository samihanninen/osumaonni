<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import { useRosteriStore } from '@/stores/rosteri'
import { henkiloAvain, type RosteriHenkilo } from '@/core/rosteri'
import { kisanLajit, kisanSarjat } from '@/core/lajit'

/**
 * Rosteri: laitteelle jäävä henkilölista, josta täpätään sen päivän kilpailijat.
 *
 * Pienessä yhdistyksessä samat ihmiset ampuvat kisan toisensa jälkeen, mutta kisa on
 * kertakäyttöinen — seuraavana kertana samat nimet naputeltaisiin uudelleen. Rasti tuo
 * henkilön kisaan kaikkine kisan lajeineen, koska useimmin osallistutaan kaikkeen;
 * ylimääräiset lajit poistetaan kilpailijalistalta rastia napsauttamalla.
 *
 * Rosteri ei ole kisadataa: sitä ei viedä, jaeta eikä yhdistetä. Ks. `core/rosteri`.
 *
 * Tämä on rosterisivun (`RosteriView`) sisältö. Ennen se oli taitettu osio
 * kilpailijalistan yläpuolella, mutta avattuna samat ihmiset näkyivät sivulla kahdesti
 * — rosterissa ja kisan kilpailijalistassa — eikä kumpaa listaa milloinkin muokkasi
 * erottunut.
 */
const store = useKisaStore()
const rosteri = useRosteriStore()
const { kisa } = storeToRefs(store)

/** Kisan lajit muodosta riippumatta. Rasti liittää henkilön näihin kaikkiin. */
const lajit = computed(() => kisanLajit(kisa.value))

/** Kisassa olevat kilpailijat nimiavaimen mukaan, jotta rosterin rasti löytää heidät. */
const kisassa = computed(() => {
  const avaimet = new Map<string, string>()
  for (const k of kisa.value.kilpailijat) avaimet.set(henkiloAvain(k), k.id)
  return avaimet
})

/**
 * Kisassa oleva kilpailija tälle rosterin henkilölle.
 *
 * Tunniste ensin: rosterista lisätty kilpailija saa saman tunnisteen, joten hän löytyy
 * silloinkin kun nimeä on kisan puolella korjattu. Nimiavain on varatie sille, että sama
 * henkilö on kirjattu kisaan käsin ennen rosteriin tallentamista — ilman sitä rasti
 * tekisi hänestä kaksoiskappaleen.
 */
function kisassaOlevaId(h: RosteriHenkilo): string | undefined {
  return store.kilpailija(h.id)?.id ?? kisassa.value.get(henkiloAvain(h))
}

function mukana(h: RosteriHenkilo): boolean {
  return kisassaOlevaId(h) !== undefined
}

/** Rosterin henkilöt, joita kisassa ei vielä ole. Kertoo mitä "lisää kaikki" tekisi. */
const puuttuvia = computed(() => rosteri.jarjestetyt.filter((h) => !mukana(h)).length)

/** Kisan kilpailijat, joita rosterissa ei vielä ole. Kertoo mitä tallennus tekisi. */
const tallentamattomia = computed(
  () => kisa.value.kilpailijat.filter((k) => !rosteri.etsiNimella(k)).length,
)

const ilmoitus = ref('')
/** Kilpailija, jonka poisto kisasta odottaa vahvistusta — hänellä on kirjattuja tuloksia. */
const poistoVahvistus = ref<string | null>(null)
/** Rosterista poistettava henkilö. Erillinen vahvistus, koska poisto on peruuttamaton. */
const rosterista = ref<string | null>(null)

function lisaaKisaan(h: RosteriHenkilo) {
  if (mukana(h)) return
  /*
   * Sarja otetaan rosterista vain jos kisassa on samanniminen: RESUL-kisan H50 ei
   * tarkoita mitään mukautetussa kisassa, jonka sarjat järjestäjä on itse nimennyt.
   */
  const sarjat = kisanSarjat(kisa.value)
  const ikasarja = h.ikasarja && sarjat.includes(h.ikasarja) ? h.ikasarja : undefined
  store.lisaaKilpailija({
    id: h.id,
    etunimi: h.etunimi,
    sukunimi: h.sukunimi,
    yhdistys: h.yhdistys,
    ...(ikasarja ? { ikasarja } : {}),
    lajit: lajit.value.map((l) => l.id),
  })
  ilmoitus.value = ''
}

/**
 * Poistaa henkilön kisasta. Kirjatut tulokset menevät mukana, joten poisto vahvistetaan
 * silloin kun niitä on — tyhjän rivin poistaminen ei tarvitse samaa varmistusta.
 */
function poistaKisasta(h: RosteriHenkilo) {
  const id = kisassaOlevaId(h)
  if (!id) return
  if (store.kilpailijanLaukaukset(id) > 0) {
    poistoVahvistus.value = id
    return
  }
  store.poistaKilpailija(id)
}

function vahvistaPoisto(id: string) {
  store.poistaKilpailija(id)
  poistoVahvistus.value = null
}

function vaihda(h: RosteriHenkilo, mukaan: boolean) {
  if (mukaan) lisaaKisaan(h)
  else poistaKisasta(h)
}

function lisaaKaikki() {
  for (const h of rosteri.jarjestetyt) lisaaKisaan(h)
}

/**
 * Tallentaa kisan kilpailijat rosteriin.
 *
 * Tämä on tavallisin tapa saada rosteri alkuun: yhdistys on kirjannut oman porukkansa
 * kisaan kertaalleen, ja seuraavaan kisaan he tulevat samalta listalta. Nappia voi
 * painaa uudelleen — jo tallennetun rivin yhdistys ja sarja päivittyvät.
 */
function tallennaKisasta() {
  const uusia = rosteri.tallennaMonta(kisa.value.kilpailijat)
  ilmoitus.value =
    uusia === 0
      ? 'Kaikki kisan kilpailijat olivat jo rosterissa. Tiedot päivitettiin.'
      : `Rosteriin tallennettiin ${uusia} uutta henkilöä.`
}

function poistaRosterista(id: string) {
  rosteri.poista(id)
  rosterista.value = null
}

function nimi(h: RosteriHenkilo): string {
  return [h.etunimi, h.sukunimi].filter(Boolean).join(' ')
}
</script>

<template>
  <div class="kortti rosterikortti">
    <p v-if="ilmoitus" class="huomio ilmoitus">{{ ilmoitus }}</p>

    <template v-if="rosteri.maara === 0">
      <p class="vihje">
        Rosteri on tyhjä. Tallenna kisan kilpailijat rosteriin, niin seuraavan kisan saa alkuun
        täppäämällä — tai rastita lisäyslomakkeelta
        <em>Tallenna myös rosteriin</em>.
      </p>
      <button
        type="button"
        class="nappi"
        :disabled="tallentamattomia === 0"
        @click="tallennaKisasta"
      >
        Tallenna kisan kilpailijat rosteriin<template v-if="tallentamattomia">
          ({{ tallentamattomia }})</template
        >
      </button>
    </template>

    <template v-else>
      <h2 class="lkm">{{ rosteri.maara }} henkilöä</h2>

      <ul class="henkilot">
        <li v-for="h in rosteri.jarjestetyt" :key="h.id" class="henkilo">
          <label class="valinta">
            <input
              type="checkbox"
              :checked="mukana(h)"
              @change="vaihda(h, ($event.target as HTMLInputElement).checked)"
            />
            <span class="nimi">{{ nimi(h) }}</span>
            <span v-if="h.yhdistys" class="yhdistys">{{ h.yhdistys }}</span>
            <span v-if="h.ikasarja" class="sarja">{{ h.ikasarja }}</span>
          </label>

          <button
            v-if="rosterista !== h.id"
            type="button"
            class="nappi pieni"
            :aria-label="`Poista ${nimi(h)} rosterista`"
            @click="rosterista = h.id"
          >
            Poista rosterista
          </button>
          <template v-else>
            <button type="button" class="nappi pieni poista-varma" @click="poistaRosterista(h.id)">
              Kyllä, poista rosterista
            </button>
            <button type="button" class="nappi pieni" @click="rosterista = null">Peruuta</button>
          </template>

          <!--
            Poisto kisasta vahvistetaan vain silloin kun tuloksia on kirjattu. Rasti on
            nopea napauttaa vahingossa, ja kirjatut laukaukset lähtisivät mukana.
          -->
          <p v-if="poistoVahvistus && poistoVahvistus === kisassaOlevaId(h)" class="varmistus">
            <span>
              Poistetaanko {{ nimi(h) }} kisasta?
              {{ store.kilpailijanLaukaukset(poistoVahvistus) }} kirjattua laukausta katoaa.
            </span>
            <button
              type="button"
              class="nappi pieni poista-varma"
              @click="vahvistaPoisto(poistoVahvistus)"
            >
              Kyllä, poista kisasta
            </button>
            <button type="button" class="nappi pieni" @click="poistoVahvistus = null">
              Peruuta
            </button>
          </p>
        </li>
      </ul>

      <div class="napit">
        <button type="button" class="nappi" :disabled="puuttuvia === 0" @click="lisaaKaikki">
          Lisää kaikki kisaan<template v-if="puuttuvia"> ({{ puuttuvia }})</template>
        </button>
        <button
          type="button"
          class="nappi"
          :disabled="tallentamattomia === 0"
          @click="tallennaKisasta"
        >
          Tallenna kisan kilpailijat rosteriin<template v-if="tallentamattomia">
            ({{ tallentamattomia }})</template
          >
        </button>
      </div>

      <p class="vihje">
        Rosterissa on nimiä ja yhdistyksiä eli henkilötietoja, ja se säilyy myös uuden kisan yli.
        Koko rosterin voi tyhjentää Kisatiedot-sivun alaosasta.
      </p>
    </template>
  </div>
</template>

<style scoped>
.rosterikortti {
  margin: 1rem 0 1.25rem;
}
/* Sama muoto kuin kilpailijalistan "N kilpailijaa": sivut lukevat samalla tavalla. */
.lkm {
  font-size: 1rem;
  font-weight: 400;
  color: var(--vari-teksti-himmea);
  margin: 0 0 0.5rem;
}
.ilmoitus {
  background: var(--vari-korostus-himmea);
  border-color: var(--vari-korostus);
  color: var(--vari-korostus);
  margin-bottom: 0.75rem;
}

.henkilot {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  display: grid;
  gap: 0.15rem;
}
.henkilo {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  padding: 0.1rem 0;
  border-bottom: 1px solid var(--vari-reuna);
}
.valinta {
  display: flex;
  align-items: center;
  flex: 1 1 12rem;
  gap: 0.5rem;
  min-height: 44px;
  cursor: pointer;
}
.valinta input {
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
}
.nimi {
  font-weight: 600;
}
.yhdistys,
.sarja {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
}
.sarja {
  border: 1px solid var(--vari-reuna);
  border-radius: 4px;
  padding: 0 0.3rem;
}

.pieni {
  min-height: 38px;
  padding: 0.3rem 0.6rem;
  font-size: 0.85rem;
}
.poista-varma {
  border-color: var(--vari-virhe);
  color: var(--vari-virhe);
}
.varmistus {
  flex: 1 1 100%;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--vari-virhe);
  margin: 0 0 0.4rem;
}

.napit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.vihje {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
}
</style>
