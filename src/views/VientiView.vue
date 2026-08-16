<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'
import { lataaTiedosto, lueTiedosto } from '@/io/lataa'
import { jaaTiedosto, jakoKaytettavissa, luoTiedosto, luonnosTeksti, mailtoOsoite } from '@/io/jaa'
import { LAJI_KOODIT } from '@/core/lajit'
import type { TuontiYhteenveto } from '@/io/xlsxTuonti'

const store = useKisaStore()
const laite = useLaiteStore()
const { kisa } = storeToRefs(store)

const vienninTila = ref<'valmis' | 'kesken'>('valmis')
const virhe = ref('')
const ilmoitus = ref('')

const tuonnissa = ref(false)
const esikatselu = ref<TuontiYhteenveto | null>(null)
const tiedostoKentta = ref<HTMLInputElement | null>(null)

const viimeinenVienti = computed(() => {
  if (!laite.viimeinenVienti) return null
  const d = new Date(laite.viimeinenVienti)
  return Number.isNaN(d.getTime()) ? null : d
})

const vientiIkaTunteina = computed(() => {
  const v = viimeinenVienti.value
  if (!v) return null
  return (Date.now() - v.getTime()) / 3_600_000
})

function muotoileAika(d: Date): string {
  return d.toLocaleString('fi-FI', { dateStyle: 'short', timeStyle: 'short' })
}

async function vie() {
  virhe.value = ''
  ilmoitus.value = ''
  vienninTila.value = 'kesken'
  try {
    // ExcelJS ladataan vasta tässä, jottei se hidasta sovelluksen käynnistystä.
    const { vieKisa } = await import('@/io/xlsxVienti')
    const nyt = new Date()
    const { tavut, tiedostonimi } = await vieKisa(kisa.value, nyt)
    lataaTiedosto(tavut, tiedostonimi)
    laite.merkitseVienti(nyt.toISOString())
    ilmoitus.value = `Tiedosto ${tiedostonimi} ladattu.`
  } catch (e) {
    virhe.value = e instanceof Error ? e.message : 'Vienti ei onnistunut.'
  } finally {
    vienninTila.value = 'valmis'
  }
}

/** Näytetäänkö jakopainike? Käytännössä tosi puhelimissa, epätosi työpöydällä. */
const voiJakaa = jakoKaytettavissa()

/**
 * Valmiiksi rakennettu tiedosto jakamista varten.
 *
 * TÄRKEÄÄ: `navigator.share` vaatii **tuoreen käyttäjän eleen**. Jos painalluksen jälkeen
 * ensin odotetaan ExcelJS:n latausta ja työkirjan luontia, ele ehtii vanhentua ja selain
 * estää jaon — jolloin jakovalikko ei aukea lainkaan, vaikka tiedosto syntyy. Siksi
 * tiedosto rakennetaan valmiiksi taustalla, ja painallus kutsuu jakoa välittömästi ilman
 * yhtään `await`ia sitä ennen.
 */
const jaettava = shallowRef<{ tiedosto: File; tavut: ArrayBuffer; nimi: string } | null>(null)
const valmistellaan = ref(false)

async function valmisteleJaettava() {
  if (!voiJakaa || store.kilpailijoita === 0) {
    jaettava.value = null
    return
  }
  valmistellaan.value = true
  try {
    const { vieKisa } = await import('@/io/xlsxVienti')
    const { tavut, tiedostonimi } = await vieKisa(kisa.value, new Date())
    jaettava.value = {
      tiedosto: luoTiedosto(tavut, tiedostonimi),
      tavut,
      nimi: tiedostonimi,
    }
  } catch {
    // Epäonnistunut esivalmistelu ei ole virhe käyttäjälle: latauspainike toimii yhä.
    jaettava.value = null
  } finally {
    valmistellaan.value = false
  }
}

/** Rakennetaan uudelleen, kun tulokset muuttuvat, jottei jaettava tiedosto vanhene. */
let ajastin: ReturnType<typeof setTimeout> | undefined
watch(
  () => JSON.stringify(kisa.value),
  () => {
    clearTimeout(ajastin)
    ajastin = setTimeout(() => void valmisteleJaettava(), 800)
  },
)

onMounted(() => void valmisteleJaettava())
onBeforeUnmount(() => clearTimeout(ajastin))

/**
 * Avaa laitteen jakovalikon. Ei `await`ia ennen `navigator.share`-kutsua, jotta
 * käyttäjän ele on yhä voimassa.
 */
function jaa() {
  virhe.value = ''
  ilmoitus.value = ''

  const valmis = jaettava.value
  if (!valmis) {
    // Tiedostoa ei ehditty rakentaa: ladataan sen sijaan, jottei painallus jää tyhjäksi.
    void vie()
    return
  }

  const luonnos = luonnosTeksti({
    kisanNimi: kisa.value.kisatiedot.nimi,
    pvm: kisa.value.kisatiedot.pvm,
    tiedostonimi: valmis.nimi,
    kilpailijoita: store.kilpailijoita,
  })

  void jaaTiedosto(valmis.tiedosto, {
    otsikko: luonnos.aihe,
    teksti: `${kisa.value.kisatiedot.nimi || 'Reserviläisammunta'} — tulokset`,
  }).then((tulos) => {
    if (tulos === 'jaettu') {
      laite.merkitseVienti(new Date().toISOString())
      ilmoitus.value = 'Tiedosto jaettu.'
      return
    }
    if (tulos === 'peruutettu') {
      ilmoitus.value = 'Jakaminen peruutettiin. Tiedostoa ei viety.'
      return
    }
    lataaTiedosto(valmis.tavut, valmis.nimi)
    laite.merkitseVienti(new Date().toISOString())
    ilmoitus.value =
      tulos === 'estetty'
        ? `Selain esti jakamisen, joten tiedosto ${valmis.nimi} ladattiin sen sijaan.`
        : `Jakaminen ei ole tuettu tällä laitteella. Tiedosto ${valmis.nimi} ladattiin.`
  })
}

/** Avaa sähköpostiluonnoksen. Liite on lisättävä käsin — selain ei voi tehdä sitä. */
function avaaSahkoposti() {
  const luonnos = luonnosTeksti({
    kisanNimi: kisa.value.kisatiedot.nimi,
    pvm: kisa.value.kisatiedot.pvm,
    tiedostonimi: 'ladattu Excel-tiedosto',
    kilpailijoita: store.kilpailijoita,
  })
  window.location.href = mailtoOsoite(luonnos)
}

async function valitseTiedosto(e: Event) {
  const kentta = e.target as HTMLInputElement
  const tiedosto = kentta.files?.[0]
  if (!tiedosto) return

  virhe.value = ''
  ilmoitus.value = ''
  esikatselu.value = null
  tuonnissa.value = true

  try {
    const { tuoKisa } = await import('@/io/xlsxTuonti')
    const tavut = await lueTiedosto(tiedosto)
    esikatselu.value = await tuoKisa(tavut)
  } catch (e) {
    virhe.value = e instanceof Error ? e.message : 'Tiedostoa ei voitu lukea.'
  } finally {
    tuonnissa.value = false
    // Tyhjennetään kenttä, jotta saman tiedoston voi valita uudelleen.
    kentta.value = ''
  }
}

function vahvistaTuonti() {
  const e = esikatselu.value
  if (!e) return
  store.korvaaKisa(e.kisa)
  esikatselu.value = null
  ilmoitus.value = `Tulokset tuotu: ${e.kilpailijoita} kilpailijaa.`
}

function peruutaTuonti() {
  esikatselu.value = null
}

const eriKisa = computed(
  () => esikatselu.value !== null && esikatselu.value.kisaId !== kisa.value.kisaId,
)
</script>

<template>
  <section class="sivu">
    <h1>Vienti ja tuonti</h1>
    <p>
      Tulokset tallentuvat vain tähän laitteeseen. Vie ne tiedostoon säännöllisesti, niin virheet
      voi korjata jälkikäteen myös silloin, kun selaimen muisti on tyhjentynyt.
    </p>

    <p v-if="virhe" class="huomio huomio--virhe">{{ virhe }}</p>
    <p v-if="ilmoitus" class="huomio ilmoitus">{{ ilmoitus }}</p>

    <section class="lohko kortti">
      <h2>Vie Excel-tiedostoon</h2>
      <p class="selite">
        Tiedosto sisältää muokattavat tuloskortit aidoin Excel-kaavoin: kun korjaat laukauksen,
        summat ja kilpailutulos laskeutuvat uudelleen.
      </p>

      <dl class="tiedot">
        <div>
          <dt>Kilpailijoita</dt>
          <dd>{{ store.kilpailijoita }}</dd>
        </div>
        <div v-for="laji in LAJI_KOODIT" :key="laji">
          <dt>{{ laji }}</dt>
          <dd>{{ store.osallistujia(laji) }}</dd>
        </div>
      </dl>

      <p v-if="viimeinenVienti" class="viimeksi" :class="{ vanha: (vientiIkaTunteina ?? 0) > 1 }">
        Viimeksi viety {{ muotoileAika(viimeinenVienti) }}
      </p>
      <p v-else class="viimeksi vanha">Tuloksia ei ole vielä viety tiedostoon.</p>

      <div class="napit">
        <button
          v-if="voiJakaa"
          type="button"
          class="nappi nappi--ensisijainen"
          :disabled="valmistellaan || store.kilpailijoita === 0"
          @click="jaa"
        >
          {{ valmistellaan ? 'Valmistellaan…' : 'Jaa Excel-tiedosto' }}
        </button>
        <button
          type="button"
          class="nappi"
          :class="{ 'nappi--ensisijainen': !voiJakaa }"
          :disabled="vienninTila === 'kesken' || store.kilpailijoita === 0"
          @click="vie"
        >
          {{ vienninTila === 'kesken' ? 'Viedään…' : 'Lataa tiedosto' }}
        </button>
      </div>

      <p v-if="store.kilpailijoita === 0" class="vihje">
        Lisää ensin kilpailijoita, niin vienti aktivoituu.
      </p>

      <p v-if="voiJakaa" class="vihje jakovihje">
        <strong>Jaa Excel-tiedosto</strong> avaa puhelimen oman jakovalikon, josta tiedoston voi
        lähettää suoraan sähköpostilla, WhatsAppilla tai muulla valitsemallasi tavalla — aitona
        liitetiedostona. Jos laite ei tue jakamista, tiedosto ladataan sen sijaan.
      </p>
      <details v-else class="sahkoposti">
        <summary>Lähettäminen sähköpostilla</summary>
        <p class="vihje">
          Tällä laitteella tiedosto pitää liittää viestiin itse: selaimen
          <code>mailto:</code>-linkki ei voi sisältää liitettä. Lataa tiedosto ensin, avaa sitten
          valmis luonnos ja liitä ladattu tiedosto siihen.
        </p>
        <button type="button" class="nappi" @click="avaaSahkoposti">Avaa sähköpostiluonnos</button>
      </details>
    </section>

    <section class="lohko kortti">
      <h2>Tuo Excel-tiedostosta</h2>
      <p class="selite">
        Tuonti lukee <strong>vain nimet ja laukaukset</strong> tuloskortti-välilehdiltä ja laskee
        kaiken muun uudelleen. Näin käsin tehdyt korjaukset menevät varmasti läpi.
      </p>

      <label class="tiedostovalinta">
        <input
          ref="tiedostoKentta"
          type="file"
          accept=".xlsx"
          :disabled="tuonnissa"
          @change="valitseTiedosto"
        />
      </label>
      <p v-if="tuonnissa" class="vihje">Luetaan tiedostoa…</p>

      <div v-if="esikatselu" class="esikatselu">
        <h3>Tarkista ennen tuontia</h3>

        <p v-if="eriKisa" class="huomio huomio--varoitus">
          Tiedoston kisatunnus on eri kuin nykyisen kisan. Onko tämä oikea tiedosto?
        </p>

        <dl class="tiedot">
          <div>
            <dt>Kisan nimi</dt>
            <dd>{{ esikatselu.kisa.kisatiedot.nimi || '—' }}</dd>
          </div>
          <div>
            <dt>Kilpailijoita</dt>
            <dd>{{ esikatselu.kilpailijoita }}</dd>
          </div>
          <div v-for="laji in LAJI_KOODIT" :key="laji">
            <dt>{{ laji }}</dt>
            <dd>{{ esikatselu.osallistumiset[laji] }}</dd>
          </div>
        </dl>

        <p class="huomio huomio--varoitus">
          Tuonti <strong>korvaa</strong> tällä laitteella olevat tulokset ({{ store.kilpailijoita }}
          kilpailijaa). Toimintoa ei voi peruuttaa.
        </p>

        <div class="napit">
          <button type="button" class="nappi nappi--ensisijainen" @click="vahvistaTuonti">
            Korvaa tulokset
          </button>
          <button type="button" class="nappi" @click="peruutaTuonti">Peruuta</button>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.lohko {
  margin: 1.25rem 0;
}
h2 {
  font-size: 1.05rem;
  margin-bottom: 0.35rem;
}
h3 {
  font-size: 0.95rem;
  margin: 0.85rem 0 0.35rem;
}
.selite {
  font-size: 0.88rem;
  color: var(--vari-teksti-himmea);
  margin-bottom: 0.75rem;
}
.ilmoitus {
  background: var(--vari-korostus-himmea);
  border-color: var(--vari-korostus);
  color: var(--vari-korostus);
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
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.viimeksi {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
  margin-bottom: 0.6rem;
}
.viimeksi.vanha {
  color: var(--vari-varoitus);
  font-weight: 600;
}

.tiedostovalinta input {
  font-size: 0.9rem;
  padding: 0.4rem;
  min-height: 44px;
}

.esikatselu {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--vari-reuna);
}
.napit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.vihje {
  font-size: 0.85rem;
  color: var(--vari-teksti-himmea);
}
</style>
