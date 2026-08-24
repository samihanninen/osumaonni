/**
 * Reserviläisammunnan tietomalli.
 *
 * TERMISTÖ — virallisissa säännöissä "sarja" tarkoittaa **ikäsarjaa** (H, H50), ja
 * laukaussarjaa kutsutaan **kilpasarjaksi**. Alkuperäinen Excel käytti sanaa "sarja"
 * laukaussarjasta. Tässä koodissa käytetään aina täsmällisiä nimiä `ikasarja` ja
 * `kilpasarja` — pelkkää `sarja`-nimeä ei käytetä missään.
 */

/**
 * RESUL-kisan ammuntalaji. Suljettu joukko, koska nämä ovat virallisia lajeja
 * sääntöineen — mukautetun kisan lajit eivät kuulu tähän tyyppiin.
 */
export type Laji = 'RA1' | 'RA2' | 'RA3' | 'RA4'

/**
 * Lajin tunniste tallennuksessa.
 *
 * RESUL-kisassa tunniste on lajikoodi (`RA1`…`RA4`), mukautetussa kisassa arvottu
 * tunnus. Tunniste ei muutu, vaikka lajin näkyvä nimi vaihdettaisiin — muuten
 * nimenvaihto irrottaisi jo kirjatut tulokset lajistaan.
 */
export type LajiId = string

/**
 * Kisan muoto.
 *
 * - `resul` — RA1–RA4 virallisine sääntöineen. Rakenne tulee säännöistä.
 * - `mukautettu` — järjestäjän itse määrittelemät lajit.
 *
 * Kisa on aina yhtä muotoa. Sekamuotoinen kisa tekisi kokonaiskilpailusta
 * tulkinnanvaraisen, eikä virallisen kisan tulos saa riippua siitä, mitä muuta samaan
 * kisaan on lisätty.
 */
export type KisaTyyppi = 'resul' | 'mukautettu'

/** Aseluokka. Avoimessa luokassa optiikka on sallittu, joten luokat kilpailevat erikseen. */
export type Luokka = 'vakio' | 'avoin'

/** Ikäsarja. */
export type IkaSarja = 'H' | 'H50'

/** RESUL-kisan ikäsarjat. Säännöt, kohta 2 kaikissa neljässä lajissa: "Sarjat: H, H50". */
export const RESUL_SARJAT: readonly IkaSarja[] = ['H', 'H50'] as const

/**
 * Kilpailijan sarja tallennuksessa.
 *
 * RESUL-kisassa `H` tai `H50` sääntöjen mukaan. Mukautetussa kisassa järjestäjän itse
 * nimeämä sarja, jota ei ole pakko sitoa ikään — se voi olla myös esimerkiksi
 * aloittelijat ja konkarit. Nimi on samalla tunniste, koska sarjoja ei ole tarpeen
 * nimetä uudelleen kesken kisan eikä niihin liity muuta tietoa.
 */
export type SarjaId = string

/** Napakympin merkki. Napakymppi on 10 pistettä, mutta se lasketaan erikseen tasatuloksia varten. */
export const NAPAKYMPPI = '*'

/** Ohilaukauksen merkki. */
export const OHI = '-'

/**
 * Yksittäinen laukaus.
 *
 * - `1..10` — osuma, arvo pisteinä
 * - `'*'`   — napakymppi, 10 pistettä
 * - `'-'`   — ohilaukaus, 0 pistettä, **ei ole iskemä**
 * - `0`     — ohilaukaus (sama kuin `'-'`; sallitaan syötön helpottamiseksi)
 * - `null`  — ei vielä syötetty
 */
export type Laukaus = number | typeof NAPAKYMPPI | typeof OHI | null

/** Yhden kilpasarjan laukaukset. Pituus = lajin `laukauksiaSarjassa`. */
export type Kilpasarja = Laukaus[]

/** Miten lajin kilpailutulos muodostuu kilpasarjoista. */
export type TulosSaanto =
  /** Vain paras kilpasarja huomioidaan (RA1, RA3, RA4). */
  | 'paras'
  /** Kaikkien kilpasarjojen summa (RA2). */
  | 'summa'

/** Lajin rakenne. Muokattavissa, koska säännöt muuttuvat. */
export interface LajiMaaritys {
  koodi: Laji
  nimi: string
  kuvaus: string
  ase: string
  kilpasarjoja: number
  laukauksiaSarjassa: number
  tulosSaanto: TulosSaanto
  etaisyys: string
  taulu: string
  asento: string
  /** Koelaukaukset eivät vaikuta tulokseen; tallennetaan vain tiedoksi. */
  koelaukauksia: number
}

/**
 * Yhden kilpasarjan rakenne mukautetussa kisassa.
 *
 * Sarjat määritellään yksitellen, koska ne voivat olla eri mittaisia ja tarkoittaa eri
 * asiaa: kolmen asennon kisassa sarja on asento (makuu, polvi, pysty), kahden kierroksen
 * kisassa pelkkä kierros. Nimi näkyy tuloskortissa, jotta kirjaaja tietää mitä ampuu.
 */
export interface Kilpasarjamaaritys {
  /** Näkyvä nimi, esim. "Makuu". Tyhjänä sarjat numeroidaan. */
  nimi?: string
  laukauksia: number
}

/**
 * Mukautetun kisan laji.
 *
 * Erillinen tyyppi `LajiMaaritys`:stä: RESUL-lajien rakenne on sääntöjen sanelema ja
 * pysyy ennallaan, eikä mukautetun kisan vapaus saa vuotaa sinne.
 */
export interface MukautettuLaji {
  /** Pysyvä tunniste. Ei muutu, vaikka koodi tai nimi vaihdettaisiin. */
  id: LajiId
  /** Lyhenne, joka näkyy välilehdillä ja Excelin sivunimissä, esim. "3-as". */
  koodi: string
  nimi: string
  kilpasarjat: Kilpasarjamaaritys[]
  tulosSaanto: TulosSaanto
  /** Vapaaehtoiset kuvailutiedot; eivät vaikuta laskentaan. */
  kuvaus?: string
  ase?: string
  etaisyys?: string
  taulu?: string
  asento?: string
}

/** Yhden kilpasarjan laukaukset ja yhdistämistä varten tarvittava jäljitystieto. */
export interface KilpasarjaTiedot {
  laukaukset: Kilpasarja
  /** ISO-aikaleima viimeisestä muutoksesta. Käytetään tulosten yhdistämisessä. */
  muokattu?: string
  /** Muutoksen tehneen laitteen tunniste. */
  laiteId?: string
}

/** Kilpailijan osallistuminen yhteen lajiin. */
export interface Osallistuminen {
  /** Aseluokka tässä lajissa. Voi vaihdella lajeittain, koska se seuraa käytettyä asetta. */
  luokka: Luokka
  kilpasarjat: KilpasarjaTiedot[]
  /** Sääntörikkeiden määrä. Jokainen vähentää 2 pistettä lopputuloksesta. */
  rangaistuksia: number
  /** Turvallisuusrike: kilpailija suljetaan pois ja tulos mitätöidään. */
  hylatty: boolean
  huom?: string
}

export interface Kilpailija {
  id: string
  etunimi: string
  /** Erillinen sukunimi on pakollinen: sijoilla 9→ tasatulokset järjestetään sukunimen mukaan. */
  sukunimi: string
  yhdistys: string
  /** Sarja, ks. `SarjaId`. RESUL-kisassa H tai H50. */
  ikasarja: SarjaId
  /** Avaimena lajin tunniste: RESUL-kisassa lajikoodi, mukautetussa lajin `id`. */
  osallistumiset: Partial<Record<LajiId, Osallistuminen>>
}

export interface Kisatiedot {
  nimi: string
  jarjestaja: string
  paikka: string
  pvm: string
  kilpailunjohtaja: string
  tuomari: string
  kirjuri: string
  muistiinpanot: string
}

export interface Asetukset {
  /** Yhdistys- ja joukkuekilpailussa laskettavien parhaiden kilpailijoiden määrä. */
  laskettavatParhaat: number
  /**
   * Järjestetäänkö yhdistys- ja joukkuekilpailu? Säännöt: "Mikäli joukkuekilpailu
   * järjestetään, on siitä mainittava kilpailukutsussa" — se ei siis ole automaattinen.
   *
   * Valinnainen kenttä, jotta ennen tätä tallennetut kisat latautuvat ennallaan.
   * Puuttuva arvo tarkoittaa päällä, koska niin sovellus on siihen asti toiminut.
   */
  joukkuekilpailu?: boolean
  /** Lajikohtaiset rakenteet. Ylikirjoittaa oletukset, jos säännöt muuttuvat. */
  lajiMaaritykset: Record<Laji, LajiMaaritys>
}

export interface Kisa {
  /** Tallennusmuodon versio, ks. `@/core/skeema`. Kasvaa rakenteen muuttuessa. */
  schemaVersion: number
  /** Kisan muoto. Ratkaisee, mistä lajit tulevat ja mitä sääntöjä sovelletaan. */
  tyyppi: KisaTyyppi
  kisaId: string
  kisatiedot: Kisatiedot
  asetukset: Asetukset
  /**
   * Mukautetun kisan sarjat järjestyksessä, esim. "Yleinen" ja "Veteraanit".
   * RESUL-kisassa puuttuu: sarjat tulevat silloin säännöistä (H, H50).
   */
  sarjat?: SarjaId[]
  /**
   * Mukautetun kisan lajit järjestyksessä. RESUL-kisassa tyhjä tai puuttuva: lajit
   * tulevat silloin säännöistä eikä niitä tallenneta erikseen.
   */
  lajit?: MukautettuLaji[]
  kilpailijat: Kilpailija[]
}
