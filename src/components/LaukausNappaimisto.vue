<script setup lang="ts">
import type { Laukaus } from '@/types/kisa'
import { NAPPAIMISTON_ARVOT, naytaLaukaus } from '@/core/laukaus'

/**
 * Iso kosketusnäppäimistö laukausten syöttöön. Näppäinten järjestys noudattaa
 * puhelimen numeronäppäimistöä, jotta suuret arvot ovat ylhäällä.
 */
defineProps<{
  /** Estä syöttö, esim. kun laite on luovuttanut kisan eteenpäin. */
  lukittu?: boolean
}>()

const emit = defineEmits<{
  syota: [arvo: Laukaus]
  peruuta: []
  seuraava: []
  edellinen: []
}>()

function nimi(arvo: Laukaus): string {
  if (arvo === '*') return 'napakymppi'
  if (arvo === '-') return 'ohilaukaus'
  return `${arvo} pistettä`
}
</script>

<template>
  <div class="nappaimisto" role="group" aria-label="Laukausten syöttö">
    <div class="arvot">
      <button
        v-for="arvo in NAPPAIMISTON_ARVOT"
        :key="String(arvo)"
        type="button"
        class="nappain"
        :class="{
          'nappain--napa': arvo === '*',
          'nappain--ohi': arvo === '-',
        }"
        :disabled="lukittu"
        :aria-label="nimi(arvo)"
        @click="emit('syota', arvo)"
      >
        {{ naytaLaukaus(arvo) }}
      </button>
    </div>

    <!--
      Toiminnot omalla rivillään ja matalampina. Aiemmin nämä olivat samassa
      neliruutuisessa ruudukossa arvonäppäinten kanssa, jolloin ⌫ ja kaksi kahden
      sarakkeen painiketta eivät mahtuneet riville ja "Seuraava" pakkautui omalle
      rivilleen. Se vei kilpailijan nimen ja sarjat näytön ulkopuolelle.
    -->
    <div class="toiminnot">
      <button
        type="button"
        class="nappain nappain--toiminto nappain--kapea"
        :disabled="lukittu"
        aria-label="Poista viimeinen"
        @click="emit('peruuta')"
      >
        ⌫
      </button>

      <button
        type="button"
        class="nappain nappain--toiminto"
        aria-label="Edellinen kilpailija"
        @click="emit('edellinen')"
      >
        ‹ Edellinen
      </button>

      <button
        type="button"
        class="nappain nappain--toiminto"
        aria-label="Seuraava kilpailija"
        @click="emit('seuraava')"
      >
        Seuraava ›
      </button>
    </div>
  </div>
</template>

<style scoped>
.nappaimisto {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 26rem;
  margin: 0 auto;
}

.arvot {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.toiminnot {
  display: flex;
  gap: 0.5rem;
}
/* Siirtymäpainikkeet jakavat tilan tasan; ⌫ vie vain oman leveytensä. */
.toiminnot .nappain {
  flex: 1 1 0;
}
.toiminnot .nappain--kapea {
  flex: 0 0 3.75rem;
}

.nappain {
  /* Iso kosketuskohde: kirjaaminen tapahtuu ampumaradalla, usein hanskat kädessä. */
  min-height: 56px;
  font: inherit;
  font-size: 1.25rem;
  font-weight: 700;
  border: 1px solid var(--vari-reuna);
  border-radius: var(--reunapyoristys);
  background: var(--vari-tausta-korotettu);
  color: var(--vari-teksti);
  cursor: pointer;
  /* Estä tuplanapautuksen zoom ja tekstin valinta nopeassa syötössä */
  touch-action: manipulation;
  user-select: none;
}
.nappain:active {
  background: var(--vari-korostus-himmea);
  border-color: var(--vari-korostus);
}
.nappain:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/*
 * Napakymppi erottuu täytettynä, ei pelkällä reunuksella.
 *
 * Näppäintä etsitään kesken sarjan, kirkkaassa valossa ja kiireessä. Aiemmin se erosi
 * naapureistaan vain vihreällä tekstillä ja reunuksella — saman kokoisena ja
 * painoisena kuin numerot ympärillään, jolloin sen löytäminen vaati numeroiden
 * lukemista. Täytetty tausta ja isompi merkki löytyvät yhdellä vilkaisulla.
 *
 * Merkki pysyy tähtenä (`NAPA_NAYTTO`), koska sama merkki näkyy tuloskortin ruuduissa
 * ja napalaskurissa. Ohutviivainen bullseye haalistuu pienessä ruudussa, joten yksi
 * täytetty merkki toimii molemmissa paikoissa paremmin kuin kaksi eri merkkiä.
 */
.nappain--napa {
  background: var(--vari-korostus);
  border-color: var(--vari-korostus);
  /*
   * Tekstin väri on taustaväri eikä valkoinen: tumma teema kääntää korostuksen
   * vaaleaksi vihreäksi, jolloin valkoinen teksti jäisi lukukelvottomaksi.
   */
  color: var(--vari-tausta);
  font-size: 1.7rem;
  /* Isompi merkki ei saa kasvattaa näppäintä naapureitaan korkeammaksi. */
  line-height: 1;
}
/*
 * Oma painallustila. Yleinen `.nappain:active` vaalentaa taustan, jolloin
 * taustanvärinen merkki katoaisi siihen — käännetään värit toisin päin.
 */
.nappain--napa:active {
  background: var(--vari-korostus-himmea);
  color: var(--vari-korostus);
}
.nappain--ohi {
  color: var(--vari-teksti-himmea);
}
/*
 * Toimintopainikkeet ovat matalampia kuin arvonäppäimet: niitä painetaan kerran
 * kilpailijaa kohti, kun arvonäppäimiä painetaan kymmeniä kertoja. Näin syöttökortille
 * jää enemmän tilaa ja kirjaaja näkee kenen tuloksia on syöttämässä. 44 px on yhä
 * suositeltu kosketuskohteen vähimmäiskoko.
 */
.nappain--toiminto {
  min-height: 44px;
  font-size: 0.95rem;
  font-weight: 600;
}
</style>
