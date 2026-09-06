<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useKisaStore, varmuuskopioAvaimet } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'
import { ROSTERI_AVAIN, useRosteriStore } from '@/stores/rosteri'

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
const rosteri = useRosteriStore()

type Toiminto = 'tulokset' | 'uusi' | 'kaikki' | 'rosteri'
const vahvistettava = ref<Toiminto | null>(null)
const ilmoitus = ref('')

const viety = computed(() => {
  if (!laite.viimeinenVienti) return null
  const d = new Date(laite.viimeinenVienti)
  return Number.isNaN(d.getTime()) ? null : d
})

/*
 * Poistettavaa on myös silloin, kun kisa on tyhjä mutta rosterissa on nimiä: rosteri
 * säilyy kisojen yli, ja juuri siksi siitä pitää päästä eroon täältä.
 */
const onTietoja = computed(() => store.kilpailijoita > 0 || rosteri.maara > 0)

/** Onko tuloksia, joita ei ole viety tiedostoon? */
const viemattaJaljella = computed(() => store.kilpailijoita > 0 && viety.value === null)

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

/** Kirjattujen laukausten kokonaismäärä — kertoo mitä tyhjennys maksaisi. */
const kirjattuja = computed(() => {
  let n = 0
  for (const k of store.kisa.kilpailijat) {
    for (const o of Object.values(k.osallistumiset)) {
      for (const sarja of o?.kilpasarjat ?? []) {
        for (const laukaus of sarja.laukaukset) if (laukaus !== null) n++
      }
    }
  }
  return n
})

function tyhjennaTulokset() {
  store.tyhjennaTulokset()
  vahvistettava.value = null
  ilmoitus.value = 'Tulokset tyhjennetty. Kilpailijat ja lajivalinnat säilyivät.'
}

/*
 * Rosteri jää: se on koko ideansa mukaan lista, joka kestää kisan yli, jottei samaa
 * porukkaa tarvitse syöttää uudelleen. Vahvistus kertoo tämän, koska rosterissa on
 * nimiä — muuten sovellus lupaisi poistaneensa kilpailijat ja jättäisi ne silti.
 */
function aloitaUusiKisa() {
  store.aloitaUusi()
  laite.nollaaKisakohtaiset()
  // Varmuuskopiot sisältävät kilpailijoiden nimiä, joten ne poistuvat kisan mukana.
  tyhjennaTallennus(['kisa', ...varmuuskopioAvaimet()])
  vahvistettava.value = null
  ilmoitus.value = rosteri.maara
    ? `Kisan tiedot poistettu. Rosterin ${rosteri.maara} henkilöä jäivät laitteelle.`
    : 'Kisan tiedot poistettu. Voit aloittaa uuden kisan.'
}

/** Rosterin tyhjennys erikseen: kisa voi jatkua, vaikka nimilista poistetaan. */
function tyhjennaRosteri() {
  rosteri.tyhjenna()
  tyhjennaTallennus([ROSTERI_AVAIN])
  vahvistettava.value = null
  ilmoitus.value = 'Rosteri tyhjennetty. Kisan kilpailijat säilyivät.'
}

function poistaKaikki() {
  store.aloitaUusi()
  laite.nollaaLaite()
  // Myös rosteri: "kaikki tiedot" ei saa jättää nimilistaa lainatulle puhelimeen.
  rosteri.tyhjenna()
  tyhjennaTallennus(['kisa', 'laite', ROSTERI_AVAIN, ...varmuuskopioAvaimet()])
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
      <p v-if="store.kilpailijoita > 0" class="tilanne" :class="{ varoitus: viemattaJaljella }">
        <template v-if="viety">Tulokset viety tiedostoon {{ muotoile(viety) }}.</template>
        <template v-else>
          <strong>Tuloksia ei ole viety tiedostoon.</strong> Poistaminen hävittää ne lopullisesti.
        </template>
      </p>

      <p v-if="viemattaJaljella" class="vientilinkki">
        <RouterLink to="/vienti" class="nappi nappi--ensisijainen">Vie tulokset ensin</RouterLink>
      </p>

      <!--
        Tulosten tyhjennys: sama kilpailijalista ammutaan usein uudelleen — harjoituskierros,
        seuraava erä tai koeajo ennen oikeaa alkua. Ilman tätä ainoa tapa nollata tulokset
        olisi poistaa kilpailijat ja syöttää heidät takaisin.
      -->
      <div class="toiminto">
        <div class="kuvaus">
          <strong>Tyhjennä tulokset</strong>
          <small>
            Poistaa kirjatut laukaukset, rangaistukset ja hylkäykset. Kilpailijat, lajivalinnat ja
            kisatiedot säilyvät.
          </small>
        </div>
        <template v-if="vahvistettava !== 'tulokset'">
          <button type="button" class="nappi" @click="vahvistettava = 'tulokset'">
            Tyhjennä tulokset
          </button>
        </template>
        <template v-else>
          <p class="varmistus">
            Poistetaanko {{ kirjattuja }} kirjattua laukausta? Kilpailijat säilyvät. Tätä ei voi
            peruuttaa.
          </p>
          <div class="napit">
            <button type="button" class="nappi nappi--vaarallinen" @click="tyhjennaTulokset">
              Kyllä, tyhjennä tulokset
            </button>
            <button type="button" class="nappi" @click="vahvistettava = null">Peruuta</button>
          </div>
        </template>
      </div>

      <!-- Uusi kisa: laiteasetukset säilyvät, koska sama laite jatkaa käytössä. -->
      <div class="toiminto">
        <div class="kuvaus">
          <strong>Aloita uusi kisa</strong>
          <small>
            Poistaa kilpailijat ja tulokset. Laitteen asetukset, kuten syöttötapa, säilyvät — samoin
            rosteri, josta seuraavan kisan väki täpätään.
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
            <template v-if="rosteri.maara">
              Rosterin {{ rosteri.maara }} henkilöä jäävät laitteelle.
            </template>
          </p>
          <div class="napit">
            <button type="button" class="nappi nappi--vaarallinen" @click="aloitaUusiKisa">
              Kyllä, poista kisan tiedot
            </button>
            <button type="button" class="nappi" @click="vahvistettava = null">Peruuta</button>
          </div>
        </template>
      </div>

      <!--
        Rosteri erikseen: se säilyy kisojen yli, joten sen poistaminen on oma päätös eikä
        seuraus kisan päättämisestä. Nimet ovat henkilötietoja, joten tämä on paikka josta
        ne saa pois myös silloin, kun kisaa jatketaan.
      -->
      <div v-if="rosteri.maara" class="toiminto">
        <div class="kuvaus">
          <strong>Tyhjennä rosteri</strong>
          <small>
            Poistaa laitteelle jääneen henkilölistan. Kisan kilpailijat ja tulokset säilyvät.
          </small>
        </div>
        <template v-if="vahvistettava !== 'rosteri'">
          <button type="button" class="nappi" @click="vahvistettava = 'rosteri'">
            Tyhjennä rosteri
          </button>
        </template>
        <template v-else>
          <p class="varmistus">
            Poistetaanko rosterin {{ rosteri.maara }} henkilöä? Kisa säilyy. Tätä ei voi peruuttaa.
          </p>
          <div class="napit">
            <button type="button" class="nappi nappi--vaarallinen" @click="tyhjennaRosteri">
              Kyllä, tyhjennä rosteri
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
            Poistaa myös rosterin, laitteen nimen ja tunnisteen. Käytä tätä, kun laite ei jää
            sinulle — esimerkiksi lainattu puhelin.
          </small>
        </div>
        <template v-if="vahvistettava !== 'kaikki'">
          <button type="button" class="nappi" @click="vahvistettava = 'kaikki'">
            Poista kaikki tiedot
          </button>
        </template>
        <template v-else>
          <p class="varmistus">
            Poistetaanko kaikki tiedot, myös rosteri ja laitteen asetukset? Tätä ei voi peruuttaa.
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
