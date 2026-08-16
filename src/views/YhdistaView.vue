<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'
import { LAJI_KOODIT } from '@/core/lajit'
import { naytaLaukaus } from '@/core/laukaus'
import {
  PalojenKeraaja,
  SiirtoVirhe,
  paketoi,
  rakennaOsapaketti,
  rakennaTayspaketti,
  type Siirtopaketti,
} from '@/io/siirto'
import {
  kuvaaPaketti,
  laskeVersio,
  yhdista,
  type Ristiriita,
  type RistiriidanValinta,
} from '@/core/yhdistaminen'
import { lataaTiedosto, lueTiedosto } from '@/io/lataa'
import { jaaTiedosto, jakoKaytettavissa, luoTiedosto } from '@/io/jaa'
import QrKoodi from '@/components/QrKoodi.vue'
import QrLukija from '@/components/QrLukija.vue'
import type { Laji } from '@/types/kisa'

const route = useRoute()
const store = useKisaStore()
const laite = useLaiteStore()
const { kisa } = storeToRefs(store)

type Nakyma = 'laheta' | 'vastaanota'
const nakyma = ref<Nakyma>('laheta')

const virhe = ref('')
const ilmoitus = ref('')

// ---------- Lähettäminen ----------

type Sisalto = 'taysi' | 'osa'
const sisalto = ref<Sisalto>('osa')
const valitutLajit = ref<Laji[]>([])
const palat = ref<string[]>([])
const palaIndeksi = ref(0)

const laheteValmis = computed(() => palat.value.length > 0)
const nykyinenPala = computed(() => palat.value[palaIndeksi.value] ?? '')

/** Jakolinkki. Data kulkee osoitteen hash-osassa, joten se ei päädy palvelimen lokeihin. */
const jakolinkki = computed(() => {
  if (palat.value.length !== 1) return ''
  const perusta = `${window.location.origin}${window.location.pathname}`
  return `${perusta}#/yhdista?d=${encodeURIComponent(palat.value[0] ?? '')}`
})

function tunnisteet() {
  return {
    laiteId: laite.laiteId,
    laiteNimi: laite.laiteNimi || undefined,
    versio: laskeVersio(kisa.value),
    aika: new Date().toISOString(),
  }
}

function luoLahete() {
  virhe.value = ''
  ilmoitus.value = ''
  try {
    const paketti =
      sisalto.value === 'taysi'
        ? rakennaTayspaketti(kisa.value, tunnisteet())
        : rakennaOsapaketti(
            kisa.value,
            tunnisteet(),
            valitutLajit.value.length > 0 ? { lajit: valitutLajit.value } : {},
          )
    palat.value = paketoi(paketti)
    palaIndeksi.value = 0
  } catch (e) {
    virhe.value = e instanceof Error ? e.message : 'Lähetteen luonti epäonnistui.'
  }
}

async function kopioiLinkki() {
  try {
    await navigator.clipboard.writeText(jakolinkki.value)
    ilmoitus.value = 'Linkki kopioitu leikepöydälle.'
  } catch {
    virhe.value = 'Linkin kopiointi ei onnistunut. Voit valita ja kopioida sen käsin.'
  }
}

function lataaKoodiTiedostona() {
  const sisaltoTeksti = palat.value.join('\n')
  const tavut = new TextEncoder().encode(sisaltoTeksti)
  lataaTiedosto(tavut.buffer as ArrayBuffer, 'osumaonni-tulokset.txt', 'text/plain')
  ilmoitus.value = 'Tiedosto ladattu. Voit lähettää sen esimerkiksi WhatsAppilla.'
}

const voiJakaa = jakoKaytettavissa()

async function jaaKoodi() {
  const tavut = new TextEncoder().encode(palat.value.join('\n'))
  const tiedosto = luoTiedosto(tavut.buffer as ArrayBuffer, 'osumaonni-tulokset.txt', 'text/plain')
  const tulos = await jaaTiedosto(tiedosto, {
    otsikko: 'OsumaOnni — tulokset',
    teksti: 'Tulosten siirtotiedosto',
  })
  if (tulos !== 'jaettu' && tulos !== 'peruutettu') lataaKoodiTiedostona()
}

function luovuta() {
  laite.merkitseLuovutetuksi()
  ilmoitus.value =
    'Laite on merkitty luovutetuksi. Syöttö on lukittu, jottei sama kisa haaraudu kahdelle laitteelle.'
}

// ---------- Vastaanottaminen ----------

const keraaja = new PalojenKeraaja()
const keraysTila = ref({ luettu: 0, maara: 0 })
const saapuva = ref<Siirtopaketti | null>(null)
const liitettyTeksti = ref('')
const lukija = useTemplateRef<InstanceType<typeof QrLukija>>('lukija')

const yhteenveto = computed(() => (saapuva.value ? kuvaaPaketti(saapuva.value, kisa.value) : null))

const ristiriidat = ref<Ristiriita[]>([])
const valinnat = ref(new Map<string, RistiriidanValinta>())
const esikatselu = ref<{
  lisatyt: number
  paivitetyt: number
  samat: number
  vanhempi: boolean
} | null>(null)

function kasitteleKoodi(teksti: string) {
  virhe.value = ''
  try {
    const tila = keraaja.lisaa(teksti)
    keraysTila.value = { luettu: tila.luettu, maara: tila.maara }
    if (tila.valmis) {
      saapuva.value = keraaja.pura()
      lukija.value?.pysayta?.()
      laskeEsikatselu()
    } else {
      // Sallitaan seuraavan osan lukeminen samalla kameralla.
      lukija.value?.nollaaViimeisin?.()
    }
  } catch (e) {
    virhe.value = e instanceof Error ? e.message : 'Koodia ei voitu lukea.'
  }
}

function liitaTeksti() {
  const teksti = liitettyTeksti.value.trim()
  if (!teksti) return
  // Sallitaan sekä pelkkä koodi, jakolinkki että monta riviä.
  const rivit = teksti
    .split(/\s+/)
    .map((r) => (r.includes('d=') ? decodeURIComponent(r.slice(r.indexOf('d=') + 2)) : r))
    .filter(Boolean)
  for (const rivi of rivit) kasitteleKoodi(rivi)
  liitettyTeksti.value = ''
}

async function avaaTiedosto(e: Event) {
  const kentta = e.target as HTMLInputElement
  const tiedosto = kentta.files?.[0]
  if (!tiedosto) return
  try {
    const teksti = new TextDecoder().decode(await lueTiedosto(tiedosto))
    liitettyTeksti.value = teksti
    liitaTeksti()
  } catch {
    virhe.value = 'Tiedostoa ei voitu lukea.'
  } finally {
    kentta.value = ''
  }
}

/** Käyttäjä on hyväksynyt eri kisasta yhdistämisen. */
const salliEriKisa = ref(false)

function laskeEsikatselu() {
  const paketti = saapuva.value
  if (!paketti) return
  virhe.value = ''
  try {
    const tulos = yhdista(kisa.value, paketti, {
      valinnat: valinnat.value,
      salliEriKisa: salliEriKisa.value,
    })
    ristiriidat.value = tulos.ristiriidat
    esikatselu.value = {
      lisatyt: tulos.lisatytKilpailijat.length,
      paivitetyt: tulos.paivitetytSarjat,
      samat: tulos.samatSarjat,
      vanhempi: tulos.vanhempiVersio,
    }
  } catch (e) {
    virhe.value = e instanceof Error ? e.message : 'Yhdistäminen ei onnistunut.'
    ristiriidat.value = []
    esikatselu.value = null
    /*
     * Yhdistämisvirheessä paketti säilytetään: käyttäjän on nähtävä mistä paketista on
     * kyse ja voitava valita ohitus. Vain purkuvirheessä ei ole mitään näytettävää.
     */
    if (e instanceof SiirtoVirhe) saapuva.value = null
  }
}

function valitse(avain: string, valinta: RistiriidanValinta) {
  valinnat.value.set(avain, valinta)
  valinnat.value = new Map(valinnat.value)
  laskeEsikatselu()
}

function valitseKaikki(valinta: RistiriidanValinta) {
  for (const r of ristiriidat.value) valinnat.value.set(r.avain, valinta)
  valinnat.value = new Map(valinnat.value)
  laskeEsikatselu()
}

const kaikkiRatkaistu = computed(() => ristiriidat.value.length === 0)

/**
 * Vahvistaminen on mahdollista vasta kun esikatselu on laskettu onnistuneesti eikä
 * ratkaisemattomia ristiriitoja ole. Ilman esikatselua painike näyttäisi toimivalta,
 * mutta tuottaisi vain saman virheen uudelleen.
 */
const voiVahvistaa = computed(() => esikatselu.value !== null && kaikkiRatkaistu.value)

function vahvista() {
  const paketti = saapuva.value
  if (!paketti) return
  try {
    const tulos = yhdista(kisa.value, paketti, {
      valinnat: valinnat.value,
      salliEriKisa: salliEriKisa.value,
    })
    store.korvaaKisa(tulos.kisa)
    ilmoitus.value =
      paketti.tyyppi === 'taysi'
        ? 'Kisa vastaanotettu. Voit jatkaa kirjaamista tältä laitteelta.'
        : `Tulokset yhdistetty: ${tulos.paivitetytSarjat} sarjaa päivittyi, ` +
          `${tulos.lisatytKilpailijat.length} kilpailijaa lisättiin.`
    // Vastaanottava laite jatkaa kirjaamista, joten lukitus puretaan.
    if (paketti.tyyppi === 'taysi') laite.jatkaSilti()
    tyhjennaVastaanotto()
  } catch (e) {
    virhe.value = e instanceof Error ? e.message : 'Yhdistäminen ei onnistunut.'
  }
}

/** Käyttäjä hyväksyy eri kisasta yhdistämisen ja laskenta tehdään uudelleen. */
function hyvaksyEriKisa() {
  salliEriKisa.value = true
  laskeEsikatselu()
}

function tyhjennaVastaanotto() {
  salliEriKisa.value = false
  keraaja.tyhjenna()
  keraysTila.value = { luettu: 0, maara: 0 }
  saapuva.value = null
  ristiriidat.value = []
  valinnat.value = new Map()
  esikatselu.value = null
}

/** Jakolinkistä saapuva data luetaan suoraan osoitteesta. */
onMounted(() => {
  const d = route.query.d
  const data = Array.isArray(d) ? d[0] : d
  if (typeof data === 'string' && data) {
    nakyma.value = 'vastaanota'
    kasitteleKoodi(data)
  }
})

function laukauksetTekstina(laukaukset: (number | '*' | '-' | null)[]): string {
  return laukaukset.map(naytaLaukaus).join(' ')
}
</script>

<template>
  <section class="sivu">
    <h1>Yhdistä tulokset</h1>
    <p>
      Usean kirjaajan tulokset saa koottua yhdelle laitteelle. Siirto tapahtuu QR-koodilla, linkillä
      tai tiedostolla — omaa palvelinta ei ole missään näistä.
    </p>

    <div class="valilehdet" role="tablist">
      <button
        type="button"
        role="tab"
        class="valilehti"
        :class="{ 'valilehti--valittu': nakyma === 'laheta' }"
        :aria-selected="nakyma === 'laheta'"
        @click="nakyma = 'laheta'"
      >
        Lähetä
      </button>
      <button
        type="button"
        role="tab"
        class="valilehti"
        :class="{ 'valilehti--valittu': nakyma === 'vastaanota' }"
        :aria-selected="nakyma === 'vastaanota'"
        @click="nakyma = 'vastaanota'"
      >
        Vastaanota
      </button>
    </div>

    <p v-if="virhe" class="huomio huomio--virhe">{{ virhe }}</p>
    <p v-if="ilmoitus" class="huomio ilmoitus">{{ ilmoitus }}</p>

    <!-- ============ LÄHETÄ ============ -->
    <template v-if="nakyma === 'laheta'">
      <section class="kortti lohko">
        <h2>Mitä lähetetään</h2>

        <p class="ero">
          Ero on siinä, <strong>mitä vastaanottajalle tapahtuu</strong>: koko kisa korvaa hänen
          tietonsa, vain tulokset sulautetaan niihin.
        </p>

        <label class="valinta">
          <input v-model="sisalto" type="radio" value="taysi" @change="palat = []" />
          <span>
            <strong>Koko kisa — aloita tästä</strong>
            <small>
              Kilpailijat, asetukset ja tulokset. Vastaanottajan tiedot
              <strong>korvataan kokonaan</strong>, ja hänen laitteelleen tulee sama kisa kuin
              sinulla.
              <br />
              Käytä tätä kun annat kisan seuraavalle kirjaajalle, ja aina ensimmäisenä kun otat
              toisen laitteen mukaan.
            </small>
          </span>
        </label>

        <label class="valinta">
          <input v-model="sisalto" type="radio" value="osa" @change="palat = []" />
          <span>
            <strong>Vain tulokset</strong>
            <small>
              Pelkät laukaukset, ei kilpailijoita eikä asetuksia. Vastaanottajan omat kirjaukset
              <strong>säilyvät</strong> ja tulokset yhdistetään niihin.
              <br />
              Käytä tätä kun useampi kirjaa yhtä aikaa —
              <strong>edellyttää, että molemmilla on sama kisa</strong> eli koko kisa on lähetetty
              ensin.
            </small>
          </span>
        </label>

        <fieldset v-if="sisalto === 'osa'" class="lajit">
          <legend>Rajaa lajeihin (valinnainen)</legend>
          <label v-for="laji in LAJI_KOODIT" :key="laji" class="lajivalinta">
            <input v-model="valitutLajit" type="checkbox" :value="laji" @change="palat = []" />
            <span>{{ laji }}</span>
          </label>
          <p class="vihje">Ilman valintaa lähetetään kaikki lajit.</p>
        </fieldset>

        <button
          type="button"
          class="nappi nappi--ensisijainen"
          :disabled="store.kilpailijoita === 0"
          @click="luoLahete"
        >
          Luo siirtokoodi
        </button>
        <p v-if="store.kilpailijoita === 0" class="vihje">Ei vielä kilpailijoita lähetettäväksi.</p>
      </section>

      <section v-if="laheteValmis" class="kortti lohko">
        <h2>QR-koodi</h2>
        <p v-if="palat.length > 1" class="vihje">
          Tulokset on jaettu <strong>{{ palat.length }} osaan</strong>. Yksi iso koodi olisi
          puhelimelle vaikea lukea, joten näytä osat vuorotellen — vastaanottaja voi lukea ne missä
          järjestyksessä tahansa, ja sovellus kertoo mitä vielä puuttuu.
        </p>

        <QrKoodi :teksti="nykyinenPala" />

        <div v-if="palat.length > 1" class="palanavigointi">
          <button type="button" class="nappi" :disabled="palaIndeksi === 0" @click="palaIndeksi--">
            ‹ Edellinen
          </button>
          <span class="palalaskuri">Osa {{ palaIndeksi + 1 }} / {{ palat.length }}</span>
          <button
            type="button"
            class="nappi"
            :disabled="palaIndeksi >= palat.length - 1"
            @click="palaIndeksi++"
          >
            Seuraava ›
          </button>
        </div>

        <h3>Muut tavat</h3>
        <div class="napit">
          <button v-if="jakolinkki" type="button" class="nappi" @click="kopioiLinkki">
            Kopioi jakolinkki
          </button>
          <button v-if="voiJakaa" type="button" class="nappi" @click="jaaKoodi">
            Jaa tiedostona
          </button>
          <button type="button" class="nappi" @click="lataaKoodiTiedostona">Lataa tiedosto</button>
        </div>
        <p class="vihje">
          <template v-if="jakolinkki">
            Linkin voi lähettää millä tahansa viestisovelluksella.
          </template>
          <template v-else>
            Tulokset eivät mahdu yhteen linkkiin, joten käytä QR-koodia tai tiedostoa.
          </template>
          <strong>QR-koodi on ainoa tapa, jossa tiedot eivät poistu paikalta.</strong>
        </p>

        <template v-if="sisalto === 'taysi'">
          <h3>Luovutus</h3>
          <p class="vihje">
            Kun vastaanottaja on lukenut koodin, merkitse tämä laite luovutetuksi. Silloin sama kisa
            ei jatku vahingossa kahdella laitteella eri suuntiin.
          </p>
          <button type="button" class="nappi" :disabled="laite.luovutettu" @click="luovuta">
            {{ laite.luovutettu ? 'Merkitty luovutetuksi' : 'Merkitse luovutetuksi' }}
          </button>
        </template>
      </section>
    </template>

    <!-- ============ VASTAANOTA ============ -->
    <template v-else>
      <section v-if="!saapuva" class="kortti lohko">
        <h2>Lue QR-koodi</h2>
        <QrLukija ref="lukija" @luettu="kasitteleKoodi" />

        <p v-if="keraysTila.maara > 1" class="huomio ilmoitus">
          Luettu {{ keraysTila.luettu }} / {{ keraysTila.maara }} osaa. Näytä seuraava koodi.
        </p>

        <h3>Tai liitä koodi tai linkki</h3>
        <textarea
          v-model="liitettyTeksti"
          rows="3"
          placeholder="Liitä tähän saamasi koodi tai linkki"
        ></textarea>
        <div class="napit">
          <button
            type="button"
            class="nappi"
            :disabled="!liitettyTeksti.trim()"
            @click="liitaTeksti"
          >
            Lue liitetty koodi
          </button>
        </div>

        <h3>Tai avaa tiedosto</h3>
        <input type="file" accept=".txt,text/plain" @change="avaaTiedosto" />
      </section>

      <section v-else class="kortti lohko">
        <h2>Tarkista ennen yhdistämistä</h2>

        <dl v-if="yhteenveto" class="tiedot">
          <div>
            <dt>Lähettäjä</dt>
            <dd>{{ yhteenveto.laiteNimi }}</dd>
          </div>
          <div>
            <dt>Sisältö</dt>
            <dd>{{ yhteenveto.tyyppi === 'taysi' ? 'Koko kisa' : 'Tulokset' }}</dd>
          </div>
          <div>
            <dt>Kilpailijoita</dt>
            <dd>{{ yhteenveto.kilpailijoita }}</dd>
          </div>
          <div>
            <dt>Lajit</dt>
            <dd>{{ yhteenveto.lajit.join(', ') || '—' }}</dd>
          </div>
        </dl>

        <div v-if="yhteenveto?.eriKisa && saapuva.tyyppi === 'osa'" class="huomio huomio--varoitus">
          <p>
            <strong>Koodi kuuluu eri kisaan.</strong>
            Näin käy, kun molemmille laitteille on perustettu oma kisa. Suositeltu tapa on lähettää
            ensin <em>koko kisa</em> toiselle laitteelle, jolloin molemmilla on sama kisa ja
            kilpailijat vastaavat toisiaan.
          </p>
          <p v-if="!salliEriKisa" class="ohitus">
            Voit myös yhdistää silti: kilpailijat tunnistetaan silloin nimen ja yhdistyksen
            perusteella, ja eri tavalla kirjoitetut nimet päätyvät eri kilpailijoiksi.
          </p>
          <button v-if="!salliEriKisa" type="button" class="nappi" @click="hyvaksyEriKisa">
            Yhdistä silti
          </button>
          <p v-else class="ohitus">
            <strong>Yhdistetään nimien perusteella.</strong> Tarkista tulos yhdistämisen jälkeen.
          </p>
        </div>

        <p v-if="esikatselu?.vanhempi" class="huomio huomio--varoitus">
          <strong
            >Saapuvassa kisassa on vähemmän kirjattuja laukauksia kuin tässä laitteessa.</strong
          >
          Se voi olla vanhempi tilanne — jatkaminen korvaisi uudemmat tulokset.
        </p>

        <p v-if="saapuva.tyyppi === 'taysi'" class="huomio huomio--varoitus">
          Koko kisa korvaa tämän laitteen tiedot ({{ store.kilpailijoita }} kilpailijaa). Toimintoa
          ei voi peruuttaa.
        </p>
        <p v-else-if="esikatselu" class="yhteenvetoteksti">
          {{ esikatselu.paivitetyt }} kilpasarjaa saa uutta tietoa, {{ esikatselu.samat }} on jo
          samanlaisia, {{ esikatselu.lisatyt }} uutta kilpailijaa.
        </p>

        <!-- Ristiriidat: käyttäjä päättää, mitään ei korvata huomaamatta. -->
        <template v-if="ristiriidat.length > 0">
          <h3>Ristiriidat ({{ ristiriidat.length }})</h3>
          <p class="vihje">
            Molemmat laitteet ovat kirjanneet saman kilpasarjan eri tavalla. Valitse kumpi jää
            voimaan. Mitään ei korvata ennen vahvistusta.
          </p>

          <div class="napit">
            <button type="button" class="nappi" @click="valitseKaikki('oma')">Kaikki omat</button>
            <button type="button" class="nappi" @click="valitseKaikki('saapuva')">
              Kaikki saapuvat
            </button>
          </div>

          <ul class="ristiriidat">
            <li v-for="r in ristiriidat" :key="r.avain" class="ristiriita">
              <p class="ristiriita-otsikko">
                <strong>{{ r.nimi }}</strong>
                <span class="ristiriita-paikka"
                  >{{ r.laji }} · kilpasarja {{ r.kilpasarja + 1 }}</span
                >
              </p>
              <div class="vaihtoehdot">
                <button
                  type="button"
                  class="vaihtoehto"
                  :class="{ 'vaihtoehto--valittu': valinnat.get(r.avain) === 'oma' }"
                  @click="valitse(r.avain, 'oma')"
                >
                  <span class="vaihtoehto-nimi">Tämä laite</span>
                  <span class="vaihtoehto-laukaukset">{{ laukauksetTekstina(r.oma) }}</span>
                  <span class="vaihtoehto-pisteet">{{ r.omaPisteet }} p</span>
                </button>
                <button
                  type="button"
                  class="vaihtoehto"
                  :class="{ 'vaihtoehto--valittu': valinnat.get(r.avain) === 'saapuva' }"
                  @click="valitse(r.avain, 'saapuva')"
                >
                  <span class="vaihtoehto-nimi">{{ yhteenveto?.laiteNimi }}</span>
                  <span class="vaihtoehto-laukaukset">{{ laukauksetTekstina(r.saapuva) }}</span>
                  <span class="vaihtoehto-pisteet">{{ r.saapuvaPisteet }} p</span>
                </button>
              </div>
            </li>
          </ul>
        </template>

        <div class="napit vahvistus">
          <button
            type="button"
            class="nappi nappi--ensisijainen"
            :disabled="!voiVahvistaa"
            @click="vahvista"
          >
            {{ saapuva.tyyppi === 'taysi' ? 'Korvaa tiedot' : 'Yhdistä tulokset' }}
          </button>
          <button type="button" class="nappi" @click="tyhjennaVastaanotto">Peruuta</button>
        </div>
        <p v-if="!kaikkiRatkaistu" class="vihje">Ratkaise ensin kaikki ristiriidat.</p>
      </section>
    </template>

    <p class="paluu">
      <RouterLink to="/vienti">Tulosten vienti Exceliin</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.valilehdet {
  display: flex;
  gap: 0.25rem;
  margin: 1rem 0;
}
.valilehti {
  flex: 1 1 0;
  min-height: 44px;
  padding: 0.5rem 1rem;
  font: inherit;
  font-weight: 600;
  border: 1px solid var(--vari-reuna);
  border-radius: var(--reunapyoristys);
  background: var(--vari-tausta-korotettu);
  color: var(--vari-teksti-himmea);
  cursor: pointer;
}
.valilehti--valittu {
  background: var(--vari-korostus);
  border-color: var(--vari-korostus);
  color: #fff;
}

.lohko {
  margin-bottom: 1.25rem;
}
h2 {
  font-size: 1.05rem;
  margin-bottom: 0.5rem;
}
h3 {
  font-size: 0.95rem;
  margin: 1rem 0 0.4rem;
}
.ilmoitus {
  background: var(--vari-korostus-himmea);
  border-color: var(--vari-korostus);
  color: var(--vari-korostus);
}

.valinta {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.5rem 0;
  cursor: pointer;
}
.valinta input {
  margin-top: 0.35rem;
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
}
.valinta small {
  display: block;
  color: var(--vari-teksti-himmea);
  font-size: 0.85rem;
}
.ero {
  font-size: 0.9rem;
  margin-bottom: 0.6rem;
}
.ohitus {
  margin: 0.5rem 0;
  font-size: 0.85rem;
}

.lajit {
  margin: 0.5rem 0 1rem;
  padding: 0.6rem 0.85rem 0.3rem;
}
.lajivalinta {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 44px;
  margin-right: 1rem;
  cursor: pointer;
}

.palanavigointi {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.6rem;
}
.palalaskuri {
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  color: var(--vari-teksti-himmea);
}

.napit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.vahvistus {
  margin-top: 1rem;
}
.vihje {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
  margin-top: 0.4rem;
}

.tiedot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin-bottom: 0.75rem;
}
.tiedot dt {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--vari-teksti-himmea);
}
.tiedot dd {
  font-size: 1.05rem;
  font-weight: 700;
}
.yhteenvetoteksti {
  font-size: 0.9rem;
  margin: 0.5rem 0;
}

.ristiriidat {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.ristiriita {
  border: 1px solid var(--vari-varoitus);
  border-radius: var(--reunapyoristys);
  padding: 0.6rem 0.75rem;
  background: var(--vari-varoitus-tausta);
}
.ristiriita-otsikko {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  margin-bottom: 0.5rem;
}
.ristiriita-paikka {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
}
.vaihtoehdot {
  display: grid;
  gap: 0.5rem;
}
@media (min-width: 560px) {
  .vaihtoehdot {
    grid-template-columns: 1fr 1fr;
  }
}
.vaihtoehto {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.5rem 0.6rem;
  text-align: left;
  font: inherit;
  border: 2px solid var(--vari-reuna);
  border-radius: var(--reunapyoristys);
  background: var(--vari-tausta-korotettu);
  color: var(--vari-teksti);
  cursor: pointer;
}
.vaihtoehto--valittu {
  border-color: var(--vari-korostus);
  background: var(--vari-korostus-himmea);
}
.vaihtoehto-nimi {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--vari-teksti-himmea);
}
.vaihtoehto-laukaukset {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}
.vaihtoehto-pisteet {
  font-weight: 700;
}

.paluu {
  margin-top: 1.5rem;
  font-size: 0.9rem;
}
</style>
