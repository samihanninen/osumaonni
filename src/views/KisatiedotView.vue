<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useKisaStore } from '@/stores/kisa'
import { LAJI_KOODIT, laukauksiaYhteensa, suurinTulos } from '@/core/lajit'
import { onJoukkuekilpailu } from '@/core/yhdistykset'
import KisanPaattaminen from '@/components/KisanPaattaminen.vue'
import MukautetutLajit from '@/components/MukautetutLajit.vue'
import MukautetutSarjat from '@/components/MukautetutSarjat.vue'
import type { KisaTyyppi, Laji, TulosSaanto } from '@/types/kisa'

const store = useKisaStore()
const { kisa } = storeToRefs(store)

const MUODOT: { arvo: KisaTyyppi; nimi: string }[] = [
  { arvo: 'resul', nimi: 'RESUL (RA1–RA4)' },
  { arvo: 'mukautettu', nimi: 'Mukautettu kisa' },
]

const muodonVaihto = ref<KisaTyyppi | null>(null)

/** Kirjattujen laukausten määrä koko kisassa. Kertoo mitä muodon vaihto maksaisi. */
const kirjattuja = computed(() => {
  let n = 0
  for (const k of kisa.value.kilpailijat) {
    for (const o of Object.values(k.osallistumiset)) {
      for (const sarja of o?.kilpasarjat ?? []) {
        for (const laukaus of sarja.laukaukset) if (laukaus !== null) n++
      }
    }
  }
  return n
})

/** Tyhjässä kisassa muodon voi vaihtaa suoraan; muuten se on peruuttamaton menetys. */
function vaihdaMuoto(tyyppi: KisaTyyppi) {
  if (tyyppi === kisa.value.tyyppi) return
  const onMitaanMenetettavaa = kisa.value.kilpailijat.some(
    (k) => Object.keys(k.osallistumiset).length > 0,
  )
  if (!onMitaanMenetettavaa) {
    store.asetaKisaTyyppi(tyyppi)
    return
  }
  muodonVaihto.value = tyyppi
}

function vahvistaMuoto() {
  if (!muodonVaihto.value) return
  store.asetaKisaTyyppi(muodonVaihto.value)
  muodonVaihto.value = null
}

const tiedot = computed(() => kisa.value.kisatiedot)
const asetukset = computed(() => kisa.value.asetukset)

const tulosSaannot: { arvo: TulosSaanto; nimi: string }[] = [
  { arvo: 'paras', nimi: 'Parempi sarja huomioidaan' },
  { arvo: 'summa', nimi: 'Sarjojen summa' },
]

function paivitaRakenne(laji: Laji, kentta: 'kilpasarjoja' | 'laukauksiaSarjassa', arvo: string) {
  const luku = Math.max(1, Math.trunc(Number(arvo) || 1))
  store.asetaLajiMaaritys(laji, { [kentta]: luku })
}

function paivitaSaanto(laji: Laji, arvo: string) {
  store.asetaLajiMaaritys(laji, { tulosSaanto: arvo as TulosSaanto })
}
</script>

<template>
  <section class="sivu">
    <h1>Kisatiedot</h1>
    <p>Täytä kisan perustiedot. Ne eivät vaikuta laskentaan, vaan näkyvät tuloslistoissa.</p>

    <fieldset>
      <legend>Kisan muoto</legend>
      <p class="vihje">
        RESUL-kisassa lajit ja säännöt ovat virallisia eikä niitä voi lisätä tai poistaa.
        Mukautetussa kisassa määrittelet lajit itse — esimerkiksi kolmen asennon kisan tai oman
        kilpailun. Kisa on aina yhtä muotoa.
      </p>
      <div class="muodot" role="group" aria-label="Kisan muoto">
        <button
          v-for="m in MUODOT"
          :key="m.arvo"
          type="button"
          class="pikkunappi"
          :class="{ 'pikkunappi--valittu': kisa.tyyppi === m.arvo }"
          @click="vaihdaMuoto(m.arvo)"
        >
          {{ m.nimi }}
        </button>
      </div>

      <!--
        Muodon vaihto tulkitsee kirjatut tulokset uudelleen: lajit tulevat eri paikasta,
        joten vanhat osallistumiset jäisivät osoittamaan lajeihin joita kisassa ei ole.
      -->
      <p v-if="muodonVaihto" class="varmistus" role="alert">
        <strong>Vaihdetaanko kisan muoto?</strong>
        Kisassa on {{ store.kilpailijoita }} kilpailijaa ja {{ kirjattuja }} kirjattua laukausta.
        Muodon vaihto poistaa kaikki osallistumiset ja tulokset — kilpailijat säilyvät. Tätä ei voi
        peruuttaa.
        <span class="napit">
          <button type="button" class="pikkunappi vaarallinen" @click="vahvistaMuoto">
            Kyllä, vaihda muoto
          </button>
          <button type="button" class="pikkunappi" @click="muodonVaihto = null">Peruuta</button>
        </span>
      </p>
    </fieldset>

    <template v-if="kisa.tyyppi === 'mukautettu'">
      <MukautetutSarjat />
      <MukautetutLajit />
    </template>

    <fieldset>
      <legend>Kisan perustiedot</legend>
      <div class="kentat-rinnakkain">
        <div class="kentta">
          <label for="nimi">Kisan nimi</label>
          <input id="nimi" v-model="tiedot.nimi" type="text" autocomplete="off" />
        </div>
        <div class="kentta">
          <label for="jarjestaja">Järjestäjä / seura</label>
          <input id="jarjestaja" v-model="tiedot.jarjestaja" type="text" autocomplete="off" />
        </div>
        <div class="kentta">
          <label for="paikka">Kilpailupaikka</label>
          <input id="paikka" v-model="tiedot.paikka" type="text" autocomplete="off" />
        </div>
        <div class="kentta">
          <label for="pvm">Päivämäärä</label>
          <input id="pvm" v-model="tiedot.pvm" type="text" placeholder="esim. 15.6.2026" />
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>Vastuuhenkilöt</legend>
      <div class="kentat-rinnakkain">
        <div class="kentta">
          <label for="johtaja">Kilpailunjohtaja</label>
          <input id="johtaja" v-model="tiedot.kilpailunjohtaja" type="text" autocomplete="off" />
        </div>
        <div class="kentta">
          <label for="tuomari">Tuomari / jury</label>
          <input id="tuomari" v-model="tiedot.tuomari" type="text" autocomplete="off" />
        </div>
        <div class="kentta">
          <label for="kirjuri">Kirjuri / sihteeri</label>
          <input id="kirjuri" v-model="tiedot.kirjuri" type="text" autocomplete="off" />
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>Yhdistyskilpailu</legend>

      <!--
        Säännöissä joukkuekilpailu on vapaaehtoinen ja kilpailukutsussa mainittava, joten
        se on valinta eikä oletus. Pois päältä se piiloutuu myös tuloksista ja viennistä,
        jottei kisasta synny tulosta jota ei ole järjestetty.
      -->
      <div class="kentta">
        <label class="valinta">
          <input
            type="checkbox"
            :checked="onJoukkuekilpailu(asetukset)"
            @change="store.asetaJoukkuekilpailu(($event.target as HTMLInputElement).checked)"
          />
          <span>Yhdistys- ja joukkuekilpailu järjestetään</span>
        </label>
        <span class="vihje">
          Sääntöjen mukaan joukkuekilpailusta on mainittava kilpailukutsussa. Jos sitä ei
          järjestetä, poista rasti — tulokset ja vienti näyttävät silloin vain henkilökohtaiset
          tulokset.
        </span>
      </div>

      <div v-if="onJoukkuekilpailu(asetukset)" class="kentta parhaat">
        <label for="parhaat">Laskettavien parhaiden määrä</label>
        <input
          id="parhaat"
          type="number"
          min="1"
          max="20"
          :value="asetukset.laskettavatParhaat"
          @input="store.asetaLaskettavatParhaat(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="vihje">Sääntöjen mukaan joukkueen koko on 3 ampujaa, joten oletus on 3.</span>
      </div>
    </fieldset>

    <!-- Vain RESUL-kisassa: mukautetun kisan lajit määritellään omassa osiossaan. -->
    <fieldset v-if="kisa.tyyppi === 'resul'">
      <legend>Lajien rakenne</legend>
      <p class="vihje rakenne-vihje">
        Oletukset ovat RESUL:n sääntöjen mukaiset (versiot 1.6 / 2025). Muokkaa vain, jos säännöt
        ovat muuttuneet. Sarjojen tai laukausten vähentäminen poistaa jo kirjattuja laukauksia.
      </p>

      <div class="taulukko-kehys">
        <table>
          <thead>
            <tr>
              <th>Laji</th>
              <th class="numero">Kilpasarjoja</th>
              <th class="numero">Laukauksia / sarja</th>
              <th>Tulos</th>
              <th class="numero">Yhteensä</th>
              <th class="numero">Maksimi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="laji in LAJI_KOODIT" :key="laji">
              <th scope="row">{{ laji }}</th>
              <td class="numero">
                <input
                  class="pieni"
                  type="number"
                  min="1"
                  max="10"
                  :aria-label="`${laji}: kilpasarjojen määrä`"
                  :value="asetukset.lajiMaaritykset[laji].kilpasarjoja"
                  @change="
                    paivitaRakenne(laji, 'kilpasarjoja', ($event.target as HTMLInputElement).value)
                  "
                />
              </td>
              <td class="numero">
                <input
                  class="pieni"
                  type="number"
                  min="1"
                  max="60"
                  :aria-label="`${laji}: laukauksia sarjassa`"
                  :value="asetukset.lajiMaaritykset[laji].laukauksiaSarjassa"
                  @change="
                    paivitaRakenne(
                      laji,
                      'laukauksiaSarjassa',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </td>
              <td>
                <select
                  :aria-label="`${laji}: tulossääntö`"
                  :value="asetukset.lajiMaaritykset[laji].tulosSaanto"
                  @change="paivitaSaanto(laji, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="s in tulosSaannot" :key="s.arvo" :value="s.arvo">
                    {{ s.nimi }}
                  </option>
                </select>
              </td>
              <td class="numero">{{ laukauksiaYhteensa(asetukset.lajiMaaritykset[laji]) }} ls</td>
              <td class="numero">{{ suurinTulos(asetukset.lajiMaaritykset[laji]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="palautus">
        <button type="button" class="nappi" @click="store.palautaOletusRakenteet()">
          Palauta sääntöjen mukaiset oletukset
        </button>
      </p>
    </fieldset>

    <fieldset>
      <legend>Muistiinpanot</legend>
      <div class="kentta">
        <label for="muistiinpanot" class="piilotettu">Muistiinpanot</label>
        <textarea id="muistiinpanot" v-model="tiedot.muistiinpanot"></textarea>
      </div>
    </fieldset>

    <KisanPaattaminen />
  </section>
</template>

<style scoped>
.parhaat {
  max-width: 20rem;
}
.rakenne-vihje {
  margin-bottom: 0.85rem;
}
.pieni {
  width: 5.5rem;
  text-align: right;
}
.palautus {
  margin: 0.85rem 0;
}
.muodot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.napit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
.vaarallinen {
  border-color: var(--vari-virhe);
  color: var(--vari-virhe);
}
.varmistus {
  margin-top: 0.6rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--vari-virhe);
  border-radius: var(--reunapyoristys);
  background: var(--vari-virhe-tausta);
  color: var(--vari-virhe);
  font-size: 0.88rem;
}
.piilotettu {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
/* Sama hahmo kuin muiden näkymien valinnoissa: riittävä kosketuskohde radalla. */
.valinta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}
.valinta input {
  width: 1.15rem;
  height: 1.15rem;
}
td select {
  min-width: 13rem;
}
</style>
