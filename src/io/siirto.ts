import { deflate, inflate } from 'pako'
import {
  NAPAKYMPPI,
  OHI,
  type Kisa,
  type KisaTyyppi,
  type Laji,
  type Laukaus,
  type Luokka,
  type MukautettuLaji,
} from '@/types/kisa'
import { LAJI_KOODIT } from '@/core/lajit'

/**
 * Tulosten siirtomuoto laitteiden välillä.
 *
 * Muoto on suunniteltu QR-koodin **alfanumeerista tilaa** varten: se hyväksyy vain
 * merkit 0–9, A–Z, välilyönti ja `$%*+-./:`, mutta vetää 4296 merkkiä siinä missä
 * tavutila vain 2953 tavua. Siksi hyötykuorma pakataan ja koodataan base32:lla, jonka
 * aakkosto (A–Z ja 2–7) mahtuu tuohon joukkoon. Täytemerkkiä `=` ei käytetä, koska se
 * ei kuulu alfanumeeriseen joukkoon.
 *
 * Sama muoto kulkee myös linkissä ja tiedostossa — siirtotapa on vaihdettavissa.
 */

/**
 * Muodon versio. Kasvatetaan, jos rakenne muuttuu yhteensopimattomasti.
 *
 * Versio 3 lisäsi kisan muodon ja mukautetun kisan lajit. Vanhempi sovellus ei osaa
 * lukea mukautettua kisaa lainkaan — se näkisi tuloksia lajeille, joita se ei tunne —
 * joten yhteensopivuutta taaksepäin ei ole.
 */
export const SIIRTO_VERSIO = 3

/** Vanhin muoto, jonka tämä versio osaa lukea. */
export const VANHIN_TUETTU = 3

/** Tunniste, josta paketti tunnistetaan. */
export const TUNNISTE = 'OO1'

/**
 * Yhden QR-koodin merkkimäärä.
 *
 * Tässä ei tavoitella suurinta mahdollista koodia vaan **luettavaa** koodia. QR:n
 * suurin versio 40 vetää noin 4300 alfanumeerista merkkiä, mutta on 177×177 moduulia:
 * puhelimen ruudulla yksi moduuli on silloin pari pikseliä, eikä toinen puhelin saa
 * siitä tarkennusta. Noin 1000 merkkiä vastaa versiota ~15–17 eli reilusti alle sadan
 * moduulin, jonka kamera lukee käytännössä heti.
 *
 * Useampi pieni koodi on siis parempi kuin yksi valtava: paloja voi lukea missä
 * järjestyksessä tahansa ja sovellus kertoo mitä puuttuu.
 */
export const QR_MERKKIRAJA = 1000

// --- Laukausten tiivis esitys ----------------------------------------------

/*
 * Yksi merkki per laukaus. Isot kirjaimet ja numerot, jotta merkit kelpaavat
 * alfanumeeriseen tilaan myös silloin kun pakkaus ohitetaan.
 */
const TYHJA_MERKKI = '.'
const KYMPPI_MERKKI = 'A'
const NAPA_MERKKI = 'X'
const HUTI_MERKKI = 'H'

export function laukauksetMerkeiksi(laukaukset: Laukaus[]): string {
  return laukaukset
    .map((l) => {
      if (l === NAPAKYMPPI) return NAPA_MERKKI
      if (l === OHI) return HUTI_MERKKI
      if (l === null || l === undefined) return TYHJA_MERKKI
      if (typeof l === 'number') {
        if (l === 10) return KYMPPI_MERKKI
        if (l === 0) return HUTI_MERKKI
        if (l >= 1 && l <= 9) return String(l)
      }
      return TYHJA_MERKKI
    })
    .join('')
}

export function merkitLaukauksiksi(merkit: string): Laukaus[] {
  return [...merkit].map((m) => {
    if (m === NAPA_MERKKI) return NAPAKYMPPI
    if (m === HUTI_MERKKI) return OHI
    if (m === KYMPPI_MERKKI) return 10
    if (m >= '1' && m <= '9') return Number(m)
    return null
  })
}

// --- Base32 (RFC 4648, ilman täytettä) -------------------------------------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Koodaa(tavut: Uint8Array): string {
  let tulos = ''
  let puskuri = 0
  let bittejä = 0
  for (const tavu of tavut) {
    puskuri = (puskuri << 8) | tavu
    bittejä += 8
    while (bittejä >= 5) {
      tulos += B32[(puskuri >>> (bittejä - 5)) & 31]
      bittejä -= 5
    }
  }
  if (bittejä > 0) tulos += B32[(puskuri << (5 - bittejä)) & 31]
  return tulos
}

export function base32Pura(teksti: string): Uint8Array {
  const tavut: number[] = []
  let puskuri = 0
  let bittejä = 0
  for (const merkki of teksti) {
    const arvo = B32.indexOf(merkki)
    if (arvo < 0) continue // ohitetaan roskamerkit, esim. rivinvaihdot
    puskuri = (puskuri << 5) | arvo
    bittejä += 5
    if (bittejä >= 8) {
      tavut.push((puskuri >>> (bittejä - 8)) & 255)
      bittejä -= 8
    }
  }
  return Uint8Array.from(tavut)
}

// --- Hyötykuorma ------------------------------------------------------------

/** Yhden kilpailijan tulokset yhdessä lajissa. */
export interface SiirtoRivi {
  /** Kilpailijan tunniste. Sama kuin lähettävällä laitteella. */
  id: string
  laji: Laji
  luokka: Luokka
  /** Kilpasarjat tiiviinä merkkijonoina. */
  sarjat: string[]
  rangaistuksia: number
  hylatty: boolean
  huom?: string
  /**
   * Nimitiedot mukana vain osittaisessa paketissa, jotta vastaanottaja voi lisätä
   * kilpailijan jota sillä ei vielä ole (esim. jälki-ilmoittautunut).
   */
  etunimi?: string
  sukunimi?: string
  yhdistys?: string
  ikasarja?: string
}

export type PakettiTyyppi =
  /** Koko kisa. Käytetään vuorottelussa, kun kirjaaminen siirtyy laitteelta toiselle. */
  | 'taysi'
  /** Vain tulokset. Käytetään rinnakkaisessa kirjaamisessa. */
  | 'osa'

/** Kilpailijan perustiedot täydessä paketissa. Tulokset ovat erikseen `rivit`-listassa. */
export interface SiirtoKilpailija {
  id: string
  etunimi: string
  sukunimi: string
  yhdistys: string
  ikasarja: string
}

/**
 * Lajin rakenne siirrossa: vain ne kentät, jotka voivat poiketa oletuksesta.
 *
 * Lajien nimet, kuvaukset, aseet ja etäisyydet ovat samoja joka laitteella, joten niiden
 * lähettäminen olisi pelkkää täytettä — noin 1500 merkkiä eli useamman QR-koodin verran.
 * Vastaanottaja täydentää loput omista oletuksistaan.
 */
export interface TiivisRakenne {
  kilpasarjoja: number
  laukauksiaSarjassa: number
  tulosSaanto: 'paras' | 'summa'
}

export interface Siirtopaketti {
  v: number
  tyyppi: PakettiTyyppi
  kisaId: string
  /** Kasvava versionumero. Estää vanhemman tilan kirjoittamisen uudemman päälle. */
  versio: number
  laiteId: string
  laiteNimi?: string
  /** Paketin luontiaika (ISO). */
  aika: string

  // --- Vain täydessä paketissa ---
  /**
   * Kisan muoto. Puuttuva arvo tarkoittaa RESUL-kisaa, jotta kenttä voidaan jättää
   * pois tavallisimmassa tapauksessa — QR-koodissa jokainen merkki maksaa.
   */
  kisaTyyppi?: KisaTyyppi
  /** Mukautetun kisan lajit. RESUL-kisassa puuttuu: lajit tulevat säännöistä. */
  mukautetutLajit?: MukautettuLaji[]
  kisatiedot?: Kisa['kisatiedot']
  laskettavatParhaat?: number
  rakenteet?: Partial<Record<Laji, TiivisRakenne>>
  /** Koko kilpailijalista, myös ne joilla ei ole vielä osallistumisia. */
  kilpailijat?: SiirtoKilpailija[]

  /** Tulokset. Molemmissa pakettityypeissä. */
  rivit?: SiirtoRivi[]
}

export class SiirtoVirhe extends Error {
  constructor(viesti: string) {
    super(viesti)
    this.name = 'SiirtoVirhe'
  }
}

/*
 * Merkkijonon ja tavujen välinen muunnos tehdään aina TextEncoder/TextDecoder-parilla.
 * pakon omaan `{ to: 'string' }` -valintaan ei luoteta: se ei palauta merkkijonoa
 * kaikissa käännöksissä, jolloin JSON.parse saisi tavutaulukon ja hylkäisi tiedot
 * "vioittuneina". Nimenomainen UTF-8-muunnos on myös oikein ääkkösten kanssa.
 */
const KOODAAJA = new TextEncoder()
const PURKAJA = new TextDecoder()

/** Pakkaa paketin yhdeksi merkkijonoksi ilman paloittelua. */
export function koodaaPaketti(paketti: Siirtopaketti): string {
  const pakattu = deflate(KOODAAJA.encode(JSON.stringify(paketti)), { level: 9 })
  return base32Koodaa(pakattu)
}

export function puraPaketti(data: string): Siirtopaketti {
  let json: string
  try {
    json = PURKAJA.decode(inflate(base32Pura(data)))
  } catch {
    throw new SiirtoVirhe('Tietoja ei voitu purkaa. Onko koodi luettu kokonaan?')
  }

  let paketti: Siirtopaketti
  try {
    paketti = JSON.parse(json) as Siirtopaketti
  } catch {
    throw new SiirtoVirhe('Tiedot ovat vioittuneet.')
  }

  if (!paketti || typeof paketti !== 'object') throw new SiirtoVirhe('Tiedot ovat vioittuneet.')
  if (paketti.v > SIIRTO_VERSIO) {
    throw new SiirtoVirhe(
      `Koodi on tehty uudemmalla sovellusversiolla (muoto ${paketti.v}). Päivitä sovellus.`,
    )
  }
  if (paketti.v < VANHIN_TUETTU) {
    throw new SiirtoVirhe(
      'Koodi on tehty vanhemmalla sovellusversiolla. Päivitä molemmat laitteet ja luo koodi uudelleen.',
    )
  }
  if (paketti.tyyppi !== 'taysi' && paketti.tyyppi !== 'osa') {
    throw new SiirtoVirhe('Tuntematon pakettityyppi.')
  }
  return paketti
}

// --- Paloittelu -------------------------------------------------------------

/**
 * Palan otsikko: `OO1.<TUNNUS>.<JÄRJESTYS>.<MÄÄRÄ>.<DATA>`
 *
 * Kaikki merkit kuuluvat QR:n alfanumeeriseen joukkoon. Tunnus sitoo palat yhteen,
 * jottei kahden eri lähetyksen paloja voi sekoittaa keskenään.
 */
const EROTIN = '.'

export interface Pala {
  tunnus: string
  jarjestys: number
  maara: number
  data: string
}

function luoTunnus(siemen: string): string {
  // Yksinkertainen tiiviste: riittää erottamaan peräkkäiset lähetykset toisistaan.
  let arvo = 0
  for (let i = 0; i < siemen.length; i++) arvo = (arvo * 31 + siemen.charCodeAt(i)) >>> 0
  let tunnus = ''
  for (let i = 0; i < 4; i++) {
    tunnus += B32[(arvo >>> (i * 5)) & 31]
  }
  return tunnus
}

/** Jakaa koodatun paketin QR-koodeihin mahtuviin paloihin. */
export function paloittele(koodattu: string, merkkiraja = QR_MERKKIRAJA): string[] {
  const tunnus = luoTunnus(koodattu)
  // Otsikon pituus vaihtelee palojen määrän mukaan, joten varataan tilaa väljästi.
  const otsikkoVara = TUNNISTE.length + tunnus.length + 12
  const dataPerPala = Math.max(1, merkkiraja - otsikkoVara)
  const maara = Math.max(1, Math.ceil(koodattu.length / dataPerPala))

  const palat: string[] = []
  for (let i = 0; i < maara; i++) {
    const osa = koodattu.slice(i * dataPerPala, (i + 1) * dataPerPala)
    palat.push([TUNNISTE, tunnus, String(i + 1), String(maara), osa].join(EROTIN))
  }
  return palat
}

export function tulkitsePala(teksti: string): Pala {
  const siisti = teksti.trim().toUpperCase()
  const osat = siisti.split(EROTIN)
  if (osat.length < 5 || osat[0] !== TUNNISTE) {
    throw new SiirtoVirhe('Tämä ei ole OsumaOnnin siirtokoodi.')
  }
  const [, tunnus, jarjestysTeksti, maaraTeksti, ...loput] = osat
  const jarjestys = Number(jarjestysTeksti)
  const maara = Number(maaraTeksti)
  if (!tunnus || !Number.isInteger(jarjestys) || !Number.isInteger(maara) || maara < 1) {
    throw new SiirtoVirhe('Siirtokoodin otsikko on vioittunut.')
  }
  if (jarjestys < 1 || jarjestys > maara) {
    throw new SiirtoVirhe('Siirtokoodin osanumero on virheellinen.')
  }
  // Data saattoi sisältää erottimen, joten liitetään loput takaisin yhteen.
  return { tunnus, jarjestys, maara, data: loput.join(EROTIN) }
}

/** Kerää paloja, kunnes kaikki on luettu. */
export class PalojenKeraaja {
  private tunnus: string | null = null
  private palat = new Map<number, string>()
  private maara = 0

  /** Lisää palan. Palauttaa tiedon siitä, mitä vielä puuttuu. */
  lisaa(teksti: string): { valmis: boolean; luettu: number; maara: number; uusi: boolean } {
    const pala = tulkitsePala(teksti)

    // Eri lähetyksen pala: aloitetaan alusta, jottei sekoiteta kahta koodisarjaa.
    if (this.tunnus !== null && this.tunnus !== pala.tunnus) {
      this.tyhjenna()
    }
    this.tunnus = pala.tunnus
    this.maara = pala.maara

    const uusi = !this.palat.has(pala.jarjestys)
    this.palat.set(pala.jarjestys, pala.data)

    return {
      valmis: this.palat.size === this.maara,
      luettu: this.palat.size,
      maara: this.maara,
      uusi,
    }
  }

  /** Puuttuvien palojen järjestysnumerot. */
  puuttuvat(): number[] {
    if (this.maara === 0) return []
    const puuttuu: number[] = []
    for (let i = 1; i <= this.maara; i++) if (!this.palat.has(i)) puuttuu.push(i)
    return puuttuu
  }

  valmis(): boolean {
    return this.maara > 0 && this.palat.size === this.maara
  }

  /** Yhdistää palat ja purkaa paketin. */
  pura(): Siirtopaketti {
    if (!this.valmis()) {
      throw new SiirtoVirhe(`Kaikkia osia ei ole luettu (puuttuu ${this.puuttuvat().join(', ')}).`)
    }
    let data = ''
    for (let i = 1; i <= this.maara; i++) data += this.palat.get(i) ?? ''
    return puraPaketti(data)
  }

  tyhjenna() {
    this.tunnus = null
    this.palat.clear()
    this.maara = 0
  }
}

/** Koodaa paketin suoraan paloiksi. */
export function paketoi(paketti: Siirtopaketti, merkkiraja = QR_MERKKIRAJA): string[] {
  return paloittele(koodaaPaketti(paketti), merkkiraja)
}

/** Purkaa yhden tai useamman palan paketiksi. */
export function pura(palat: string[]): Siirtopaketti {
  const keraaja = new PalojenKeraaja()
  for (const pala of palat) keraaja.lisaa(pala)
  return keraaja.pura()
}

// --- Pakettien rakentaminen -------------------------------------------------

/** Rakentaa osittaisen paketin annetuista kilpailijoista. */
export function rakennaOsapaketti(
  kisa: Kisa,
  tunnisteet: { laiteId: string; laiteNimi?: string; versio: number; aika: string },
  rajaus?: { lajit?: Laji[]; kilpailijaIdt?: string[] },
): Siirtopaketti {
  const lajit = rajaus?.lajit
  const idt = rajaus?.kilpailijaIdt ? new Set(rajaus.kilpailijaIdt) : null

  const rivit: SiirtoRivi[] = []
  for (const k of kisa.kilpailijat) {
    if (idt && !idt.has(k.id)) continue
    for (const [laji, osallistuminen] of Object.entries(k.osallistumiset) as [
      Laji,
      NonNullable<(typeof k.osallistumiset)[Laji]>,
    ][]) {
      if (lajit && !lajit.includes(laji)) continue
      rivit.push({
        id: k.id,
        laji,
        luokka: osallistuminen.luokka,
        sarjat: osallistuminen.kilpasarjat.map((s) => laukauksetMerkeiksi(s.laukaukset)),
        rangaistuksia: osallistuminen.rangaistuksia,
        hylatty: osallistuminen.hylatty,
        ...(osallistuminen.huom ? { huom: osallistuminen.huom } : {}),
        etunimi: k.etunimi,
        sukunimi: k.sukunimi,
        yhdistys: k.yhdistys,
        ikasarja: k.ikasarja,
      })
    }
  }

  return {
    v: SIIRTO_VERSIO,
    tyyppi: 'osa',
    kisaId: kisa.kisaId,
    versio: tunnisteet.versio,
    laiteId: tunnisteet.laiteId,
    ...(tunnisteet.laiteNimi ? { laiteNimi: tunnisteet.laiteNimi } : {}),
    aika: tunnisteet.aika,
    rivit,
  }
}

/**
 * Rakentaa täyden paketin koko kisasta (vuorottelu).
 *
 * Sisältö pidetään tarkoituksella tiiviinä, koska tämä paketti luetaan QR-koodista:
 * laukaukset merkkijonoina, lajien rakenteista vain poikkeavat kentät, eikä kilpailijan
 * nimeä toisteta jokaisella tulosrivillä.
 */
export function rakennaTayspaketti(
  kisa: Kisa,
  tunnisteet: { laiteId: string; laiteNimi?: string; versio: number; aika: string },
): Siirtopaketti {
  const rakenteet: Partial<Record<Laji, TiivisRakenne>> = {}
  for (const laji of LAJI_KOODIT) {
    const m = kisa.asetukset.lajiMaaritykset[laji]
    if (!m) continue
    rakenteet[laji] = {
      kilpasarjoja: m.kilpasarjoja,
      laukauksiaSarjassa: m.laukauksiaSarjassa,
      tulosSaanto: m.tulosSaanto,
    }
  }

  const osa = rakennaOsapaketti(kisa, tunnisteet)
  // Nimet ovat kilpailijalistassa, joten tulosriveillä ne olisivat turhaa toistoa.
  const rivit = (osa.rivit ?? []).map(({ etunimi, sukunimi, yhdistys, ikasarja, ...rivi }) => {
    void etunimi
    void sukunimi
    void yhdistys
    void ikasarja
    return rivi
  })

  return {
    v: SIIRTO_VERSIO,
    tyyppi: 'taysi',
    kisaId: kisa.kisaId,
    versio: tunnisteet.versio,
    laiteId: tunnisteet.laiteId,
    ...(tunnisteet.laiteNimi ? { laiteNimi: tunnisteet.laiteNimi } : {}),
    aika: tunnisteet.aika,
    // RESUL on oletus, joten se jätetään pois — muuten jokainen tavallinen paketti
    // kantaisi turhaa kenttää.
    ...(kisa.tyyppi === 'mukautettu'
      ? { kisaTyyppi: 'mukautettu' as const, mukautetutLajit: kisa.lajit ?? [] }
      : {}),
    kisatiedot: kisa.kisatiedot,
    laskettavatParhaat: kisa.asetukset.laskettavatParhaat,
    rakenteet,
    kilpailijat: kisa.kilpailijat.map((k) => ({
      id: k.id,
      etunimi: k.etunimi,
      sukunimi: k.sukunimi,
      yhdistys: k.yhdistys,
      ikasarja: k.ikasarja,
    })),
    rivit,
  }
}
