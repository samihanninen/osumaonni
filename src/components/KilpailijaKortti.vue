<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import type { Kilpailija, Laji, LajiMaaritys } from '@/types/kisa'
import { laskeLaji } from '@/core/laskenta'
import { naytaLaukaus } from '@/core/laukaus'
import { LUOKKA_NIMET } from '@/core/lajit'

const props = defineProps<{
  kilpailija: Kilpailija
  laji: Laji
  maaritys: LajiMaaritys
  /** Aktiivinen kilpasarja ja laukaus, joihin näppäimistön syöte menee. */
  aktiivinenSarja: number
  aktiivinenLaukaus: number
}>()

const emit = defineEmits<{
  valitse: [sarja: number, laukaus: number]
}>()

const osallistuminen = computed(() => props.kilpailija.osallistumiset[props.laji])

const tulos = computed(() => {
  const o = osallistuminen.value
  return o ? laskeLaji(props.laji, props.maaritys, o) : null
})

function laukaukset(sarja: number) {
  return osallistuminen.value?.kilpasarjat[sarja]?.laukaukset ?? []
}

function sarjanNimi(i: number): string {
  return props.maaritys.kilpasarjoja === 1 ? 'Kilpasarja' : `Kilpasarja ${i + 1}`
}

/** Ruudun tunniste, jotta aktiivinen ruutu voidaan vierittää näkyviin. */
function ruudunId(sarja: number, laukaus: number): string {
  return `ruutu-${props.kilpailija.id}-${sarja}-${laukaus}`
}

/*
 * Vieritetään aktiivinen ruutu näkyviin aina kun se vaihtuu.
 *
 * Näppäimistö on kiinnitetty näytön alalaitaan, joten kapealla puhelimella kortista
 * näkyy kerrallaan vain osa. Ilman tätä kirjaaja ei näkisi sitä ruutua, jota on
 * täyttämässä — ja juuri sen näkeminen on koko kortin tarkoitus. `block: 'nearest'`
 * liikuttaa näkymää mahdollisimman vähän.
 */
watch(
  () => [props.aktiivinenSarja, props.aktiivinenLaukaus, props.kilpailija.id],
  () => {
    void nextTick(() => {
      const el = document.getElementById(ruudunId(props.aktiivinenSarja, props.aktiivinenLaukaus))
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  },
  { immediate: true },
)
</script>

<template>
  <article v-if="osallistuminen && tulos" class="kortti kortti-kilpailija">
    <header class="ylatunniste">
      <h2 class="nimi">{{ kilpailija.etunimi }} {{ kilpailija.sukunimi }}</h2>
      <p class="tiedot">
        <span>{{ kilpailija.yhdistys || '—' }}</span>
        <span class="erotin" aria-hidden="true">·</span>
        <span>{{ LUOKKA_NIMET[osallistuminen.luokka] }}</span>
        <span class="erotin" aria-hidden="true">·</span>
        <span>{{ kilpailija.ikasarja }}</span>
      </p>
    </header>

    <section
      v-for="(_, sarja) in maaritys.kilpasarjoja"
      :key="sarja"
      class="sarja"
      :class="{ 'sarja--laskeva': tulos.laskevaSarja === sarja }"
    >
      <div class="sarja-otsikko">
        <h3>
          {{ sarjanNimi(sarja) }}
          <span
            v-if="tulos.laskevaSarja === sarja"
            class="merkki-laskeva"
            title="Tämä sarja huomioidaan tuloksessa"
            >huomioidaan</span
          >
        </h3>
        <p class="sarja-summa">
          <strong>{{ tulos.sarjat[sarja]?.pisteet ?? 0 }}</strong>
          <span v-if="(tulos.sarjat[sarja]?.navat ?? 0) > 0" class="navat">
            {{ tulos.sarjat[sarja]?.navat }} ★
          </span>
        </p>
      </div>

      <div class="ruudut" role="group" :aria-label="sarjanNimi(sarja)">
        <button
          v-for="(arvo, i) in laukaukset(sarja)"
          :key="i"
          type="button"
          class="ruutu"
          :class="{
            'ruutu--aktiivinen': aktiivinenSarja === sarja && aktiivinenLaukaus === i,
            'ruutu--tyhja': arvo === null,
            'ruutu--napa': arvo === '*',
          }"
          :aria-label="`${sarjanNimi(sarja)}, laukaus ${i + 1}`"
          :aria-current="aktiivinenSarja === sarja && aktiivinenLaukaus === i ? 'true' : undefined"
          @click="emit('valitse', sarja, i)"
        >
          {{ naytaLaukaus(arvo) }}
        </button>
      </div>
    </section>

    <footer class="yhteenveto">
      <div class="luku">
        <span class="luku-otsikko">Kilpailutulos</span>
        <strong class="luku-arvo">{{ tulos.pisteet }}</strong>
      </div>
      <div class="luku">
        <span class="luku-otsikko">Napakympit</span>
        <strong class="luku-arvo">{{ tulos.peruste.navat }}</strong>
      </div>
      <div class="luku">
        <span class="luku-otsikko">Iskemät</span>
        <strong class="luku-arvo">{{ tulos.peruste.iskemat }}</strong>
      </div>
      <p v-if="tulos.rangaistuksia > 0" class="rangaistus">
        Sääntörikkeet −{{ tulos.rangaistuksia * 2 }} p (bruttotulos {{ tulos.bruttoPisteet }})
      </p>
      <p v-if="tulos.hylatty" class="hylatty">Hylätty — tulos mitätöity</p>
    </footer>
  </article>

  <p v-else class="huomio huomio--virhe">Kilpailija ei osallistu lajiin {{ laji }}.</p>
</template>

<style scoped>
.kortti-kilpailija {
  padding: 0.85rem 1rem;
}

.ylatunniste {
  border-bottom: 1px solid var(--vari-reuna);
  padding-bottom: 0.5rem;
  margin-bottom: 0.6rem;
}
.nimi {
  font-size: 1.2rem;
  line-height: 1.25;
}
.tiedot {
  font-size: 0.9rem;
  color: var(--vari-teksti-himmea);
}
.erotin {
  margin: 0 0.35rem;
}

.sarja {
  margin-bottom: 0.85rem;
}
.sarja-otsikko {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}
.sarja-otsikko h3 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--vari-teksti-himmea);
}
.merkki-laskeva {
  margin-left: 0.4rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: var(--vari-korostus-himmea);
  color: var(--vari-korostus);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}
.sarja-summa strong {
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
}
.navat {
  margin-left: 0.4rem;
  font-size: 0.85rem;
  color: var(--vari-korostus);
}

/* Laukausruudut kiertyvät riveille, jotta 10 mahtuu kapeaan näyttöön. */
.ruudut {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(2.4rem, 1fr));
  gap: 0.3rem;
}
.ruutu {
  min-height: 44px;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--vari-reuna);
  border-radius: 8px;
  background: var(--vari-tausta);
  color: var(--vari-teksti);
  cursor: pointer;
  touch-action: manipulation;
}
.ruutu--tyhja {
  color: var(--vari-teksti-himmea);
  font-weight: 400;
}
.ruutu--napa {
  color: var(--vari-korostus);
  border-color: var(--vari-korostus);
}
.ruutu--aktiivinen {
  outline: 3px solid var(--vari-korostus);
  outline-offset: -1px;
  background: var(--vari-korostus-himmea);
}

.yhteenveto {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  border-top: 1px solid var(--vari-reuna);
  padding-top: 0.6rem;
}
.luku {
  display: flex;
  flex-direction: column;
}
.luku-otsikko {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--vari-teksti-himmea);
}
.luku-arvo {
  font-size: 1.35rem;
  font-variant-numeric: tabular-nums;
  /* Varataan tila kolminumeroiselle luvulle, jottei 0 → 100 muuta rivin korkeutta. */
  min-width: 3ch;
}
.rangaistus,
.hylatty {
  flex-basis: 100%;
  font-size: 0.85rem;
  color: var(--vari-virhe);
}
</style>
