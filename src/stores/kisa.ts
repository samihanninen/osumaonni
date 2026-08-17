import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  IkaSarja,
  Kilpailija,
  Kisa,
  KisaTyyppi,
  Laji,
  LajiMaaritys,
  Laukaus,
  Luokka,
  Osallistuminen,
} from '@/types/kisa'
import { LAJIT, LAJI_KOODIT, tyhjatKilpasarjat } from '@/core/lajit'
import { laskeLaji } from '@/core/laskenta'
import { lyhytTunnus, uusiId } from '@/core/tunnus'
import { KISA_SKEEMA_VERSIO, lueTallennettu, type LuentaTulos } from '@/core/skeema'
import { useLaiteStore } from './laite'

function oletusLajiMaaritykset(): Record<Laji, LajiMaaritys> {
  // Syväkopio, jotta järjestäjän muokkaukset eivät muuta vakioita.
  return structuredClone(LAJIT)
}

export function tyhjaKisa(tyyppi: KisaTyyppi = 'resul'): Kisa {
  return {
    schemaVersion: KISA_SKEEMA_VERSIO,
    tyyppi,
    kisaId: lyhytTunnus(),
    kisatiedot: {
      nimi: '',
      jarjestaja: '',
      paikka: '',
      pvm: '',
      kilpailunjohtaja: '',
      tuomari: '',
      kirjuri: '',
      muistiinpanot: '',
    },
    asetukset: {
      laskettavatParhaat: 3,
      joukkuekilpailu: true,
      lajiMaaritykset: oletusLajiMaaritykset(),
    },
    kilpailijat: [],
  }
}

/** localStorage-avain, jonka persistedstate johtaa storen tunnuksesta. */
const TALLENNUSAVAIN = 'kisa'

/** Talteen otettujen tallennusten avainten alku. */
export const VARMUUSKOPIO_ETULIITE = `${TALLENNUSAVAIN}-varmuuskopio`

/**
 * Laitteella olevat varmuuskopiot.
 *
 * Kopiot sisältävät kilpailijoiden nimet ja yhdistykset eli henkilötietoja, joten ne
 * kuuluvat poistettaviin, kun kisan tiedot poistetaan laitteelta. Muuten sovellus
 * lupaisi tyhjentäneensä laitteen ja jättäisi silti nimet muistiin.
 */
export function varmuuskopioAvaimet(): string[] {
  try {
    return Object.keys(localStorage).filter((avain) => avain.startsWith(VARMUUSKOPIO_ETULIITE))
  } catch {
    return []
  }
}

/**
 * Viimeisimmän luennan tulos. Moduulitasolla, koska tallennuksia on laitteessa yksi ja
 * luenta tapahtuu hydratoinnissa eli storen alustuksen jälkeen — setup-funktion sisäinen
 * ref olisi jo palautettu siinä vaiheessa, kun tulos selviää.
 */
const luenta = ref<LuentaTulos>({ tila: 'tyhja' })

/**
 * Ottaa talteen tallennuksen, jota ei voitu ottaa käyttöön.
 *
 * Tämä on koko versioinnin tarkoitus. Kun sovellus ei ymmärrä laitteella olevaa
 * tallennusta, se aloittaa tyhjästä kisasta — ja ensimmäinen kirjattu laukaus
 * kirjoittaisi tuntemattoman tallennuksen päälle. Kopio otetaan siis ennen kuin
 * mitään ehtii tapahtua, jotta tulokset ovat kaivettavissa myös jälkikäteen.
 *
 * Avain sisältää löydetyn version, joten eri syistä syntyneet kopiot eivät korvaa
 * toisiaan. Olemassa olevaa kopiota ei kirjoiteta yli: ensimmäinen talteenotto on
 * lähempänä alkuperäistä kuin myöhempi.
 */
function otaTalteen(raaka: string, tulos: LuentaTulos) {
  const avain =
    tulos.loydettyVersio === undefined
      ? `${TALLENNUSAVAIN}-varmuuskopio-rikki`
      : `${TALLENNUSAVAIN}-varmuuskopio-v${tulos.loydettyVersio}`
  try {
    if (localStorage.getItem(avain) === null) localStorage.setItem(avain, raaka)
  } catch {
    // Tila voi olla täynnä tai kirjoitus estetty. Kopio on lisävarmistus, ei ehto
    // sovelluksen käynnistymiselle, joten epäonnistuminen ei saa kaataa hydratointia.
  }
}

export const useKisaStore = defineStore(
  'kisa',
  () => {
    const kisa = ref<Kisa>(tyhjaKisa())

    /** Miten laitteella ollut tallennus luettiin. Käyttöliittymä varoittaa hylätystä. */
    const skeemaTila = computed(() => luenta.value.tila)
    /** Hylätystä tallennuksesta löytynyt versionumero, jos se oli luettavissa. */
    const skeemaVersio = computed(() => luenta.value.loydettyVersio ?? null)

    // ---------- Johdetut tiedot ----------

    /** Yhdistysten nimet aiemmista syötteistä. Käytetään ehdotuslistana, jotta
     * kirjoitusasu pysyy samana — väärä kirjoitusasu rikkoisi yhdistyskilpailun. */
    const yhdistysEhdotukset = computed(() => {
      const nimet = new Set<string>()
      for (const k of kisa.value.kilpailijat) {
        const y = k.yhdistys?.trim()
        if (y) nimet.add(y)
      }
      return [...nimet].sort((a, b) => a.localeCompare(b, 'fi'))
    })

    const kilpailijoita = computed(() => kisa.value.kilpailijat.length)

    /** Montako kilpailijaa osallistuu kyseiseen lajiin. */
    function osallistujia(laji: Laji): number {
      return kisa.value.kilpailijat.filter((k) => k.osallistumiset[laji]).length
    }

    /** Kuinka moni lajin osallistuja on täysin kirjattu. */
    function valmiita(laji: Laji): number {
      const maaritys = kisa.value.asetukset.lajiMaaritykset[laji]
      let n = 0
      for (const k of kisa.value.kilpailijat) {
        const o = k.osallistumiset[laji]
        if (o && laskeLaji(laji, maaritys, o).valmis) n++
      }
      return n
    }

    const onTietoja = computed(
      () => kisa.value.kilpailijat.length > 0 || kisa.value.kisatiedot.nimi.trim() !== '',
    )

    function kilpailija(id: string): Kilpailija | undefined {
      return kisa.value.kilpailijat.find((k) => k.id === id)
    }

    // ---------- Kilpailijat ----------

    function lisaaKilpailija(tiedot: {
      etunimi: string
      sukunimi: string
      yhdistys: string
      ikasarja?: IkaSarja
    }): Kilpailija {
      const uusi: Kilpailija = {
        id: uusiId(),
        etunimi: tiedot.etunimi.trim(),
        sukunimi: tiedot.sukunimi.trim(),
        yhdistys: tiedot.yhdistys.trim(),
        ikasarja: tiedot.ikasarja ?? 'H',
        osallistumiset: {},
      }
      kisa.value.kilpailijat.push(uusi)
      return uusi
    }

    function paivitaKilpailija(id: string, muutokset: Partial<Omit<Kilpailija, 'id'>>) {
      const k = kilpailija(id)
      if (!k) return
      Object.assign(k, muutokset)
    }

    function poistaKilpailija(id: string) {
      const i = kisa.value.kilpailijat.findIndex((k) => k.id === id)
      if (i >= 0) kisa.value.kilpailijat.splice(i, 1)
    }

    // ---------- Osallistumiset ----------

    /** Lisää kilpailijan lajiin annetulla aseluokalla. */
    function lisaaOsallistuminen(id: string, laji: Laji, luokka: Luokka = 'vakio') {
      const k = kilpailija(id)
      if (!k || k.osallistumiset[laji]) return
      const maaritys = kisa.value.asetukset.lajiMaaritykset[laji]
      const osallistuminen: Osallistuminen = {
        luokka,
        kilpasarjat: tyhjatKilpasarjat(maaritys).map((laukaukset) => ({ laukaukset })),
        rangaistuksia: 0,
        hylatty: false,
      }
      k.osallistumiset[laji] = osallistuminen
    }

    /** Poistaa osallistumisen ja sen tulokset. */
    function poistaOsallistuminen(id: string, laji: Laji) {
      const k = kilpailija(id)
      if (!k) return
      delete k.osallistumiset[laji]
    }

    function asetaLuokka(id: string, laji: Laji, luokka: Luokka) {
      const o = kilpailija(id)?.osallistumiset[laji]
      if (o) o.luokka = luokka
    }

    function asetaRangaistukset(id: string, laji: Laji, maara: number) {
      const o = kilpailija(id)?.osallistumiset[laji]
      if (o) o.rangaistuksia = Math.max(0, Math.trunc(maara))
    }

    function asetaHylatty(id: string, laji: Laji, hylatty: boolean) {
      const o = kilpailija(id)?.osallistumiset[laji]
      if (o) o.hylatty = hylatty
    }

    function asetaHuomio(id: string, laji: Laji, huom: string) {
      const o = kilpailija(id)?.osallistumiset[laji]
      if (o) o.huom = huom
    }

    // ---------- Laukaukset ----------

    /**
     * Asettaa yhden laukauksen ja merkitsee sarjan muokatuksi. Muokkausaika ja laitetunnus
     * tarvitaan tulosten yhdistämisessä ristiriitojen tunnistamiseen.
     */
    function asetaLaukaus(
      id: string,
      laji: Laji,
      kilpasarja: number,
      laukaus: number,
      arvo: Laukaus,
    ) {
      const o = kilpailija(id)?.osallistumiset[laji]
      const sarja = o?.kilpasarjat[kilpasarja]
      if (!sarja) return
      if (laukaus < 0 || laukaus >= sarja.laukaukset.length) return

      sarja.laukaukset[laukaus] = arvo
      sarja.muokattu = new Date().toISOString()
      sarja.laiteId = useLaiteStore().laiteId
    }

    /** Tyhjentää yhden kilpasarjan laukaukset. */
    function tyhjennaKilpasarja(id: string, laji: Laji, kilpasarja: number) {
      const o = kilpailija(id)?.osallistumiset[laji]
      const sarja = o?.kilpasarjat[kilpasarja]
      if (!sarja) return
      sarja.laukaukset = sarja.laukaukset.map(() => null)
      sarja.muokattu = new Date().toISOString()
      sarja.laiteId = useLaiteStore().laiteId
    }

    // ---------- Asetukset ----------

    function asetaLaskettavatParhaat(maara: number) {
      kisa.value.asetukset.laskettavatParhaat = Math.max(1, Math.trunc(maara))
    }

    /** Järjestetäänkö yhdistys- ja joukkuekilpailu? Säännöissä se on vapaaehtoinen. */
    function asetaJoukkuekilpailu(paalla: boolean) {
      kisa.value.asetukset.joukkuekilpailu = paalla
    }

    /**
     * Muuttaa lajin rakennetta ja sovittaa olemassa olevat kilpasarjat uuteen mittaan.
     * Lyhentäminen poistaa laukauksia lopusta, joten kutsuja vastaa varmistuksesta.
     */
    function asetaLajiMaaritys(laji: Laji, muutokset: Partial<LajiMaaritys>) {
      const maaritys = kisa.value.asetukset.lajiMaaritykset[laji]
      Object.assign(maaritys, muutokset)

      for (const k of kisa.value.kilpailijat) {
        const o = k.osallistumiset[laji]
        if (!o) continue

        // Sovita kilpasarjojen määrä.
        while (o.kilpasarjat.length < maaritys.kilpasarjoja) {
          o.kilpasarjat.push({
            laukaukset: Array.from({ length: maaritys.laukauksiaSarjassa }, () => null),
          })
        }
        o.kilpasarjat.length = maaritys.kilpasarjoja

        // Sovita laukausten määrä kussakin sarjassa.
        for (const sarja of o.kilpasarjat) {
          while (sarja.laukaukset.length < maaritys.laukauksiaSarjassa) sarja.laukaukset.push(null)
          sarja.laukaukset.length = maaritys.laukauksiaSarjassa
        }
      }
    }

    /** Palauttaa lajien rakenteet sääntöjen mukaisiin oletuksiin. */
    function palautaOletusRakenteet() {
      for (const laji of LAJI_KOODIT) {
        asetaLajiMaaritys(laji, LAJIT[laji])
      }
    }

    // ---------- Koko kisa ----------

    /** Korvaa kisan kokonaan, esim. tiedostosta tuotaessa. */
    function korvaaKisa(uusi: Kisa) {
      kisa.value = uusi
    }

    /** Aloittaa uuden tyhjän kisan. Kutsujan on varmistettava tämä käyttäjältä. */
    function aloitaUusi() {
      kisa.value = tyhjaKisa()
    }

    return {
      kisa,
      skeemaTila,
      skeemaVersio,
      yhdistysEhdotukset,
      kilpailijoita,
      onTietoja,
      osallistujia,
      valmiita,
      kilpailija,
      lisaaKilpailija,
      paivitaKilpailija,
      poistaKilpailija,
      lisaaOsallistuminen,
      poistaOsallistuminen,
      asetaLuokka,
      asetaRangaistukset,
      asetaHylatty,
      asetaHuomio,
      asetaLaukaus,
      tyhjennaKilpasarja,
      asetaLaskettavatParhaat,
      asetaJoukkuekilpailu,
      asetaLajiMaaritys,
      palautaOletusRakenteet,
      korvaaKisa,
      aloitaUusi,
    }
  },
  {
    persist: {
      /*
       * `pick` rajaa tallennuksen nimenomaan kisaan. Ilman sitä jokainen storeen
       * myöhemmin lisätty apuarvo valuisi localStorageen ja kasvattaisi rakennetta,
       * jonka versiointi lupaa pitää tunnettuna.
       */
      pick: ['kisa'],
      serializer: {
        /**
         * Kirjoitettuun tallennukseen leimataan aina tämän version numero. Näin
         * tiedostossa oleva versio kertoo, mikä sen todella kirjoitti — eikä luennan
         * tarvitse päätellä sitä rakenteesta.
         */
        serialize: (tila) => {
          const kisa = (tila as { kisa?: Kisa }).kisa
          return JSON.stringify(
            kisa ? { ...tila, kisa: { ...kisa, schemaVersion: KISA_SKEEMA_VERSIO } } : tila,
          )
        },

        /**
         * Lukee tallennuksen versioinnin kautta. Tuntematonta ei hydratoida: silloin
         * palautetaan tyhjä tila, jolloin store jää `tyhjaKisa()`-arvoonsa ja
         * alkuperäinen tallennus otetaan talteen ennen kuin sen päälle kirjoitetaan.
         */
        deserialize: (raaka) => {
          const tulos = lueTallennettu(raaka)
          luenta.value = tulos
          if (!tulos.tallennettu) {
            if (tulos.tila !== 'tyhja') otaTalteen(raaka, tulos)
            return {}
          }
          return tulos.tallennettu
        },
      },
    },
  },
)

/** Vain testejä varten: nollaa moduulitasoisen luentatilan. */
export function nollaaLuentaTila() {
  luenta.value = { tila: 'tyhja' }
}
