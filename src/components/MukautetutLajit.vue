<script setup lang="ts">
import { computed, ref } from 'vue'
import { useKisaStore } from '@/stores/kisa'
import type { Kilpasarjamaaritys, LajiId, MukautettuLaji, TulosSaanto } from '@/types/kisa'

/**
 * Mukautetun kisan lajien määrittely.
 *
 * Sarjat määritellään yksitellen, koska ne tarkoittavat eri asioita eri kisoissa:
 * kolmen asennon kisassa sarja on asento, kahden kierroksen kisassa kierros. Nimi on
 * vapaaehtoinen mutta kannattaa antaa — se näkyy kirjaajalle tuloskortissa.
 *
 * Kaikki lyhentävät muutokset varmistetaan ja niistä kerrotaan menetettävien laukausten
 * määrä. Kirjaaja ei voi arvioida menetystä ilman lukua, ja radalla peruuttaminen ei
 * onnistu.
 */
const store = useKisaStore()

const lajit = computed(() => store.mukautetutLajit)

const tulosSaannot: { arvo: TulosSaanto; nimi: string }[] = [
  { arvo: 'summa', nimi: 'Kaikkien sarjojen summa' },
  { arvo: 'paras', nimi: 'Paras sarja huomioidaan' },
]

/** Odottava muutos, joka hävittäisi kirjattuja laukauksia. */
const vahvistettava = ref<{
  id: LajiId
  nimi: string
  sarjat: Kilpasarjamaaritys[]
  menetys: number
  selite: string
} | null>(null)

const poistettava = ref<{ id: LajiId; nimi: string; laukauksia: number } | null>(null)

/**
 * Ottaa sarjamuutoksen käyttöön, tai kysyy ensin jos se hävittäisi kirjattua.
 * Kasvattavat muutokset menevät suoraan läpi — niissä ei ole mitään menetettävää.
 */
function muutaSarjat(laji: MukautettuLaji, sarjat: Kilpasarjamaaritys[], selite: string) {
  const menetys = store.menetettavatLaukaukset(laji.id, sarjat)
  if (menetys === 0) {
    store.asetaKilpasarjat(laji.id, sarjat)
    return
  }
  vahvistettava.value = { id: laji.id, nimi: laji.nimi, sarjat, menetys, selite }
}

function vahvista() {
  const v = vahvistettava.value
  if (!v) return
  store.asetaKilpasarjat(v.id, v.sarjat)
  vahvistettava.value = null
}

function asetaPituus(laji: MukautettuLaji, i: number, arvo: string) {
  const laukauksia = Math.max(1, Math.trunc(Number(arvo) || 1))
  const sarjat = laji.kilpasarjat.map((s, j) => (j === i ? { ...s, laukauksia } : s))
  muutaSarjat(laji, sarjat, `Sarjan ${i + 1} pituus ${laukauksia} laukausta`)
}

function asetaNimi(laji: MukautettuLaji, i: number, arvo: string) {
  // Nimen muutos ei koskaan hävitä tuloksia, joten se menee suoraan läpi.
  store.asetaKilpasarjat(
    laji.id,
    laji.kilpasarjat.map((s, j) => (j === i ? { ...s, nimi: arvo } : s)),
  )
}

function lisaaSarja(laji: MukautettuLaji) {
  const viimeinen = laji.kilpasarjat[laji.kilpasarjat.length - 1]
  store.asetaKilpasarjat(laji.id, [
    ...laji.kilpasarjat,
    { laukauksia: viimeinen?.laukauksia ?? 10 },
  ])
}

function poistaSarja(laji: MukautettuLaji, i: number) {
  if (laji.kilpasarjat.length <= 1) return
  const sarjat = laji.kilpasarjat.filter((_, j) => j !== i)
  muutaSarjat(laji, sarjat, `Sarja ${i + 1} poistetaan`)
}

function poistaLaji(laji: MukautettuLaji) {
  const laukauksia = store.kirjattujaLaukauksia(laji.id)
  if (laukauksia === 0) {
    store.poistaMukautettuLaji(laji.id)
    return
  }
  poistettava.value = { id: laji.id, nimi: laji.nimi, laukauksia }
}

function vahvistaPoisto() {
  if (!poistettava.value) return
  store.poistaMukautettuLaji(poistettava.value.id)
  poistettava.value = null
}

function laukauksiaYhteensa(laji: MukautettuLaji): number {
  return laji.kilpasarjat.reduce((s, k) => s + k.laukauksia, 0)
}

/** Suurin mahdollinen tulos: kymppi jokaisesta laskettavasta laukauksesta. */
function suurin(laji: MukautettuLaji): number {
  if (laji.tulosSaanto === 'summa') return laukauksiaYhteensa(laji) * 10
  return Math.max(...laji.kilpasarjat.map((k) => k.laukauksia)) * 10
}
</script>

<template>
  <fieldset>
    <legend>Kisan lajit</legend>

    <p class="vihje">
      Määrittele lajit ja niiden sarjat. Sarja voi olla ampuma-asento, kierros tai mikä tahansa erä
      — anna sille nimi, niin kirjaaja tietää mitä ampuu. Tulos lasketaan joko kaikkien sarjojen
      summana tai parhaan sarjan mukaan.
    </p>

    <p v-if="lajit.length === 0" class="vihje tyhja">
      Kisassa ei ole vielä lajeja. Lisää ensimmäinen alta.
    </p>

    <div v-for="(laji, indeksi) in lajit" :key="laji.id" class="laji">
      <div class="laji-otsikko">
        <div class="kentta lyhyt">
          <label :for="`koodi-${laji.id}`">Lyhenne</label>
          <input
            :id="`koodi-${laji.id}`"
            type="text"
            maxlength="8"
            :value="laji.koodi"
            @change="
              store.paivitaMukautettuLaji(laji.id, {
                koodi: ($event.target as HTMLInputElement).value,
              })
            "
          />
        </div>
        <div class="kentta">
          <label :for="`nimi-${laji.id}`">Lajin nimi</label>
          <input
            :id="`nimi-${laji.id}`"
            type="text"
            :value="laji.nimi"
            @change="
              store.paivitaMukautettuLaji(laji.id, {
                nimi: ($event.target as HTMLInputElement).value,
              })
            "
          />
        </div>
        <div class="kentta">
          <label :for="`saanto-${laji.id}`">Tulos</label>
          <select
            :id="`saanto-${laji.id}`"
            :value="laji.tulosSaanto"
            @change="
              store.paivitaMukautettuLaji(laji.id, {
                tulosSaanto: ($event.target as HTMLSelectElement).value as TulosSaanto,
              })
            "
          >
            <option v-for="s in tulosSaannot" :key="s.arvo" :value="s.arvo">{{ s.nimi }}</option>
          </select>
        </div>
      </div>

      <table class="sarjat">
        <thead>
          <tr>
            <th>Sarja</th>
            <th>Nimi</th>
            <th class="numero">Laukauksia</th>
            <th><span class="piilotettu">Toiminnot</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(sarja, i) in laji.kilpasarjat" :key="i">
            <th scope="row">{{ i + 1 }}.</th>
            <td>
              <input
                type="text"
                :placeholder="`Sarja ${i + 1}`"
                :aria-label="`${laji.nimi}: sarjan ${i + 1} nimi`"
                :value="sarja.nimi ?? ''"
                @change="asetaNimi(laji, i, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="numero">
              <input
                class="pieni"
                type="number"
                min="1"
                max="100"
                :aria-label="`${laji.nimi}: sarjan ${i + 1} laukausmäärä`"
                :value="sarja.laukauksia"
                @change="asetaPituus(laji, i, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td>
              <button
                type="button"
                class="pikkunappi"
                :disabled="laji.kilpasarjat.length <= 1"
                @click="poistaSarja(laji, i)"
              >
                Poista sarja
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="yhteenveto">
        {{ laji.kilpasarjat.length }} sarjaa, {{ laukauksiaYhteensa(laji) }} laukausta. Suurin tulos
        {{ suurin(laji) }}.
      </p>

      <div class="napit">
        <button type="button" class="pikkunappi" @click="lisaaSarja(laji)">Lisää sarja</button>
        <button
          type="button"
          class="pikkunappi"
          :disabled="indeksi === 0"
          @click="store.siirraMukautettuLaji(laji.id, -1)"
        >
          Siirrä ylös
        </button>
        <button
          type="button"
          class="pikkunappi"
          :disabled="indeksi === lajit.length - 1"
          @click="store.siirraMukautettuLaji(laji.id, 1)"
        >
          Siirrä alas
        </button>
        <button type="button" class="pikkunappi vaarallinen" @click="poistaLaji(laji)">
          Poista laji
        </button>
      </div>

      <p v-if="vahvistettava?.id === laji.id" class="varmistus" role="alert">
        <strong>{{ vahvistettava.selite }}.</strong>
        Muutos poistaa {{ vahvistettava.menetys }} jo kirjattua laukausta. Tätä ei voi peruuttaa.
        <span class="napit">
          <button type="button" class="pikkunappi vaarallinen" @click="vahvista">
            Kyllä, muuta
          </button>
          <button type="button" class="pikkunappi" @click="vahvistettava = null">Peruuta</button>
        </span>
      </p>

      <p v-if="poistettava?.id === laji.id" class="varmistus" role="alert">
        <strong>Poistetaanko laji {{ poistettava.nimi }}?</strong>
        Siihen on kirjattu {{ poistettava.laukauksia }} laukausta, jotka poistuvat samalla.
        <span class="napit">
          <button type="button" class="pikkunappi vaarallinen" @click="vahvistaPoisto">
            Kyllä, poista
          </button>
          <button type="button" class="pikkunappi" @click="poistettava = null">Peruuta</button>
        </span>
      </p>
    </div>

    <p class="lisays">
      <button type="button" class="nappi" @click="store.lisaaMukautettuLaji()">Lisää laji</button>
    </p>
  </fieldset>
</template>

<style scoped>
.laji {
  padding: 0.85rem 0;
  border-top: 1px solid var(--vari-reuna);
}
.laji-otsikko {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.6rem;
}
.kentta {
  flex: 1 1 12rem;
}
.kentta.lyhyt {
  flex: 0 0 7rem;
}

.sarjat {
  width: 100%;
}
.sarjat .numero {
  text-align: right;
}
.pieni {
  width: 5rem;
  text-align: right;
}

.yhteenveto {
  margin: 0.5rem 0;
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
}

.napit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.vaarallinen {
  border-color: var(--vari-virhe);
  color: var(--vari-virhe);
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
.varmistus .napit {
  margin-top: 0.5rem;
}

.tyhja {
  font-style: italic;
}
.lisays {
  margin-top: 0.85rem;
}
.piilotettu {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
