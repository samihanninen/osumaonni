<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'
import { useRosteriStore } from '@/stores/rosteri'
import RosteriValinta from '@/components/RosteriValinta.vue'
import { kisanLajit, kisanSarjat, LUOKAT, LUOKKA_NIMET } from '@/core/lajit'
import type { RosteriHenkilo } from '@/core/rosteri'
import type { Kilpailija, LajiId, Luokka, SarjaId } from '@/types/kisa'

const store = useKisaStore()
const laite = useLaiteStore()
const rosteri = useRosteriStore()
const { kisa, yhdistysEhdotukset } = storeToRefs(store)

/** Kisan sarjat: RESUL-kisassa H ja H50, mukautetussa järjestäjän omat. */
const sarjat = computed(() => kisanSarjat(kisa.value))

const uusi = ref({ etunimi: '', sukunimi: '', yhdistys: '', ikasarja: '' as SarjaId })

/*
 * Lomakkeen sarjavalinta pidetään kelvollisena. Kisan muoto tai sarjalista voi vaihtua
 * kesken kaiken, ja tyhjä valinta tekisi kilpailijasta sarjattoman — hän ei näkyisi
 * missään sarjakohtaisessa tuloksessa.
 */
watchEffect(() => {
  if (!sarjat.value.includes(uusi.value.ikasarja)) {
    uusi.value.ikasarja = sarjat.value[0] ?? ''
  }
})
const virhe = ref('')
const poistoVahvistus = ref<string | null>(null)

/** Kisan lajit muodosta riippumatta: RESUL-kisassa RA1–RA4, mukautetussa omat lajit. */
const lajit = computed(() => kisanLajit(kisa.value))

/**
 * Lomakkeen lajivalinta: kaikki kisan lajit oletuksena.
 *
 * Kilpailija ilman lajeja ei näy missään syöttönäkymässä, joten aiemmin lisäys jäi
 * puolitiehen: nimi kirjattiin, ja lajit haettiin erikseen listasta rastittamalla.
 * Useimmiten osallistutaan kaikkeen, joten kaikki lajit ovat valmiiksi valittuina ja
 * poikkeukset otetaan pois.
 *
 * Valinta jää seuraavaa kilpailijaa varten, kuten yhdistys ja sarja: peräkkäiset
 * kilpailijat ampuvat usein samat lajit.
 */
const valitutLajit = ref<LajiId[]>([])

/**
 * Onko käyttäjä muuttanut lajivalintaa itse? Ennen sitä valinta seuraa kisan lajeja —
 * mukautetussa kisassa lajit voidaan määritellä vasta kilpailijoiden jälkeen. Sen
 * jälkeen sitä ei ylikirjoiteta: tyhjäksi jätetty valinta on käyttäjän päätös.
 */
const lajivalintaKoskettu = ref(false)

watchEffect(() => {
  const idt = lajit.value.map((l) => l.id)
  valitutLajit.value = lajivalintaKoskettu.value
    ? valitutLajit.value.filter((id) => idt.includes(id))
    : idt
})

/**
 * Tallennetaanko lisätty kilpailija myös rosteriin? Laitekohtainen valinta, joka
 * muistetaan — ks. `core/rosteri`.
 */
const rosteriin = computed({
  get: () => laite.tallennaRosteriin,
  set: (arvo: boolean) => laite.asetaTallennaRosteriin(arvo),
})

/** RESUL-kisassa sarjat ovat ikäsarjoja; mukautetussa ne eivät liity ikään. */
const sarjaOtsikko = computed(() => (kisa.value.tyyppi === 'resul' ? 'Ikäsarja' : 'Sarja'))

/**
 * Näyttöjärjestys sukunimen mukaan — mutta **ei kesken kirjoittamisen.**
 *
 * Nimikentät tallentavat joka näppäimenpainalluksella, jotta mitään ei jää tallentamatta
 * jos sovellus suljetaan kesken muokkauksen. Jos lista järjestettäisiin suoraan nimen
 * mukaan, rivi vaihtaisi paikkaa kirjaimen välissä: "Pertti Man" ja "Sanna M…" — M nostaa
 * Samin ensimmäiseksi ja kolmas kirjain pudottaa takaisin. Kohdistus seurasi liikkuvaa
 * riviä tai jäi väärään kenttään, eikä nimeä voinut kirjoittaa loppuun.
 *
 * Järjestys lasketaan siksi tunnisteiden listana, joka päivittyy vasta kun kilpailijoita
 * lisätään tai poistetaan tai kun nimikenttä menettää kohdistuksen.
 */
const jarjestys = ref<string[]>([])

function vertaaNimia(a: Kilpailija, b: Kilpailija): number {
  return a.sukunimi.localeCompare(b.sukunimi, 'fi') || a.etunimi.localeCompare(b.etunimi, 'fi')
}

function jarjestaUudelleen() {
  jarjestys.value = [...kisa.value.kilpailijat].sort(vertaaNimia).map((k) => k.id)
}

// Lisäys ja poisto muuttavat listaa; silloin järjestys saa muuttua.
watch(() => kisa.value.kilpailijat.map((k) => k.id).join(), jarjestaUudelleen, { immediate: true })

const kilpailijat = computed(() => {
  const indeksi = new Map(kisa.value.kilpailijat.map((k) => [k.id, k]))
  const jarjestetyt = jarjestys.value
    .map((id) => indeksi.get(id))
    .filter((k): k is Kilpailija => Boolean(k))
  // Turvaverkko: jos joku on jäänyt järjestyksen ulkopuolelle, se näkyy silti.
  const puuttuvat = kisa.value.kilpailijat.filter((k) => !jarjestys.value.includes(k.id))
  return [...jarjestetyt, ...puuttuvat]
})

function lisaa() {
  const sukunimi = uusi.value.sukunimi.trim()
  if (!sukunimi) {
    virhe.value = 'Sukunimi on pakollinen — sitä tarvitaan tasatulosten järjestämiseen.'
    return
  }
  virhe.value = ''
  const lisatty = store.lisaaKilpailija({ ...uusi.value, sukunimi, lajit: valitutLajit.value })
  if (rosteriin.value) rosteri.tallenna(lisatty)
  // Yhdistys ja ikäsarja jäävät, koska peräkkäiset kilpailijat ovat usein samasta seurasta.
  uusi.value.etunimi = ''
  uusi.value.sukunimi = ''
  document.getElementById('etunimi')?.focus()
}

function osallistuu(id: string, laji: LajiId): boolean {
  return Boolean(store.kilpailija(id)?.osallistumiset[laji])
}

function vaihdaOsallistuminen(id: string, laji: LajiId, mukana: boolean) {
  if (mukana) store.lisaaOsallistuminen(id, laji)
  else store.poistaOsallistuminen(id, laji)
}

function luokka(id: string, laji: LajiId): Luokka | '' {
  return store.kilpailija(id)?.osallistumiset[laji]?.luokka ?? ''
}

function poista(id: string) {
  store.poistaKilpailija(id)
  poistoVahvistus.value = null
}

/** Kilpailijan nimi yhtenä merkkijonona, rosterirastin saavutettavaa nimeä varten. */
function nimi(k: Kilpailija): string {
  return [k.etunimi, k.sukunimi]
    .map((osa) => osa.trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * Kilpailijaa vastaava rosterin rivi, jos hän on rosterissa.
 *
 * Tunniste ensin, nimi varatienä — sama järjestys kuin rosterin puolella
 * (`RosteriValinta`). Rosteriin tallennettu kilpailija pitää tunnisteensa, joten hänet
 * tunnistetaan senkin jälkeen kun nimeä on kisan puolella korjattu; nimiavain löytää
 * sen henkilön, joka oli rosterissa jo ennen tätä kisaa.
 */
function rosteririvi(k: Kilpailija): RosteriHenkilo | undefined {
  return rosteri.henkilo(k.id) ?? rosteri.etsiNimella(k)
}

/**
 * Lisää kilpailijan rosteriin tai ottaa hänet sieltä pois.
 *
 * Lisäyslomakkeen `Tallenna myös rosteriin` koskee vain juuri kirjattavaa kilpailijaa, ja
 * rosterikortin nappi tallentaa koko kisan kerralla. Väliin ei jäänyt mitään: listalla jo
 * olevaa yksittäistä kilpailijaa ei saanut rosteriin muuten kuin poistamalla ja
 * kirjaamalla hänet uudelleen.
 *
 * Poistoa ei vahvisteta, toisin kuin rosterikortilla. Siellä rasti veisi listan ainoan
 * kopion henkilöstä; tässä kaikki hänen tietonsa ovat samalla rivillä, joten rasti tuo
 * hänet takaisin sellaisenaan.
 */
function vaihdaRosteri(k: Kilpailija, mukaan: boolean) {
  if (mukaan) {
    rosteri.tallenna({
      id: k.id,
      etunimi: k.etunimi,
      sukunimi: k.sukunimi,
      yhdistys: k.yhdistys,
      ikasarja: k.ikasarja,
    })
    return
  }
  const rivi = rosteririvi(k)
  if (rivi) rosteri.poista(rivi.id)
}
</script>

<template>
  <section class="sivu">
    <h1>Kilpailijat</h1>
    <p>
      Kirjaa nimi, yhdistys ja lajit samalla kertaa — tai täppää sen päivän väki rosterista.
      Aseluokka valitaan lajikohtaisesti, koska se seuraa käytettyä asetta.
    </p>

    <RosteriValinta />

    <form class="kortti lisays" @submit.prevent="lisaa">
      <div class="kentat-rinnakkain">
        <div class="kentta">
          <label for="etunimi">Etunimi</label>
          <input id="etunimi" v-model="uusi.etunimi" type="text" autocomplete="off" />
        </div>
        <div class="kentta">
          <label for="sukunimi">Sukunimi</label>
          <!--
            Ei `required`-määritettä: selaimen oma tarkistus estäisi lähetyksen ja näyttäisi
            vain yleisluontoisen kuplan, jolloin oma viesti jäisi näkymättä. Tässä syy on
            olennainen tieto — sukunimeä tarvitaan tasatulosten järjestämiseen.
          -->
          <input
            id="sukunimi"
            v-model="uusi.sukunimi"
            type="text"
            autocomplete="off"
            aria-describedby="sukunimi-virhe"
          />
        </div>
        <div class="kentta">
          <label for="yhdistys">Yhdistys / ryhmä</label>
          <input
            id="yhdistys"
            v-model="uusi.yhdistys"
            type="text"
            list="yhdistyslista"
            autocomplete="off"
          />
          <datalist id="yhdistyslista">
            <option v-for="y in yhdistysEhdotukset" :key="y" :value="y"></option>
          </datalist>
          <span class="vihje">Valitse listalta, niin kirjoitusasu pysyy samana.</span>
        </div>
        <div class="kentta">
          <label for="ikasarja">{{ sarjaOtsikko }}</label>
          <select id="ikasarja" v-model="uusi.ikasarja">
            <option v-for="s in sarjat" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>

      <!--
        Lajit valitaan samalla kertaa nimen kanssa. Kaikki ovat oletuksena mukana, koska
        useimmiten osallistutaan kaikkeen — poikkeukset otetaan pois. Aseluokka ei ole
        tässä: se on lajikohtainen ja vaihtuu harvemmin kuin lajivalinta, ja neljä
        valitsinta lisää tekisi lomakkeesta hitaamman kuin listaan palaaminen.
      -->
      <fieldset v-if="lajit.length" class="lajit">
        <legend>Lajit</legend>
        <div class="lajilista">
          <label v-for="laji in lajit" :key="laji.id" class="valinta">
            <input
              v-model="valitutLajit"
              type="checkbox"
              :value="laji.id"
              @change="lajivalintaKoskettu = true"
            />
            <span :title="laji.nimi">{{ laji.koodi }}</span>
          </label>
        </div>
      </fieldset>

      <p v-if="virhe" id="sukunimi-virhe" class="huomio huomio--virhe" role="alert">
        {{ virhe }}
      </p>

      <div class="lisayksen-ala">
        <button type="submit" class="nappi nappi--ensisijainen">Lisää kilpailija</button>

        <!--
          Rosteriin tallennus on valinta eikä oletus: nimet ovat henkilötietoja, eikä
          sovellus jätä niitä laitteelle kisan jälkeen ilman että käyttäjä on niin
          valinnut. Valinta muistetaan laitteessa.
        -->
        <label class="valinta rosteriin">
          <input v-model="rosteriin" type="checkbox" />
          <span>Tallenna myös rosteriin</span>
        </label>
      </div>
    </form>

    <p v-if="kilpailijat.length === 0" class="tulossa">
      Ei vielä kilpailijoita. Lisää ensimmäinen yllä olevalla lomakkeella.
    </p>

    <template v-else>
      <h2 class="lkm">{{ kilpailijat.length }} kilpailijaa</h2>

      <ul class="lista">
        <li v-for="k in kilpailijat" :key="k.id" class="kortti rivi">
          <div class="rivi-yla">
            <div class="kentat-rinnakkain nimet">
              <div class="kentta">
                <label :for="`etu-${k.id}`">Etunimi</label>
                <input
                  :id="`etu-${k.id}`"
                  type="text"
                  :value="k.etunimi"
                  @input="
                    store.paivitaKilpailija(k.id, {
                      etunimi: ($event.target as HTMLInputElement).value,
                    })
                  "
                  @blur="jarjestaUudelleen"
                />
              </div>
              <div class="kentta">
                <label :for="`suku-${k.id}`">Sukunimi</label>
                <input
                  :id="`suku-${k.id}`"
                  type="text"
                  :value="k.sukunimi"
                  @input="
                    store.paivitaKilpailija(k.id, {
                      sukunimi: ($event.target as HTMLInputElement).value,
                    })
                  "
                  @blur="jarjestaUudelleen"
                />
              </div>
              <div class="kentta">
                <label :for="`yhd-${k.id}`">Yhdistys</label>
                <input
                  :id="`yhd-${k.id}`"
                  type="text"
                  list="yhdistyslista"
                  :value="k.yhdistys"
                  @input="
                    store.paivitaKilpailija(k.id, {
                      yhdistys: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </div>
              <div class="kentta">
                <label :for="`ika-${k.id}`">{{ sarjaOtsikko }}</label>
                <select
                  :id="`ika-${k.id}`"
                  :value="k.ikasarja"
                  @change="
                    store.paivitaKilpailija(k.id, {
                      ikasarja: ($event.target as HTMLSelectElement).value,
                    })
                  "
                >
                  <option v-for="s in sarjat" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
            </div>
          </div>

          <fieldset class="lajit">
            <legend>Lajit ja aseluokat</legend>
            <div class="lajilista">
              <div v-for="laji in lajit" :key="laji.id" class="laji">
                <label class="valinta">
                  <input
                    type="checkbox"
                    :checked="osallistuu(k.id, laji.id)"
                    @change="
                      vaihdaOsallistuminen(
                        k.id,
                        laji.id,
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  />
                  <span :title="laji.nimi">{{ laji.koodi }}</span>
                </label>
                <select
                  v-if="osallistuu(k.id, laji.id)"
                  :aria-label="`${laji.koodi}: aseluokka`"
                  :value="luokka(k.id, laji.id)"
                  @change="
                    store.asetaLuokka(
                      k.id,
                      laji.id,
                      ($event.target as HTMLSelectElement).value as Luokka,
                    )
                  "
                >
                  <option v-for="l in LUOKAT" :key="l" :value="l">{{ LUOKKA_NIMET[l] }}</option>
                </select>
              </div>
            </div>
          </fieldset>

          <div class="rivi-ala">
            <!--
              Rosterirasti näkyy vain kun sukunimi on kirjattu: ilman sukunimeä rosteri ei
              ota henkilöä vastaan, joten rasti kimpoaisi takaisin tyhjänä. Mieluummin ei
              ruutua kuin ruutu joka ei tottele.
            -->
            <label v-if="k.sukunimi.trim()" class="valinta rosterirasti">
              <input
                type="checkbox"
                :checked="Boolean(rosteririvi(k))"
                :aria-label="`${nimi(k)} rosterissa`"
                @change="vaihdaRosteri(k, ($event.target as HTMLInputElement).checked)"
              />
              <span>Rosterissa</span>
            </label>

            <button
              v-if="poistoVahvistus !== k.id"
              type="button"
              class="nappi poista"
              @click="poistoVahvistus = k.id"
            >
              Poista
            </button>
            <template v-else>
              <span class="varmistus">Poistetaanko myös kirjatut tulokset?</span>
              <button type="button" class="nappi poista-varma" @click="poista(k.id)">
                Kyllä, poista
              </button>
              <button type="button" class="nappi" @click="poistoVahvistus = null">Peruuta</button>
            </template>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.lisays {
  margin: 1rem 0 1.5rem;
}
.lkm {
  font-size: 1rem;
  color: var(--vari-teksti-himmea);
  margin: 1.25rem 0 0.5rem;
}
.lisayksen-ala {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}
.rosteriin {
  font-size: 0.9rem;
  color: var(--vari-teksti-himmea);
  font-weight: 400;
}
.lista {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.rivi {
  padding: 0.85rem 1rem 0.6rem;
}
.nimet .kentta {
  margin-bottom: 0.6rem;
}
@media (min-width: 900px) {
  .nimet {
    grid-template-columns: 1fr 1fr 1fr 6rem;
  }
}

.lajit {
  margin: 0.35rem 0 0.6rem;
  padding: 0.6rem 0.85rem 0.35rem;
}
/*
 * Ruudukko, ei rivittyvä lista.
 *
 * Aseluokkavalitsin ilmestyy vasta rastituksen myötä ja leventää kohdan noin
 * kaksinkertaiseksi. Rivittyvässä listassa se muutti sarakkeiden määrää: neljä lajia
 * mahtui puhelimessa yhdelle riville rastittamattomina, mutta jo yksi rasti pakotti ne
 * kahdelle. Osio kasvoi 52 pikseliä rastia kohti, lajit hyppäsivät riviltä toiselle ja
 * kaikki alapuolella liikkui mukana — myös se ruutu, jota oltiin seuraavaksi
 * napauttamassa. Kilpailijat kirjataan kiireessä listalta, joten väärän ruudun
 * osuminen on todellinen virhe eikä vain kauneusvirhe.
 *
 * Ruudukossa sarakkeiden määrä riippuu vain näytön leveydestä, joten rastitus ei
 * rivitä mitään uudelleen. 8rem on kapein leveys, johon lajin nimi ja aseluokkavalitsin
 * mahtuvat rinnakkain; sitä kapeammalla auto-fit pudottaa yhteen sarakkeeseen.
 */
.lajilista {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.15rem 0.6rem;
}
.laji {
  display: flex;
  align-items: center;
  /*
   * Valitsin heti lajin perään, ei sarakkeen toiseen laitaan. Lajitunnukset ovat
   * yhtä leveitä, joten valitsimet asettuvat silti samaan linjaan — mutta kumpi
   * valitsin kuuluu millekin lajille näkyy yhdellä silmäyksellä.
   */
  gap: 0.4rem;
  /*
   * Korkeus ei saa riippua siitä, onko laji rastittu. Valitsin (36px) mahtuu nimen
   * kosketuskohteen (44px) viereen, joten rivi pysyy samana kummassakin tilassa.
   */
  min-height: 44px;
}
.laji select {
  /* Kutistuu tarvittaessa mieluummin kuin työntää ruudukon reunojen yli. */
  flex: 0 1 auto;
  min-width: 0;
  width: auto;
  min-height: 36px;
  padding: 0.2rem 0.3rem;
  font-size: 0.9rem;
}
.valinta {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 0.35rem;
  /* Riittävän iso kosketuskohde */
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}
.valinta input {
  width: 1.15rem;
  height: 1.15rem;
}

.rivi-ala {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  border-top: 1px solid var(--vari-reuna);
  padding-top: 0.5rem;
}
.rosterirasti {
  font-size: 0.9rem;
  color: var(--vari-teksti-himmea);
  font-weight: 400;
}
/* Poisto rivin oikeaan laitaan, erilleen rosterirastista: eri vakavuus, eri suunta. */
.rivi-ala .poista {
  margin-inline-start: auto;
}
.poista,
.poista-varma {
  min-height: 38px;
  padding: 0.35rem 0.7rem;
  font-size: 0.9rem;
}
.poista-varma {
  border-color: var(--vari-virhe);
  color: var(--vari-virhe);
}
.varmistus {
  font-size: 0.9rem;
  color: var(--vari-virhe);
}
</style>
