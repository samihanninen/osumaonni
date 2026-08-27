<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import { kisanLajit, LUOKAT, LUOKKA_NIMET } from '@/core/lajit'
import { onJoukkuekilpailu, yhdistysLaji, yhdistysYhteistulos } from '@/core/yhdistykset'
import { kokonaiskilpailu, RESUL_TASATULOKSEN_RATKAISIJA } from '@/core/kokonaiskilpailu'
import type { LajiId, Luokka } from '@/types/kisa'

const store = useKisaStore()
const { kisa } = storeToRefs(store)

/** Aseluokkarajaus. Oletuksena kaikki luokat lasketaan yhteen, kuten Excel-versiossa. */
const luokka = ref<Luokka | 'kaikki'>('kaikki')

const parhaita = computed(() => kisa.value.asetukset.laskettavatParhaat)

/** Kisan lajit muodosta riippumatta. */
const lajit = computed(() => kisanLajit(kisa.value))

const optiot = computed(() => ({
  parhaita: parhaita.value,
  ...(luokka.value === 'kaikki' ? {} : { luokka: luokka.value }),
}))

const yhteistulos = computed(() =>
  yhdistysYhteistulos(kisa.value.kilpailijat, lajit.value, optiot.value),
)

function lajiTulokset(laji: LajiId) {
  const rakenne = lajit.value.find((l) => l.id === laji)
  if (!rakenne) return []
  return yhdistysLaji(kisa.value.kilpailijat, laji, rakenne, optiot.value)
}

/**
 * Kokonaiskilpailu. Tasatuloksen ratkaisijalaji on RESUL-kisassa sääntöjen mukaan RA2;
 * mukautetussa kisassa vastaavaa sääntöä ei ole, joten ratkaisijaa ei anneta ja
 * tasatulos ratkeaa sukunimen mukaan. Arvattu ratkaisijalaji olisi pahempi kuin ei
 * mitään, koska se päättäisi sijoituksia perusteella jota kilpailijat eivät tiedä.
 */
const henkilokohtainen = computed(() =>
  kokonaiskilpailu(
    kisa.value.kilpailijat,
    lajit.value,
    kisa.value.tyyppi === 'resul' ? { tasatuloksenRatkaisija: RESUL_TASATULOKSEN_RATKAISIJA } : {},
  ),
)

/**
 * Yhdistyskilpailu on säännöissä vapaaehtoinen, joten se voi olla pois päältä. Silloin
 * sivulle jää pelkkä kokonaiskilpailu, eikä tyhjyyttä arvioida yhdistysten perusteella.
 */
const naytaYhdistykset = computed(() => onJoukkuekilpailu(kisa.value.asetukset))

const onTuloksia = computed(() =>
  naytaYhdistykset.value ? yhteistulos.value.length > 0 : henkilokohtainen.value.length > 0,
)
</script>

<template>
  <section class="sivu">
    <h1>{{ naytaYhdistykset ? 'Yhdistys- ja kokonaiskilpailu' : 'Kokonaiskilpailu' }}</h1>
    <p v-if="naytaYhdistykset">
      Yhdistyksen lajitulos on parhaiden {{ parhaita }} kilpailijan summa. Sääntöjen mukaan
      joukkueen koko on 3 ampujaa; määrää voi muuttaa
      <RouterLink to="/kisatiedot">kisatiedoissa</RouterLink>.
    </p>
    <p v-else>
      Yhdistyskilpailua ei järjestetä tässä kisassa. Sen voi ottaa käyttöön
      <RouterLink to="/kisatiedot">kisatiedoissa</RouterLink>.
    </p>

    <div v-if="naytaYhdistykset" class="suodatin">
      <span class="suodatin-otsikko">Aseluokka</span>
      <div class="napit" role="group" aria-label="Aseluokka">
        <button
          type="button"
          class="pikkunappi"
          :class="{ 'pikkunappi--valittu': luokka === 'kaikki' }"
          @click="luokka = 'kaikki'"
        >
          Kaikki yhdessä
        </button>
        <button
          v-for="l in LUOKAT"
          :key="l"
          type="button"
          class="pikkunappi"
          :class="{ 'pikkunappi--valittu': luokka === l }"
          @click="luokka = l"
        >
          {{ LUOKKA_NIMET[l] }}
        </button>
      </div>
    </div>

    <p v-if="!onTuloksia" class="tulossa">
      Ei vielä tuloksia. Kirjaa laukauksia, niin yhdistysten tilanne päivittyy tähän.
    </p>

    <template v-else>
      <h2 v-if="naytaYhdistykset">Yhteistulos</h2>
      <div v-if="naytaYhdistykset" class="taulukko-kehys">
        <table>
          <thead>
            <tr>
              <th class="numero">Sija</th>
              <th>Yhdistys</th>
              <th v-for="l in lajit" :key="l.id" class="numero" :title="l.nimi">{{ l.koodi }}</th>
              <th class="numero">Yhteensä</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rivi in yhteistulos" :key="rivi.yhdistys">
              <td class="numero sija">
                {{ rivi.sija }}<span v-if="rivi.jaettu" class="jaettu">.</span>
              </td>
              <th scope="row">{{ rivi.yhdistys }}</th>
              <td v-for="l in lajit" :key="l.id" class="numero">
                {{ rivi.lajipisteet[l.id] || '' }}
              </td>
              <td class="numero yhteensa">{{ rivi.pisteet }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section v-for="l in naytaYhdistykset ? lajit : []" :key="l.id" class="lajiosio">
        <h2>{{ l.nimi }}</h2>
        <p v-if="lajiTulokset(l.id).length === 0" class="tyhja">Ei tuloksia tässä lajissa.</p>
        <div v-else class="taulukko-kehys">
          <table>
            <thead>
              <tr>
                <th class="numero">Sija</th>
                <th>Yhdistys</th>
                <th class="numero">Tulos</th>
                <th class="numero">Ampujia</th>
                <th>Huomioidut</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rivi in lajiTulokset(l.id)" :key="rivi.yhdistys">
                <td class="numero sija">
                  {{ rivi.sija }}<span v-if="rivi.jaettu" class="jaettu">.</span>
                </td>
                <th scope="row">
                  {{ rivi.yhdistys }}
                  <span v-if="!rivi.taysiJoukkue" class="vajaa" :title="`Alle ${parhaita} ampujaa`">
                    vajaa
                  </span>
                </th>
                <td class="numero yhteensa">{{ rivi.pisteet }}</td>
                <td class="numero">{{ rivi.kilpailijoita }}</td>
                <td class="huomioidut">
                  <span v-for="h in rivi.huomioidut" :key="h.kilpailija.id" class="huomioitu">
                    {{ h.kilpailija.sukunimi }} <strong>{{ h.pisteet }}</strong>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="lajiosio">
        <h2>Kokonaiskilpailu — henkilökohtainen</h2>
        <p class="selite">
          Kilpailijan tulosten summa kaikista lajeista.
          <template v-if="kisa.tyyppi === 'resul'">
            Tasatuloksen ratkaisee parempi RA2:n tulos.
          </template>
          <template v-else>Tasatuloksessa ratkaisee sukunimen mukainen järjestys.</template>
        </p>
        <div class="taulukko-kehys">
          <table>
            <thead>
              <tr>
                <th class="numero">Sija</th>
                <th>Nimi</th>
                <th>Yhdistys</th>
                <th v-for="l in lajit" :key="l.id" class="numero" :title="l.nimi">{{ l.koodi }}</th>
                <th class="numero">Yhteensä</th>
                <th class="numero">Lajeja</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rivi in henkilokohtainen" :key="rivi.kilpailija.id">
                <td class="numero sija">
                  {{ rivi.sija }}<span v-if="rivi.jaettu" class="jaettu">.</span>
                </td>
                <th scope="row">
                  {{ rivi.kilpailija.sukunimi
                  }}<span class="etunimi">, {{ rivi.kilpailija.etunimi }}</span>
                </th>
                <td>{{ rivi.kilpailija.yhdistys || '—' }}</td>
                <td v-for="l in lajit" :key="l.id" class="numero">
                  {{ rivi.lajipisteet[l.id] ?? '' }}
                </td>
                <td class="numero yhteensa">{{ rivi.pisteet }}</td>
                <td class="numero">
                  {{ rivi.lajeja
                  }}<span v-if="rivi.kaikkiLajit" class="taysi" title="Kaikki lajit">✓</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.suodatin {
  margin: 0.85rem 0 1.25rem;
}
.suodatin-otsikko {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--vari-teksti-himmea);
  margin-bottom: 0.25rem;
}
.napit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

h2 {
  font-size: 1.05rem;
  margin: 1.5rem 0 0.5rem;
}
.lajiosio {
  margin-top: 0.5rem;
}
.selite {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
  margin-bottom: 0.6rem;
}
.tyhja {
  font-size: 0.9rem;
  color: var(--vari-teksti-himmea);
}

.sija {
  font-weight: 700;
}
.jaettu {
  color: var(--vari-teksti-himmea);
}
.yhteensa {
  font-weight: 700;
  font-size: 1.05rem;
}
.etunimi {
  font-weight: 400;
  color: var(--vari-teksti-himmea);
}
.vajaa {
  margin-left: 0.35rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: var(--vari-varoitus-tausta);
  color: var(--vari-varoitus);
  font-size: 0.7rem;
  font-weight: 700;
}
.taysi {
  margin-left: 0.25rem;
  color: var(--vari-korostus);
}
.huomioidut {
  white-space: normal;
}
.huomioitu {
  display: inline-block;
  margin-right: 0.6rem;
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
}
.huomioitu strong {
  color: var(--vari-teksti);
  font-variant-numeric: tabular-nums;
}
</style>
