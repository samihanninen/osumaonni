<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import { kisanLajit, kisanSarjat, LUOKAT, LUOKKA_NIMET, sarjanNimi } from '@/core/lajit'
import { sijoitukset } from '@/core/sijoitukset'
import type { LajiId, Luokka, SarjaId } from '@/types/kisa'

const route = useRoute()
const store = useKisaStore()
const { kisa } = storeToRefs(store)

/** Kisan lajit muodosta riippumatta. */
const lajit = computed(() => kisanLajit(kisa.value))

const laji = computed<LajiId>(() => {
  const p = route.params.laji
  const arvo = Array.isArray(p) ? p[0] : p
  if (typeof arvo === 'string' && lajit.value.some((l) => l.id === arvo)) return arvo
  return lajit.value[0]?.id ?? ''
})

const rakenne = computed(() => lajit.value.find((l) => l.id === laji.value))

const luokka = ref<Luokka>('vakio')
const ikasarjaSuodatin = ref<SarjaId | 'kaikki'>('kaikki')

/** Kisan sarjat: RESUL-kisassa H ja H50, mukautetussa järjestäjän omat. */
const sarjat = computed(() => kisanSarjat(kisa.value))

/**
 * Suodatetut kilpailijat. Kun ikäsarja on rajattu, sijoitukset lasketaan **rajauksen
 * sisällä** — muuten H50-listassa näkyisi aukkoja yleisen sarjan sijaluvuista, mikä ei
 * kelpaa palkintojen jakoon. Otsikko kertoo aina rajauksen, joten tulkinta on selvä.
 */
const suodatetut = computed(() =>
  ikasarjaSuodatin.value === 'kaikki'
    ? kisa.value.kilpailijat
    : kisa.value.kilpailijat.filter((k) => k.ikasarja === ikasarjaSuodatin.value),
)

const rivit = computed(() =>
  rakenne.value ? sijoitukset(suodatetut.value, laji.value, luokka.value, rakenne.value) : [],
)

const otsikko = computed(() => {
  const osat = [rakenne.value?.koodi ?? laji.value, LUOKKA_NIMET[luokka.value]]
  if (ikasarjaSuodatin.value !== 'kaikki') osat.push(ikasarjaSuodatin.value)
  return osat.join(' · ')
})

/** Montako osallistujaa lajissa on kussakin luokassa — näkyy välilehdissä. */
function luokassa(l: Luokka): number {
  return kisa.value.kilpailijat.filter((k) => k.osallistumiset[laji.value]?.luokka === l).length
}

function sijaTeksti(sija: number): string {
  return sija === 0 ? '—' : String(sija)
}
</script>

<template>
  <section class="sivu">
    <h1>Sijoitukset</h1>

    <nav class="lajivalinta" aria-label="Laji">
      <RouterLink
        v-for="l in lajit"
        :key="l.id"
        :to="{ name: 'sijoitukset', params: { laji: l.id } }"
        class="lajinappi"
        :class="{ 'lajinappi--valittu': l.id === laji }"
        :title="l.nimi"
      >
        {{ l.koodi }}
      </RouterLink>
    </nav>

    <div class="suodattimet">
      <div class="suodatin">
        <span class="suodatin-otsikko">Aseluokka</span>
        <div class="napit" role="group" aria-label="Aseluokka">
          <button
            v-for="l in LUOKAT"
            :key="l"
            type="button"
            class="pikkunappi"
            :class="{ 'pikkunappi--valittu': luokka === l }"
            @click="luokka = l"
          >
            {{ LUOKKA_NIMET[l] }} <small>{{ luokassa(l) }}</small>
          </button>
        </div>
      </div>

      <div class="suodatin">
        <span class="suodatin-otsikko">Ikäsarja</span>
        <div class="napit" role="group" aria-label="Ikäsarja">
          <button
            type="button"
            class="pikkunappi"
            :class="{ 'pikkunappi--valittu': ikasarjaSuodatin === 'kaikki' }"
            @click="ikasarjaSuodatin = 'kaikki'"
          >
            Kaikki
          </button>
          <button
            v-for="s in sarjat"
            :key="s"
            type="button"
            class="pikkunappi"
            :class="{ 'pikkunappi--valittu': ikasarjaSuodatin === s }"
            @click="ikasarjaSuodatin = s"
          >
            {{ s }}
          </button>
        </div>
      </div>
    </div>

    <h2 class="tulososio">{{ otsikko }}</h2>
    <p class="selite">
      Tasatuloksen ratkaisee iskemien määrä, sitten napakympit, kympit, ysit ja niin edelleen.
      <template v-if="rakenne?.tulosSaanto === 'paras'">
        Tarvittaessa myös huonompi kilpasarja.
      </template>
      Sijalta 9 alkaen tasatulokset jaetaan sukunimen mukaisessa aakkosjärjestyksessä.
      <template v-if="ikasarjaSuodatin !== 'kaikki'">
        <strong>Sijoitukset on laskettu ikäsarjan {{ ikasarjaSuodatin }} sisällä.</strong>
      </template>
    </p>

    <p v-if="rivit.length === 0" class="tulossa">
      Ei tuloksia.
      <RouterLink :to="{ name: 'syotto', params: { laji } }">Syötä tuloksia</RouterLink>.
    </p>

    <div v-else class="taulukko-kehys taulukko-kehys--kiinnita">
      <table>
        <thead>
          <tr>
            <th class="numero">Sija</th>
            <th>Nimi</th>
            <th>Yhdistys</th>
            <th>Ikäsarja</th>
            <!-- Sarjan oma nimi otsikkoon, jotta kolmen asennon kisassa näkyy asento. -->
            <th
              v-for="(sarja, i) in rakenne?.kilpasarjat ?? []"
              :key="i"
              class="numero"
              :title="rakenne ? sarjanNimi(rakenne, i) : ''"
            >
              {{ sarja.nimi?.trim() || 'S' + (i + 1) }}
            </th>
            <th class="numero">Tulos</th>
            <th class="numero" title="Iskemien määrä">Isk.</th>
            <th class="numero" title="Napakympit">★</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="rivi in rivit"
            :key="rivi.kilpailija.id"
            :class="{
              'rivi--hylatty': rivi.tulos.hylatty,
              'rivi--kolme': rivi.sija <= 3 && rivi.sija > 0,
            }"
          >
            <td class="numero sija">
              {{ sijaTeksti(rivi.sija) }}<span v-if="rivi.jaettu" class="jaettu">.</span>
            </td>
            <th scope="row" class="nimi">
              {{ rivi.kilpailija.sukunimi
              }}<span class="etunimi">, {{ rivi.kilpailija.etunimi }}</span>
            </th>
            <td>{{ rivi.kilpailija.yhdistys || '—' }}</td>
            <td>{{ rivi.kilpailija.ikasarja }}</td>
            <td
              v-for="(sarja, i) in rivi.tulos.sarjat"
              :key="i"
              class="numero"
              :class="{ laskeva: rivi.tulos.laskevaSarja === i }"
            >
              {{ sarja.pisteet }}
            </td>
            <td class="numero tulos">
              {{ rivi.tulos.pisteet }}
              <span v-if="rivi.tulos.hylatty" class="merkinta">hylätty</span>
              <span v-else-if="rivi.tulos.rangaistuksia > 0" class="merkinta">
                −{{ rivi.tulos.rangaistuksia * 2 }}
              </span>
            </td>
            <td class="numero">{{ rivi.tulos.peruste.iskemat }}</td>
            <td class="numero napa">{{ rivi.tulos.peruste.navat || '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="rivit.some((r) => r.tulos.laskevaSarja >= 0)" class="alaselite">
      Lihavoitu sarja on se, joka huomioidaan tuloksessa.
    </p>
  </section>
</template>

<style scoped>
.lajivalinta {
  display: flex;
  gap: 0.4rem;
  margin: 0.6rem 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.lajivalinta::-webkit-scrollbar {
  display: none;
}
.lajinappi {
  flex: 0 0 auto;
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--vari-reuna);
  border-radius: var(--reunapyoristys);
  background: var(--vari-tausta-korotettu);
  color: var(--vari-teksti);
  text-decoration: none;
  font-weight: 700;
}
.lajinappi--valittu {
  background: var(--vari-korostus);
  border-color: var(--vari-korostus);
  color: #fff;
}

.suodattimet {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
  margin-bottom: 1rem;
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
  gap: 0.25rem;
}
.pikkunappi {
  min-height: 40px;
  padding: 0.3rem 0.7rem;
  font: inherit;
  font-size: 0.9rem;
  border: 1px solid var(--vari-reuna);
  border-radius: var(--reunapyoristys);
  background: var(--vari-tausta-korotettu);
  color: var(--vari-teksti-himmea);
  cursor: pointer;
}
.pikkunappi small {
  opacity: 0.7;
  font-size: 0.78rem;
}
.pikkunappi--valittu {
  border-color: var(--vari-korostus);
  color: var(--vari-korostus);
  font-weight: 700;
}

.tulososio {
  font-size: 1.05rem;
  margin-bottom: 0.25rem;
}
.selite,
.alaselite {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
  margin-bottom: 0.85rem;
}
.alaselite {
  margin-top: 0.5rem;
}

.sija {
  font-weight: 700;
  font-size: 1.05rem;
}
.jaettu {
  color: var(--vari-teksti-himmea);
}
.nimi {
  font-weight: 600;
}
.etunimi {
  font-weight: 400;
  color: var(--vari-teksti-himmea);
}
.laskeva {
  font-weight: 700;
}
.tulos {
  font-weight: 700;
  font-size: 1.05rem;
}
.merkinta {
  display: block;
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--vari-virhe);
}
.napa {
  color: var(--vari-korostus);
}
.rivi--kolme .sija {
  color: var(--vari-korostus);
}
.rivi--hylatty {
  opacity: 0.55;
}
</style>
