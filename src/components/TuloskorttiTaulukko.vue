<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Kilpailija, Laji, LajiMaaritys, Laukaus, Luokka } from '@/types/kisa'
import { laskeLaji } from '@/core/laskenta'
import { jasennaLaukaus, laukausKenttaan, onLopullinenMerkki, onSyottoMerkki } from '@/core/laukaus'
import { LUOKAT, LUOKKA_NIMET } from '@/core/lajit'

const props = defineProps<{
  kilpailijat: Kilpailija[]
  laji: Laji
  maaritys: LajiMaaritys
  lukittu?: boolean
}>()

const emit = defineEmits<{
  syota: [id: string, sarja: number, laukaus: number, arvo: Laukaus]
  luokka: [id: string, luokka: Luokka]
  rangaistukset: [id: string, maara: number]
  hylatty: [id: string, hylatty: boolean]
}>()

const tulokset = computed(() => {
  const map = new Map<string, ReturnType<typeof laskeLaji>>()
  for (const k of props.kilpailijat) {
    const o = k.osallistumiset[props.laji]
    if (o) map.set(k.id, laskeLaji(props.laji, props.maaritys, o))
  }
  return map
})

function laukaukset(k: Kilpailija, sarja: number): Laukaus[] {
  return k.osallistumiset[props.laji]?.kilpasarjat[sarja]?.laukaukset ?? []
}

/** Yksilöivä tunniste ruudulle, jotta kohdistus voidaan siirtää näppäimillä. */
function ruudunId(id: string, sarja: number, laukaus: number): string {
  return `ls-${id}-${sarja}-${laukaus}`
}

/** Litteä indeksi: mahdollistaa siirtymisen sarjan rajan yli samalla rivillä. */
const laukauksiaRivilla = computed(
  () => props.maaritys.kilpasarjoja * props.maaritys.laukauksiaSarjassa,
)

function siirryRuutuun(rivi: number, litteaIndeksi: number) {
  const rivit = props.kilpailijat.length
  if (rivi < 0 || rivi >= rivit) return
  const maara = laukauksiaRivilla.value
  if (litteaIndeksi < 0 || litteaIndeksi >= maara) return

  const kohde = props.kilpailijat[rivi]
  if (!kohde) return
  const sarja = Math.floor(litteaIndeksi / props.maaritys.laukauksiaSarjassa)
  const laukaus = litteaIndeksi % props.maaritys.laukauksiaSarjassa

  void nextTick(() => {
    const el = document.getElementById(ruudunId(kohde.id, sarja, laukaus))
    if (el instanceof HTMLInputElement) {
      el.focus()
      el.select()
    }
  })
}

/**
 * Odottaa mahdollista nollaa ykkösen perään (1 → 10). Sisältää sen ruudun litteän
 * indeksin, jossa ykkönen kirjattiin.
 */
const odottaaNollaa = ref<{ rivi: number; littea: number } | null>(null)

/** Kirjaa arvon litteän indeksin osoittamaan ruutuun. */
function kirjaa(rivi: number, littea: number, arvo: Laukaus): boolean {
  const k = props.kilpailijat[rivi]
  if (!k) return false
  if (littea < 0 || littea >= laukauksiaRivilla.value) return false
  const sarja = Math.floor(littea / props.maaritys.laukauksiaSarjassa)
  const laukaus = littea % props.maaritys.laukauksiaSarjassa
  emit('syota', k.id, sarja, laukaus, arvo)
  return true
}

function kasitteleNappain(
  e: KeyboardEvent,
  k: Kilpailija,
  rivi: number,
  sarja: number,
  laukaus: number,
) {
  const littea = sarja * props.maaritys.laukauksiaSarjassa + laukaus

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault()
      odottaaNollaa.value = null
      return siirryRuutuun(rivi, littea + 1)
    case 'ArrowLeft':
      e.preventDefault()
      odottaaNollaa.value = null
      return siirryRuutuun(rivi, littea - 1)
    case 'ArrowDown':
    case 'Enter':
      e.preventDefault()
      odottaaNollaa.value = null
      return siirryRuutuun(rivi + 1, littea)
    case 'ArrowUp':
      e.preventDefault()
      odottaaNollaa.value = null
      return siirryRuutuun(rivi - 1, littea)
    case 'Backspace':
    case 'Delete':
      e.preventDefault()
      odottaaNollaa.value = null
      emit('syota', k.id, sarja, laukaus, null)
      return
    case 'Tab':
      odottaaNollaa.value = null
      return // selain hoitaa siirtymän
  }

  if (e.key.length !== 1) return
  if (!onSyottoMerkki(e.key)) {
    e.preventDefault()
    return
  }
  e.preventDefault()

  const odottaa = odottaaNollaa.value
  const odottaaTassa = odottaa?.rivi === rivi && odottaa?.littea === littea

  if (odottaaTassa) {
    odottaaNollaa.value = null

    // '0' täydentää aiemman ykkösen kympiksi samassa ruudussa.
    if (e.key === '0') {
      kirjaa(rivi, littea, 10)
      siirryRuutuun(rivi, littea + 1)
      return
    }

    /*
     * Muu merkki: ykkönen jää voimaan ja uusi arvo menee SEURAAVAAN ruutuun. Ilman
     * tätä nopea "1 5 9" ylikirjoittaisi ykkösen, ja laukaus katoaisi huomaamatta.
     */
    const arvo = jasennaLaukaus(e.key)
    if (arvo === undefined) return
    if (!kirjaa(rivi, littea + 1, arvo)) return

    if (onLopullinenMerkki(e.key)) {
      siirryRuutuun(rivi, littea + 2)
    } else {
      // Toinen ykkönen peräkkäin: jäädään odottamaan nollaa uudessa ruudussa.
      siirryRuutuun(rivi, littea + 1)
      odottaaNollaa.value = { rivi, littea: littea + 1 }
    }
    return
  }

  const arvo = jasennaLaukaus(e.key)
  if (arvo === undefined) return
  kirjaa(rivi, littea, arvo)

  if (onLopullinenMerkki(e.key)) {
    siirryRuutuun(rivi, littea + 1)
  } else {
    // Ykkönen: jäädään ruutuun, koska seuraava '0' tekisi siitä kympin.
    odottaaNollaa.value = { rivi, littea }
  }
}

/** Liitetty teksti tai mobiiliselaimen syöte, joka ei tuota keydown-merkkiä. */
function kasitteleSyote(e: Event, k: Kilpailija, sarja: number, laukaus: number) {
  const kentta = e.target as HTMLInputElement
  const arvo = jasennaLaukaus(kentta.value)
  if (arvo === undefined) {
    // Palauta edellinen kelvollinen arvo.
    kentta.value = laukausKenttaan(laukaukset(k, sarja)[laukaus] ?? null)
    return
  }
  emit('syota', k.id, sarja, laukaus, arvo)
}

function poistuRuudusta() {
  odottaaNollaa.value = null
}
</script>

<template>
  <div class="taulukko-kehys taulukko-kehys--kiinnita">
    <table class="tuloskortti">
      <thead>
        <tr>
          <th class="numero kiinni-vasen">#</th>
          <th class="kiinni-nimi">Nimi</th>
          <th>Yhdistys</th>
          <th>Luokka</th>
          <th>Sarja</th>
          <th v-for="i in maaritys.laukauksiaSarjassa" :key="i" class="numero kapea">
            {{ i }}
          </th>
          <th class="numero">Yht</th>
          <th class="numero">★</th>
          <th class="numero">Tulos</th>
          <th class="numero">Rike</th>
          <th>Hyl.</th>
        </tr>
      </thead>

      <tbody>
        <template v-for="(k, rivi) in kilpailijat" :key="k.id">
          <tr
            v-for="sarja in maaritys.kilpasarjoja"
            :key="`${k.id}-${sarja}`"
            :class="{ 'rivi--eka': sarja === 1, 'rivi--hylatty': tulokset.get(k.id)?.hylatty }"
          >
            <!-- Nimi ja muut kilpailijatiedot vain ensimmäisellä sarjarivillä. -->
            <th
              v-if="sarja === 1"
              scope="rowgroup"
              class="numero kiinni-vasen"
              :rowspan="maaritys.kilpasarjoja"
            >
              {{ rivi + 1 }}
            </th>
            <th
              v-if="sarja === 1"
              scope="rowgroup"
              class="kiinni-nimi nimisolu"
              :rowspan="maaritys.kilpasarjoja"
            >
              {{ k.sukunimi }}<span class="etunimi">, {{ k.etunimi }}</span>
            </th>
            <td v-if="sarja === 1" :rowspan="maaritys.kilpasarjoja">{{ k.yhdistys || '—' }}</td>
            <td v-if="sarja === 1" :rowspan="maaritys.kilpasarjoja">
              <select
                class="luokkavalinta"
                :aria-label="`${k.sukunimi}: aseluokka`"
                :disabled="lukittu"
                :value="k.osallistumiset[laji]?.luokka"
                @change="emit('luokka', k.id, ($event.target as HTMLSelectElement).value as Luokka)"
              >
                <option v-for="l in LUOKAT" :key="l" :value="l">{{ LUOKKA_NIMET[l] }}</option>
              </select>
            </td>

            <th scope="row" class="sarjasolu">
              S{{ sarja }}
              <span
                v-if="tulokset.get(k.id)?.laskevaSarja === sarja - 1"
                class="laskeva"
                title="Huomioidaan tuloksessa"
                >●</span
              >
            </th>

            <td v-for="(arvo, i) in laukaukset(k, sarja - 1)" :key="i" class="ruutusolu">
              <input
                :id="ruudunId(k.id, sarja - 1, i)"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                maxlength="2"
                class="ruutu"
                :class="{ 'ruutu--napa': arvo === '*', 'ruutu--ohi': arvo === '-' || arvo === 0 }"
                :disabled="lukittu"
                :aria-label="`${k.sukunimi}, sarja ${sarja}, laukaus ${i + 1}`"
                :value="laukausKenttaan(arvo)"
                @keydown="kasitteleNappain($event, k, rivi, sarja - 1, i)"
                @input="kasitteleSyote($event, k, sarja - 1, i)"
                @blur="poistuRuudusta"
                @focus="($event.target as HTMLInputElement).select()"
              />
            </td>

            <td class="numero">{{ tulokset.get(k.id)?.sarjat[sarja - 1]?.pisteet ?? 0 }}</td>
            <td class="numero napasolu">
              {{ tulokset.get(k.id)?.sarjat[sarja - 1]?.navat || '' }}
            </td>

            <td v-if="sarja === 1" class="numero tulossolu" :rowspan="maaritys.kilpasarjoja">
              {{ tulokset.get(k.id)?.pisteet ?? 0 }}
            </td>
            <td v-if="sarja === 1" class="numero" :rowspan="maaritys.kilpasarjoja">
              <input
                type="number"
                min="0"
                max="20"
                class="rikesolu"
                :aria-label="`${k.sukunimi}: sääntörikkeet`"
                :disabled="lukittu"
                :value="k.osallistumiset[laji]?.rangaistuksia ?? 0"
                @change="
                  emit('rangaistukset', k.id, Number(($event.target as HTMLInputElement).value))
                "
              />
            </td>
            <td v-if="sarja === 1" :rowspan="maaritys.kilpasarjoja">
              <input
                type="checkbox"
                class="hylkays"
                :aria-label="`${k.sukunimi}: hylätty`"
                :disabled="lukittu"
                :checked="k.osallistumiset[laji]?.hylatty ?? false"
                @change="emit('hylatty', k.id, ($event.target as HTMLInputElement).checked)"
              />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>

  <p class="ohje">
    Kirjoita <strong>1–10</strong>, <strong>*</strong> napakymppi, <strong>-</strong> tai
    <strong>0</strong> ohilaukaus. Nuolinäppäimet ja Enter siirtävät ruudusta toiseen. Kympin saat
    kirjoittamalla <strong>1</strong> ja <strong>0</strong>.
  </p>
</template>

<style scoped>
.tuloskortti {
  font-size: 0.9rem;
}
.tuloskortti td,
.tuloskortti th {
  padding: 0.2rem 0.35rem;
}

/* Nimi ja järjestysnumero pysyvät näkyvissä vaakavieritettäessä. */
.kiinni-vasen {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--vari-tausta-korotettu);
}
.kiinni-nimi {
  position: sticky;
  left: 2.5rem;
  z-index: 2;
  background: var(--vari-tausta-korotettu);
}
thead .kiinni-vasen,
thead .kiinni-nimi {
  z-index: 3;
  background: var(--vari-tausta);
}
.nimisolu {
  font-weight: 600;
  border-right: 1px solid var(--vari-reuna);
}
.etunimi {
  font-weight: 400;
  color: var(--vari-teksti-himmea);
}

.rivi--eka td,
.rivi--eka th {
  border-top: 2px solid var(--vari-reuna);
}
.rivi--hylatty {
  opacity: 0.6;
}

.sarjasolu {
  font-size: 0.78rem;
  color: var(--vari-teksti-himmea);
  white-space: nowrap;
}
.laskeva {
  color: var(--vari-korostus);
  font-size: 0.7rem;
}

.kapea {
  width: 2.4rem;
}
.ruutusolu {
  padding: 0.15rem !important;
}
.ruutu {
  width: 2.4rem;
  min-height: 34px;
  padding: 0.15rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  border-radius: 6px;
}
.ruutu--napa {
  color: var(--vari-korostus);
  border-color: var(--vari-korostus);
}
.ruutu--ohi {
  color: var(--vari-teksti-himmea);
}

.napasolu {
  color: var(--vari-korostus);
}
.tulossolu {
  font-size: 1.05rem;
  font-weight: 700;
}

.luokkavalinta {
  width: auto;
  min-width: 6rem;
  min-height: 34px;
  padding: 0.15rem 0.3rem;
  font-size: 0.85rem;
}
.rikesolu {
  width: 3.5rem;
  min-height: 34px;
  padding: 0.15rem;
  text-align: right;
}
.hylkays {
  width: 1.15rem;
  height: 1.15rem;
}

.ohje {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
}
</style>
