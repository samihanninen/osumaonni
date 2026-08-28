<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'
import { kisanLajit, rakenteenLaukaukset } from '@/core/lajit'
import { laskeLaji } from '@/core/laskenta'
import type { LajiId, Laukaus, Luokka } from '@/types/kisa'
import LaukausNappaimisto from '@/components/LaukausNappaimisto.vue'
import KilpailijaKortti from '@/components/KilpailijaKortti.vue'
import TuloskorttiTaulukko from '@/components/TuloskorttiTaulukko.vue'

const route = useRoute()
const store = useKisaStore()
const laite = useLaiteStore()
const { kisa } = storeToRefs(store)

/** Kisan lajit muodosta riippumatta. Välilehdet ja reitin tarkistus nojaavat tähän. */
const lajit = computed(() => kisanLajit(kisa.value))

/** Reitin laji, tai kisan ensimmäinen jos reitissä on tuntematon tunniste. */
const laji = computed<LajiId>(() => {
  const p = route.params.laji
  const arvo = Array.isArray(p) ? p[0] : p
  if (typeof arvo === 'string' && lajit.value.some((l) => l.id === arvo)) return arvo
  return lajit.value[0]?.id ?? ''
})

const rakenne = computed(() => lajit.value.find((l) => l.id === laji.value))

/**
 * Rakenne yhtenä rivinä. Tasamittaiset sarjat esitetään kertolaskuna kuten ennenkin —
 * se kertoo enemmän kuin pelkkä summa — ja eri mittaiset luetellaan.
 */
const rakenneTeksti = computed(() => {
  const r = rakenne.value
  if (!r) return ''
  const pituudet = r.kilpasarjat.map((s) => s.laukauksia)
  const tasaiset = pituudet.every((p) => p === pituudet[0])
  if (tasaiset) return `${pituudet.length} × ${pituudet[0]} laukausta`
  return `${pituudet.join(' + ')} laukausta`
})

/** Lajin osallistujat sukunimen mukaan — sama järjestys kuin muissa listoissa. */
const osallistujat = computed(() =>
  kisa.value.kilpailijat
    .filter((k) => k.osallistumiset[laji.value])
    .sort(
      (a, b) =>
        a.sukunimi.localeCompare(b.sukunimi, 'fi') || a.etunimi.localeCompare(b.etunimi, 'fi'),
    ),
)

/**
 * Taulukkosyöttö käytössä?
 *
 * Oletus on kosketusnäppäimistö kaikilla laitteilla, myös työpöydällä. Aiemmin
 * työpöytä sai automaattisesti taulukon, mutta numeroiden näppäileminen on hitaampaa
 * kuin isojen painikkeiden napauttaminen — eikä kannettavissa yleensä ole
 * numeronäppäimistöä lainkaan. Taulukko on edelleen valittavissa, koska se on
 * ylivoimainen silloin kun tuloksia korjataan jälkikäteen useammalta riviltä.
 */
const taulukossa = computed(() => laite.syottotapa === 'taulukko')

// ---------- Näppäimistösyötön tila ----------

const kohdistus = ref(0)
const aktiivinenSarja = ref(0)
const aktiivinenLaukaus = ref(0)

const nykyinen = computed(() => osallistujat.value[kohdistus.value])

/** Etsii ensimmäisen tyhjän laukauksen, jotta syöttö jatkuu luontevasti. */
function siirryEnsimmaiseenTyhjaan() {
  const o = nykyinen.value?.osallistumiset[laji.value]
  if (!o) return
  for (let s = 0; s < o.kilpasarjat.length; s++) {
    const laukaukset = o.kilpasarjat[s]?.laukaukset ?? []
    const i = laukaukset.findIndex((l) => l === null)
    if (i >= 0) {
      aktiivinenSarja.value = s
      aktiivinenLaukaus.value = i
      return
    }
  }
  // Kaikki täynnä: jää viimeiseen ruutuun.
  const viimeinen = o.kilpasarjat.length - 1
  aktiivinenSarja.value = Math.max(0, viimeinen)
  aktiivinenLaukaus.value = Math.max(0, (o.kilpasarjat[viimeinen]?.laukaukset.length ?? 1) - 1)
}

// Pidä kohdistus rajoissa, kun laji tai osallistujalista vaihtuu.
watch([laji, () => osallistujat.value.length], () => {
  kohdistus.value = Math.min(kohdistus.value, Math.max(0, osallistujat.value.length - 1))
  siirryEnsimmaiseenTyhjaan()
})

// Muistetaan laji, jotta valikon linkit palaavat siihen mitä oltiin kirjaamassa.
watch(laji, (uusi) => laite.asetaViimeinenLaji(uusi), { immediate: true })

function valitseRuutu(sarja: number, laukaus: number) {
  aktiivinenSarja.value = sarja
  aktiivinenLaukaus.value = laukaus
}

/** Siirtää seuraavaan ruutuun; sarjan lopussa seuraavan sarjan alkuun. */
function seuraavaRuutu() {
  const o = nykyinen.value?.osallistumiset[laji.value]
  const sarja = o?.kilpasarjat[aktiivinenSarja.value]
  if (!o || !sarja) return

  if (aktiivinenLaukaus.value + 1 < sarja.laukaukset.length) {
    aktiivinenLaukaus.value++
  } else if (aktiivinenSarja.value + 1 < o.kilpasarjat.length) {
    aktiivinenSarja.value++
    aktiivinenLaukaus.value = 0
  }
}

function syotaNappaimistolla(arvo: Laukaus) {
  const k = nykyinen.value
  if (!k) return
  store.asetaLaukaus(k.id, laji.value, aktiivinenSarja.value, aktiivinenLaukaus.value, arvo)
  seuraavaRuutu()
}

/** Tyhjentää aktiivisen ruudun; jos se on jo tyhjä, siirtyy edelliseen ja tyhjentää sen. */
function peruuta() {
  const k = nykyinen.value
  const o = k?.osallistumiset[laji.value]
  if (!k || !o) return

  const nyt = o.kilpasarjat[aktiivinenSarja.value]?.laukaukset[aktiivinenLaukaus.value]
  if (nyt === null && (aktiivinenLaukaus.value > 0 || aktiivinenSarja.value > 0)) {
    if (aktiivinenLaukaus.value > 0) {
      aktiivinenLaukaus.value--
    } else {
      aktiivinenSarja.value--
      aktiivinenLaukaus.value = (o.kilpasarjat[aktiivinenSarja.value]?.laukaukset.length ?? 1) - 1
    }
  }
  store.asetaLaukaus(k.id, laji.value, aktiivinenSarja.value, aktiivinenLaukaus.value, null)
}

function vaihdaKilpailija(suunta: 1 | -1) {
  const uusi = kohdistus.value + suunta
  if (uusi < 0 || uusi >= osallistujat.value.length) return
  kohdistus.value = uusi
  siirryEnsimmaiseenTyhjaan()
}

/** Siirtyy suoraan haluttuun kilpailijaan valitsimesta. */
function siirryKilpailijaan(indeksi: number) {
  if (indeksi < 0 || indeksi >= osallistujat.value.length) return
  kohdistus.value = indeksi
  siirryEnsimmaiseenTyhjaan()
}

/** Lyhyt tilatieto valitsimeen: valmis, kesken vai tyhjä. */
function tila(k: (typeof osallistujat.value)[number]): string {
  const o = k.osallistumiset[laji.value]
  if (!o) return '—'
  const tulos = laskeLaji(laji.value, rakenne.value ?? { tulosSaanto: 'summa' }, o)
  if (tulos.valmis) return `valmis ${tulos.pisteet}`
  if (tulos.aloitettu) {
    const syotetty = tulos.sarjat.reduce((s, x) => s + x.syotetty, 0)
    const kaikki = rakenne.value ? rakenteenLaukaukset(rakenne.value) : 0
    return `${syotetty}/${kaikki}`
  }
  return 'tyhjä'
}

// ---------- Taulukkosyötön käsittelijät ----------

function taulukkoSyota(id: string, sarja: number, laukaus: number, arvo: Laukaus) {
  store.asetaLaukaus(id, laji.value, sarja, laukaus, arvo)
}
function taulukkoLuokka(id: string, luokka: Luokka) {
  store.asetaLuokka(id, laji.value, luokka)
}
function taulukkoRangaistukset(id: string, maara: number) {
  store.asetaRangaistukset(id, laji.value, maara)
}
function taulukkoHylatty(id: string, hylatty: boolean) {
  store.asetaHylatty(id, laji.value, hylatty)
}
</script>

<template>
  <section class="sivu">
    <header class="ylaosa">
      <!--
        Otsikko piilotetaan kapealla näytöllä näkyvistä mutta säilytetään ruudunlukijalle:
        valikossa on jo korostettuna "Syötä tulokset", ja jokainen säästetty pystypikseli
        näyttää kirjaajalle enemmän siitä kortista, jota hän on täyttämässä.
      -->
      <h1 class="otsikko">Tulosten syöttö</h1>

      <nav class="lajivalinta" aria-label="Laji">
        <RouterLink
          v-for="l in lajit"
          :key="l.id"
          :to="{ name: 'syotto', params: { laji: l.id } }"
          class="lajinappi"
          :class="{ 'lajinappi--valittu': l.id === laji }"
          :title="l.nimi"
        >
          {{ l.koodi }}
          <small>{{ store.osallistujia(l.id) }}</small>
        </RouterLink>
      </nav>
    </header>

    <!-- Mukautetussa kisassa lajit voi olla määrittelemättä; silloin ei ole mitään syötettävää. -->
    <p v-if="!rakenne" class="tulossa">
      Kisassa ei ole vielä lajeja.
      <RouterLink to="/kisatiedot">Määrittele lajit kisatiedoissa</RouterLink>.
    </p>

    <template v-else>
      <p class="lajitiedot">
        {{ rakenneTeksti }}
        <span class="erotin" aria-hidden="true">·</span>
        {{ rakenne.tulosSaanto === 'paras' ? 'parempi sarja' : 'sarjojen summa' }}
      </p>

      <p v-if="laite.luovutettu" class="huomio huomio--varoitus">
        <strong>Tämä laite on luovuttanut kisan eteenpäin.</strong>
        Syöttö on lukittu, jottei sama kisa haaraudu kahdelle laitteelle.
        <button type="button" class="nappi jatka" @click="laite.jatkaSilti()">Jatka silti</button>
      </p>

      <p v-if="osallistujat.length === 0" class="tulossa">
        Yksikään kilpailija ei osallistu lajiin {{ laji }}.
        <RouterLink to="/kilpailijat">Lisää osallistujia</RouterLink>.
      </p>

      <template v-else>
        <!--
        Syöttötapa on laitekohtainen asetus, joka valitaan kerran — ei jokaisen
        kilpailijan kohdalla. Se on siksi taitettuna, jotta pystytila jää kortille.
      -->
        <details class="tapavalinta">
          <summary class="tapa-otsikko">
            Syöttötapa: {{ taulukossa ? 'taulukko' : 'näppäimistö' }}
          </summary>
          <!--
            Kaksi vaihtoehtoa, ei kolmea: "automaattinen" tarkoitti työpöydällä taulukkoa,
            mutta oletus on nyt näppäimistö kaikkialla, joten valinta ei enää eroaisi
            näppäimistöstä mitenkään.
          -->
          <div class="valintapalkki tapanapit" role="group" aria-label="Syöttötapa">
            <button
              type="button"
              class="valintapalkki-osa"
              :class="{ 'valintapalkki-osa--valittu': !taulukossa }"
              :aria-pressed="!taulukossa"
              @click="laite.asetaSyottotapa('nappaimisto')"
            >
              Näppäimistö
            </button>
            <button
              type="button"
              class="valintapalkki-osa"
              :class="{ 'valintapalkki-osa--valittu': taulukossa }"
              :aria-pressed="taulukossa"
              @click="laite.asetaSyottotapa('taulukko')"
            >
              Taulukko
            </button>
          </div>
        </details>

        <!-- Taulukkosyöttö: oikea näppäimistö ja hiiri -->
        <TuloskorttiTaulukko
          v-if="taulukossa"
          :kilpailijat="osallistujat"
          :laji="laji"
          :rakenne="rakenne"
          :lukittu="laite.luovutettu"
          @syota="taulukkoSyota"
          @luokka="taulukkoLuokka"
          @rangaistukset="taulukkoRangaistukset"
          @hylatty="taulukkoHylatty"
        />

        <!-- Kosketussyöttö: laitteen omaa näppäimistöä ei avata lainkaan -->
        <template v-else-if="nykyinen">
          <!--
          Suora siirtyminen kilpailijaan. Virheen korjaaminen jälkikäteen olisi muuten
          kymmenien napautusten päässä, jos kirjaaja on jo edennyt listalla eteenpäin.
        -->
          <div class="valitsin">
            <label class="valitsin-label" for="kilpailijavalinta">Kilpailija</label>
            <select
              id="kilpailijavalinta"
              :value="kohdistus"
              @change="siirryKilpailijaan(Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="(k, i) in osallistujat" :key="k.id" :value="i">
                {{ i + 1 }}. {{ k.sukunimi }}, {{ k.etunimi }} — {{ tila(k) }}
              </option>
            </select>
            <span class="laskuri">{{ kohdistus + 1 }} / {{ osallistujat.length }}</span>
          </div>

          <KilpailijaKortti
            :kilpailija="nykyinen"
            :laji="laji"
            :rakenne="rakenne"
            :aktiivinen-sarja="aktiivinenSarja"
            :aktiivinen-laukaus="aktiivinenLaukaus"
            @valitse="valitseRuutu"
          />

          <LaukausNappaimisto
            class="nappaimisto-alue"
            :lukittu="laite.luovutettu"
            @syota="syotaNappaimistolla"
            @peruuta="peruuta"
            @seuraava="vaihdaKilpailija(1)"
            @edellinen="vaihdaKilpailija(-1)"
          />

          <details class="lisatiedot">
            <summary>Sääntörikkeet ja hylkäys</summary>
            <div class="lisakentat">
              <div class="kentta">
                <label :for="`rike-${nykyinen.id}`">Sääntörikkeitä (−2 p / kerta)</label>
                <input
                  :id="`rike-${nykyinen.id}`"
                  type="number"
                  min="0"
                  max="20"
                  :disabled="laite.luovutettu"
                  :value="nykyinen.osallistumiset[laji]?.rangaistuksia ?? 0"
                  @change="
                    store.asetaRangaistukset(
                      nykyinen.id,
                      laji,
                      Number(($event.target as HTMLInputElement).value),
                    )
                  "
                />
              </div>
              <label class="valinta">
                <input
                  type="checkbox"
                  :disabled="laite.luovutettu"
                  :checked="nykyinen.osallistumiset[laji]?.hylatty ?? false"
                  @change="
                    store.asetaHylatty(
                      nykyinen.id,
                      laji,
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                />
                <span>Hylätty (turvallisuusrike) — tulos mitätöidään</span>
              </label>
            </div>
          </details>
        </template>
      </template>
    </template>
  </section>
</template>

<style scoped>
.ylaosa {
  margin-bottom: 0.4rem;
}

/* Kapealla näytöllä otsikko vain ruudunlukijalle: valikko kertoo jo missä ollaan. */
@media (max-width: 599px) {
  .otsikko {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

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
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  min-height: 44px;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--vari-reuna);
  border-radius: var(--reunapyoristys);
  background: var(--vari-tausta-korotettu);
  color: var(--vari-teksti);
  text-decoration: none;
  font-weight: 700;
}
.lajinappi small {
  font-weight: 400;
  font-size: 0.78rem;
  color: var(--vari-teksti-himmea);
}
.lajinappi--valittu {
  background: var(--vari-korostus);
  border-color: var(--vari-korostus);
  color: #fff;
}
.lajinappi--valittu small {
  color: rgb(255 255 255 / 80%);
}

.lajitiedot {
  font-size: 0.82rem;
  color: var(--vari-teksti-himmea);
  margin-bottom: 0.5rem;
}
.erotin {
  margin: 0 0.35rem;
}

.jatka {
  margin-left: 0.5rem;
  min-height: 36px;
  padding: 0.25rem 0.6rem;
  font-size: 0.85rem;
}

.tapavalinta {
  margin-bottom: 0.6rem;
}
.tapa-otsikko {
  cursor: pointer;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--vari-teksti-himmea);
}
.tapanapit {
  margin-top: 0.4rem;
  max-width: 22rem;
}

.valitsin {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.valitsin-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--vari-teksti-himmea);
  flex: 0 0 auto;
}
.valitsin select {
  /* flex-basis 0 estää valitun vaihtoehdon tekstin pituuden vaikuttamisen leveyteen,
     jottei rivi levene edistymistekstin kasvaessa ja siirrä alla olevaa sisältöä. */
  flex: 1 1 0;
  min-width: 0;
}
.laskuri {
  /* Kiinteä leveys ja tasavälinen numerointi: "1 / 2" ja "10 / 22" eivät siirrä mitään. */
  flex: 0 0 4.5rem;
  text-align: right;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--vari-teksti-himmea);
}
/*
 * Näppäimistö kiinnitetään näytön alalaitaan.
 *
 * Kahdesta syystä. Ergonomia: näppäimet ovat peukalon ulottuvilla eikä niitä tarvitse
 * etsiä vierittämällä. Ennen kaikkea kuitenkin turvallisuus: sen yläpuolella oleva
 * sisältö muuttuu kirjaamisen aikana (edistymisteksti, kasvavat lukemat, ajastimeen
 * perustuva vientimuistutus). Ilman kiinnitystä näppäimet liikkuisivat kesken nopeaa
 * syöttöä sormen alla, ja väärä napautus tarkoittaisi väärää tulosta.
 */
.nappaimisto-alue {
  position: sticky;
  bottom: 0;
  z-index: 4;
  margin: 0.85rem 0 0;
  padding: 0.6rem 0 0.5rem;
  background: var(--vari-tausta);
  border-top: 1px solid var(--vari-reuna);
}

.lisatiedot {
  margin-top: 0.5rem;
}
.lisatiedot summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  color: var(--vari-teksti-himmea);
}
.lisakentat {
  padding: 0.5rem 0 0;
  max-width: 26rem;
}
.valinta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  font-size: 0.9rem;
  cursor: pointer;
}
.valinta input {
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
}
</style>
