import { defineStore } from 'pinia'
import { ref } from 'vue'
import { uusiId } from '@/core/tunnus'

/**
 * Laitekohtaiset tiedot. **Ei osa kisadataa** — näitä ei viedä eikä yhdistetä, koska ne
 * kuvaavat tätä laitetta eivätkä kilpailua.
 */
export const useLaiteStore = defineStore(
  'laite',
  () => {
    /** Pysyvä laitetunniste. Käytetään tulosten yhdistämisessä lähteen tunnistamiseen. */
    const laiteId = ref(uusiId())

    /** Käyttäjän antama nimi laitteelle, esim. "Koje 1" tai kirjaajan nimi. */
    const laiteNimi = ref('')

    /** Milloin tulokset on viimeksi viety tiedostoon (ISO). Tyhjä = ei koskaan. */
    const viimeinenVienti = ref('')

    /**
     * Onko tämä laite luovuttanut kisan eteenpäin? Vuorottelussa luovuttava laite
     * siirtyy vain luku -tilaan, jottei sama kisa haaraudu kahdelle laitteelle.
     */
    const luovutettu = ref(false)

    /**
     * Syöttötapa: `auto` valitsee laitteen mukaan, muut pakottavat valinnan.
     * Tallennetaan, koska esimerkiksi tabletti + näppäimistö haluaa taulukon pysyvästi.
     */
    const syottotapa = ref<'auto' | 'nappaimisto' | 'taulukko'>('auto')

    function asetaSyottotapa(tapa: 'auto' | 'nappaimisto' | 'taulukko') {
      syottotapa.value = tapa
    }

    /**
     * Tallennetaanko lisätty kilpailija myös rosteriin? Ks. `core/rosteri`.
     *
     * Oletuksena ei: nimet ovat henkilötietoja, eikä sovellus jätä niitä laitteelle
     * kisan jälkeen ilman että käyttäjä on niin valinnut. Valinta muistetaan, koska
     * rosteria käyttävä yhdistys haluaa sen päälle kertaalleen eikä jokaisella rivillä.
     */
    const tallennaRosteriin = ref(false)

    function asetaTallennaRosteriin(paalla: boolean) {
      tallennaRosteriin.value = paalla
    }

    /**
     * Viimeksi käytetty laji. Valikon linkit palaavat siihen lajiin, jota kirjaaja oli
     * syöttämässä, eikä aina ensimmäiseen.
     */
    const viimeinenLaji = ref('RA1')

    function asetaViimeinenLaji(laji: string) {
      viimeinenLaji.value = laji
    }

    function nimea(nimi: string) {
      laiteNimi.value = nimi.trim()
    }

    function merkitseVienti(aika: string) {
      viimeinenVienti.value = aika
    }

    function merkitseLuovutetuksi() {
      luovutettu.value = true
    }

    /** Käyttäjä haluaa jatkaa kirjaamista luovutuksen jälkeen. */
    function jatkaSilti() {
      luovutettu.value = false
    }

    /**
     * Nollaa kisaan liittyvät tiedot mutta säilyttää laitteen tunnisteen ja asetukset.
     * Käytetään kun sama laite jatkaa seuraavaan kisaan.
     */
    function nollaaKisakohtaiset() {
      viimeinenVienti.value = ''
      luovutettu.value = false
    }

    /**
     * Nollaa myös laitteen tunnisteen ja asetukset. Käytetään kun laite luovutetaan
     * pois — uusi tunniste estää sen, että laitteen voi yhdistää edelliseen kisaan.
     */
    function nollaaLaite() {
      laiteId.value = uusiId()
      laiteNimi.value = ''
      syottotapa.value = 'auto'
      tallennaRosteriin.value = false
      nollaaKisakohtaiset()
    }

    return {
      laiteId,
      laiteNimi,
      viimeinenVienti,
      luovutettu,
      syottotapa,
      tallennaRosteriin,
      asetaTallennaRosteriin,
      viimeinenLaji,
      asetaViimeinenLaji,
      nimea,
      merkitseVienti,
      merkitseLuovutetuksi,
      jatkaSilti,
      asetaSyottotapa,
      nollaaKisakohtaiset,
      nollaaLaite,
    }
  },
  { persist: true },
)
