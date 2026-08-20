<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useKisaStore } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'
import { kisanLajit } from '@/core/lajit'

const store = useKisaStore()
const laite = useLaiteStore()
const { kisa } = storeToRefs(store)

/**
 * Valikon linkit osoittavat viimeksi käytettyyn lajiin. Mukautetussa kisassa lajit
 * vaihtuvat, joten tuntematon tunniste korvataan kisan ensimmäisellä lajilla — muuten
 * linkki veisi lajiin jota kisassa ei ole.
 */
const laji = computed(() => {
  const lajit = kisanLajit(kisa.value)
  const viimeinen = laite.viimeinenLaji
  if (lajit.some((l) => l.id === viimeinen)) return viimeinen
  return lajit[0]?.id ?? ''
})

/** Onko kilpailijoita, eli voiko tuloksia jo kirjata? */
const voiKirjata = computed(() => store.kilpailijoita > 0)

/* Järjestys noudattaa kisan kulkua. Tulosten kirjaaminen on ensimmäisenä, koska se on
   se mitä sovelluksella pääasiassa tehdään. */
const osiot = computed(() => [
  {
    polku: `/syota/${laji.value}`,
    merkki: '🎯',
    otsikko: 'Syötä tulokset',
    kuvaus: voiKirjata.value
      ? 'Kirjaa laukaukset. Puhelimella käytössä on iso näppäimistö.'
      : 'Lisää ensin kilpailijoita, niin voit aloittaa kirjaamisen.',
    ensisijainen: true,
  },
  {
    polku: `/tulokset/${laji.value}`,
    merkki: '🏅',
    otsikko: 'Sijoitukset',
    kuvaus: 'Tulokset järjestyksessä luokittain ja ikäsarjoittain.',
  },
  {
    polku: '/kilpailijat',
    merkki: '👥',
    otsikko: 'Kilpailijat',
    kuvaus: 'Lisää kilpailijat, yhdistykset ja lajit joihin he osallistuvat.',
  },
  {
    polku: '/yhdistykset',
    merkki: '📊',
    otsikko: 'Yhdistyskilpailu',
    kuvaus: 'Yhdistysten tilanne lajeittain ja yhteistuloksena.',
  },
  {
    polku: '/yhdista',
    merkki: '🔗',
    otsikko: 'Yhdistä tulokset',
    kuvaus: 'Kerää usean kirjaajan tulokset yhdelle laitteelle.',
  },
  {
    polku: '/vienti',
    merkki: '💾',
    otsikko: 'Vienti ja tuonti',
    kuvaus: 'Tallenna tulokset Excel-tiedostoon tai lue ne takaisin.',
  },
  {
    polku: '/kisatiedot',
    merkki: '🏆',
    otsikko: 'Kisatiedot',
    kuvaus: 'Kisan nimi, paikka, vastuuhenkilöt ja kisan päättäminen.',
  },
  {
    polku: '/ohje',
    merkki: '📖',
    otsikko: 'Kilpailupäivän ohje',
    kuvaus: 'Lyhyt muistilista kisapäivälle. Luettavissa myös ilman verkkoyhteyttä.',
  },
])
</script>

<template>
  <section class="sivu">
    <h1>Reserviläisammunnan tuloskortti</h1>
    <p>Tulosten kirjaaminen ja laskenta suoraan selaimessa.</p>

    <p class="huomio huomio--varoitus tietosuoja">
      <strong>Tiedot tallentuvat vain tähän laitteeseen.</strong>
      Mitään ei lähetetä verkkoon. Vie tulokset tiedostoon säännöllisesti — selaimen tietojen
      tyhjentäminen poistaa kirjatut tulokset.
    </p>

    <nav class="osiot" aria-label="Sovelluksen osiot">
      <RouterLink
        v-for="osio in osiot"
        :key="osio.polku"
        :to="osio.polku"
        class="kortti osio"
        :class="{ 'osio--ensisijainen': osio.ensisijainen }"
      >
        <span class="osio-merkki" aria-hidden="true">{{ osio.merkki }}</span>
        <span class="osio-teksti">
          <strong>{{ osio.otsikko }}</strong>
          <small>{{ osio.kuvaus }}</small>
        </span>
      </RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.tietosuoja {
  margin: 1.25rem 0;
}

.osiot {
  display: grid;
  gap: 0.75rem;
}

.osio {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  color: var(--vari-teksti);
  text-decoration: none;
}
.osio:hover {
  border-color: var(--vari-korostus);
}

/* Kirjaaminen on sovelluksen pääasia: se erottuu ja vie koko rivin leveyden. */
.osio--ensisijainen {
  border-color: var(--vari-korostus);
  border-width: 2px;
  background: var(--vari-korostus-himmea);
}
@media (min-width: 640px) {
  .osio--ensisijainen {
    grid-column: 1 / -1;
  }
}

.osio-merkki {
  font-size: 1.5rem;
  line-height: 1.2;
}

.osio-teksti {
  display: flex;
  flex-direction: column;
}
.osio-teksti small {
  color: var(--vari-teksti-himmea);
}

@media (min-width: 640px) {
  .osiot {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}
</style>
