import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  Kilpailija,
  Kilpasarjamaaritys,
  Kisa,
  KisaTyyppi,
  Laji,
  LajiId,
  LajiMaaritys,
  Laukaus,
  Luokka,
  MukautettuLaji,
  Osallistuminen,
  SarjaId,
} from '@/types/kisa'
import { LAJIT, LAJI_KOODIT, kisanLajit, kisanSarjat } from '@/core/lajit'
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
    function osallistujia(laji: LajiId): number {
      return kisa.value.kilpailijat.filter((k) => k.osallistumiset[laji]).length
    }

    /** Kuinka moni lajin osallistuja on täysin kirjattu. */
    function valmiita(laji: LajiId): number {
      const rakenne = kisanLajit(kisa.value).find((r) => r.id === laji)
      if (!rakenne) return 0
      let n = 0
      for (const k of kisa.value.kilpailijat) {
        const o = k.osallistumiset[laji]
        if (o && laskeLaji(laji, rakenne, o).valmis) n++
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
      ikasarja?: SarjaId
    }): Kilpailija {
      const uusi: Kilpailija = {
        id: uusiId(),
        etunimi: tiedot.etunimi.trim(),
        sukunimi: tiedot.sukunimi.trim(),
        yhdistys: tiedot.yhdistys.trim(),
        /*
         * Oletussarja kisan omasta listasta: mukautetussa kisassa H:ta ei ole olemassa.
         * Tyhjä arvo tulkitaan puuttuvaksi — sarjaton kilpailija ei näkyisi missään
         * sarjakohtaisessa tuloksessa, ja lomakkeen tyhjä valinta lähettää tyhjän
         * merkkijonon, jota `??` ei ottaisi kiinni.
         */
        ikasarja: tiedot.ikasarja?.trim() || kisanSarjat(kisa.value)[0] || 'H',
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

    /**
     * Lisää kilpailijan lajiin annetulla aseluokalla.
     *
     * Rakenne haetaan `kisanLajit`-sauman kautta, joten sama kutsu toimii sekä
     * RESUL-lajille että mukautetulle lajille — myös silloin kun sarjat ovat eri
     * mittaisia.
     */
    function lisaaOsallistuminen(id: string, laji: LajiId, luokka: Luokka = 'vakio') {
      const k = kilpailija(id)
      if (!k || k.osallistumiset[laji]) return
      const rakenne = kisanLajit(kisa.value).find((r) => r.id === laji)
      if (!rakenne) return
      const osallistuminen: Osallistuminen = {
        luokka,
        kilpasarjat: rakenne.kilpasarjat.map((s) => ({
          laukaukset: Array.from({ length: s.laukauksia }, () => null),
        })),
        rangaistuksia: 0,
        hylatty: false,
      }
      k.osallistumiset[laji] = osallistuminen
    }

    /** Poistaa osallistumisen ja sen tulokset. */
    function poistaOsallistuminen(id: string, laji: LajiId) {
      const k = kilpailija(id)
      if (!k) return
      delete k.osallistumiset[laji]
    }

    function asetaLuokka(id: string, laji: LajiId, luokka: Luokka) {
      const o = kilpailija(id)?.osallistumiset[laji]
      if (o) o.luokka = luokka
    }

    function asetaRangaistukset(id: string, laji: LajiId, maara: number) {
      const o = kilpailija(id)?.osallistumiset[laji]
      if (o) o.rangaistuksia = Math.max(0, Math.trunc(maara))
    }

    function asetaHylatty(id: string, laji: LajiId, hylatty: boolean) {
      const o = kilpailija(id)?.osallistumiset[laji]
      if (o) o.hylatty = hylatty
    }

    function asetaHuomio(id: string, laji: LajiId, huom: string) {
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
      laji: LajiId,
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
    function tyhjennaKilpasarja(id: string, laji: LajiId, kilpasarja: number) {
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

    // ---------- Mukautetun kisan lajit ----------

    /** Mukautetun kisan lajit. RESUL-kisassa tyhjä. */
    const mukautetutLajit = computed(() => kisa.value.lajit ?? [])

    function mukautettuLaji(id: LajiId): MukautettuLaji | undefined {
      return kisa.value.lajit?.find((l) => l.id === id)
    }

    /**
     * Montako kirjattua laukausta lajissa on? Käytetään varmistuksissa ennen muutosta,
     * joka lyhentäisi sarjoja — kirjaaja ei voi arvioida menetystä ilman lukua.
     */
    function kirjattujaLaukauksia(id: LajiId): number {
      let n = 0
      for (const k of kisa.value.kilpailijat) {
        for (const sarja of k.osallistumiset[id]?.kilpasarjat ?? []) {
          for (const laukaus of sarja.laukaukset) if (laukaus !== null) n++
        }
      }
      return n
    }

    /**
     * Montako kirjattua laukausta katoaisi, jos lajin sarjat korvattaisiin annetuilla?
     * Laskee sekä poistuvat sarjat että lyhenevien sarjojen hännät.
     */
    function menetettavatLaukaukset(id: LajiId, uudet: Kilpasarjamaaritys[]): number {
      let n = 0
      for (const k of kisa.value.kilpailijat) {
        const sarjat = k.osallistumiset[id]?.kilpasarjat ?? []
        sarjat.forEach((sarja, i) => {
          const pituus = uudet[i]?.laukauksia ?? 0
          for (let j = pituus; j < sarja.laukaukset.length; j++) {
            if (sarja.laukaukset[j] !== null) n++
          }
        })
      }
      return n
    }

    /** Lisää uuden lajin mukautettuun kisaan ja palauttaa sen. */
    function lisaaMukautettuLaji(tiedot: Partial<MukautettuLaji> = {}): MukautettuLaji {
      if (!kisa.value.lajit) kisa.value.lajit = []
      const jarjestys = kisa.value.lajit.length + 1
      const uusi: MukautettuLaji = {
        id: uusiId(),
        koodi: tiedot.koodi?.trim() || `L${jarjestys}`,
        nimi: tiedot.nimi?.trim() || `Laji ${jarjestys}`,
        kilpasarjat: tiedot.kilpasarjat ?? [{ laukauksia: 10 }],
        tulosSaanto: tiedot.tulosSaanto ?? 'summa',
        ...(tiedot.kuvaus ? { kuvaus: tiedot.kuvaus } : {}),
      }
      kisa.value.lajit.push(uusi)
      return uusi
    }

    /** Muuttaa lajin kuvailutietoja. Ei koske sarjoihin, ks. `asetaKilpasarjat`. */
    function paivitaMukautettuLaji(
      id: LajiId,
      muutokset: Partial<Omit<MukautettuLaji, 'id' | 'kilpasarjat'>>,
    ) {
      const laji = mukautettuLaji(id)
      if (!laji) return
      Object.assign(laji, muutokset)
      if (laji.koodi.trim() === '') laji.koodi = id.slice(0, 4)
    }

    /**
     * Korvaa lajin kilpasarjat ja sovittaa kirjatut tulokset uuteen rakenteeseen.
     *
     * Lyhentäminen poistaa laukauksia lopusta, joten kutsujan on varmistettava muutos
     * käyttäjältä — `menetettavatLaukaukset` kertoo mitä on vaarassa.
     */
    function asetaKilpasarjat(id: LajiId, sarjat: Kilpasarjamaaritys[]) {
      const laji = mukautettuLaji(id)
      if (!laji) return
      laji.kilpasarjat = sarjat.map((s) => ({
        ...(s.nimi?.trim() ? { nimi: s.nimi.trim() } : {}),
        laukauksia: Math.max(1, Math.trunc(s.laukauksia) || 1),
      }))

      for (const k of kisa.value.kilpailijat) {
        const o = k.osallistumiset[id]
        if (!o) continue
        while (o.kilpasarjat.length < laji.kilpasarjat.length)
          o.kilpasarjat.push({ laukaukset: [] })
        o.kilpasarjat.length = laji.kilpasarjat.length
        laji.kilpasarjat.forEach((maaritys, i) => {
          const sarja = o.kilpasarjat[i]
          if (!sarja) return
          while (sarja.laukaukset.length < maaritys.laukauksia) sarja.laukaukset.push(null)
          sarja.laukaukset.length = maaritys.laukauksia
        })
      }
    }

    /** Poistaa lajin ja kaikki siihen kirjatut tulokset. */
    function poistaMukautettuLaji(id: LajiId) {
      const i = kisa.value.lajit?.findIndex((l) => l.id === id) ?? -1
      if (i < 0) return
      kisa.value.lajit?.splice(i, 1)
      for (const k of kisa.value.kilpailijat) delete k.osallistumiset[id]
    }

    /** Siirtää lajia listassa. Järjestys on välilehtien järjestys. */
    function siirraMukautettuLaji(id: LajiId, suunta: -1 | 1) {
      const lajit = kisa.value.lajit
      if (!lajit) return
      const i = lajit.findIndex((l) => l.id === id)
      const j = i + suunta
      if (i < 0 || j < 0 || j >= lajit.length) return
      const [siirretty] = lajit.splice(i, 1)
      if (siirretty) lajit.splice(j, 0, siirretty)
    }

    // ---------- Mukautetun kisan sarjat ----------

    /** Kisan sarjat: RESUL-kisassa H ja H50, mukautetussa järjestäjän omat. */
    const sarjat = computed(() => kisanSarjat(kisa.value))

    /** Montako kilpailijaa on kyseisessä sarjassa? Käytetään poiston varmistuksessa. */
    function sarjassa(sarja: SarjaId): number {
      return kisa.value.kilpailijat.filter((k) => k.ikasarja === sarja).length
    }

    /** Lisää sarjan mukautettuun kisaan. Sama nimi ei voi esiintyä kahdesti. */
    function lisaaSarja(nimi: string): boolean {
      const siisti = nimi.trim()
      if (!siisti) return false
      if (!kisa.value.sarjat) kisa.value.sarjat = []
      if (kisa.value.sarjat.includes(siisti)) return false
      kisa.value.sarjat.push(siisti)
      return true
    }

    /**
     * Poistaa sarjan ja siirtää sen kilpailijat ensimmäiseen jäljelle jäävään sarjaan.
     *
     * Kilpailijaa ei jätetä sarjaan jota ei ole: hän katoaisi kaikista sarjakohtaisista
     * tuloksista huomaamatta. Viimeistä sarjaa ei voi poistaa.
     */
    function poistaSarja(sarja: SarjaId) {
      const lista = kisa.value.sarjat
      if (!lista || lista.length <= 1) return
      const i = lista.indexOf(sarja)
      if (i < 0) return
      lista.splice(i, 1)
      const korvaava = lista[0]
      if (!korvaava) return
      for (const k of kisa.value.kilpailijat) {
        if (k.ikasarja === sarja) k.ikasarja = korvaava
      }
    }

    /** Nimeää sarjan uudelleen ja siirtää sen kilpailijat mukana. */
    function nimeaSarja(vanha: SarjaId, uusi: string): boolean {
      const siisti = uusi.trim()
      const lista = kisa.value.sarjat
      if (!lista || !siisti || siisti === vanha) return false
      if (lista.includes(siisti)) return false
      const i = lista.indexOf(vanha)
      if (i < 0) return false
      lista[i] = siisti
      for (const k of kisa.value.kilpailijat) {
        if (k.ikasarja === vanha) k.ikasarja = siisti
      }
      return true
    }

    /**
     * Vaihtaa kisan muodon. Muoto ratkaisee mistä lajit ja sarjat tulevat, joten vaihto
     * tekee kirjatuista tuloksista tulkitsemattomia — kutsuja vastaa varmistuksesta.
     */
    function asetaKisaTyyppi(tyyppi: KisaTyyppi) {
      if (kisa.value.tyyppi === tyyppi) return
      kisa.value.tyyppi = tyyppi
      for (const k of kisa.value.kilpailijat) k.osallistumiset = {}
      kisa.value.lajit = tyyppi === 'mukautettu' ? (kisa.value.lajit ?? []) : undefined

      if (tyyppi === 'mukautettu') {
        // Aloitussarja, jottei kisa jää tilaan jossa kilpailijaa ei voi lisätä.
        kisa.value.sarjat = kisa.value.sarjat?.length ? kisa.value.sarjat : ['Yleinen']
      } else {
        kisa.value.sarjat = undefined
      }
      // Sarjat vaihtuivat, joten kilpailijoiden sarja on siirrettävä kelvolliseksi.
      const kelvolliset = kisanSarjat(kisa.value)
      const oletus = kelvolliset[0] ?? 'H'
      for (const k of kisa.value.kilpailijat) {
        if (!kelvolliset.includes(k.ikasarja)) k.ikasarja = oletus
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
      mukautetutLajit,
      mukautettuLaji,
      kirjattujaLaukauksia,
      menetettavatLaukaukset,
      lisaaMukautettuLaji,
      paivitaMukautettuLaji,
      asetaKilpasarjat,
      poistaMukautettuLaji,
      siirraMukautettuLaji,
      asetaKisaTyyppi,
      sarjat,
      sarjassa,
      lisaaSarja,
      poistaSarja,
      nimeaSarja,
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
