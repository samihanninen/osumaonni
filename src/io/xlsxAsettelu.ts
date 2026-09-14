/** Tiedostomuodon versio. Kasvatetaan, jos asettelu muuttuu yhteensopimattomasti. */
export const TIEDOSTO_VERSIO = 1

export const SOVELLUS_NIMI = 'OsumaOnni'

export const META_VALILEHTI = '_meta'
export const KISATIEDOT_VALILEHTI = 'Kisatiedot'
export const YHDISTYKSET_VALILEHTI = 'Yhdistykset'

/**
 * Excelin sivunimen rajoitukset.
 *
 * Nimi on enintään 31 merkkiä eikä siinä saa olla merkkejä `: \ / ? * [ ]`. Mukautetun
 * kisan lajikoodi on käyttäjän kirjoittamaa tekstiä, joten se voi rikkoa kumpaakin
 * sääntöä — kielletty merkki saisi Excelin hylkäämään koko tiedoston.
 */
const SIVUNIMEN_MAKSIMI = 31
const KIELLETYT = /[:\\/?*[\]]/g

export function puhdistaSivunNimi(nimi: string, oletus = 'Laji'): string {
  const siisti = nimi.replace(KIELLETYT, '-').replace(/\s+/g, ' ').trim()
  // Excel ei hyväksy myöskään heittomerkkiä nimen alussa tai lopussa.
  const ilmanHeittomerkkeja = siisti.replace(/^'+|'+$/g, '')
  return (ilmanHeittomerkkeja || oletus).slice(0, SIVUNIMEN_MAKSIMI)
}

/**
 * Tekee nimestä uniikin. Excel vertaa sivunimiä kirjainkoosta riippumatta, ja kaksi
 * samannimistä lajia on mukautetussa kisassa täysin mahdollista.
 */
export function uniikkiSivunNimi(ehdotus: string, kaytetyt: Set<string>): string {
  const perus = puhdistaSivunNimi(ehdotus)
  if (!kaytetyt.has(perus.toLowerCase())) {
    kaytetyt.add(perus.toLowerCase())
    return perus
  }
  for (let n = 2; n < 1000; n++) {
    const pate = ` (${n})`
    const ehdokas = perus.slice(0, SIVUNIMEN_MAKSIMI - pate.length) + pate
    if (!kaytetyt.has(ehdokas.toLowerCase())) {
      kaytetyt.add(ehdokas.toLowerCase())
      return ehdokas
    }
  }
  return perus
}

export function tuloskorttiNimi(koodi: string): string {
  return puhdistaSivunNimi(`Tuloskortti ${koodi}`)
}

export function sijoituksetNimi(koodi: string): string {
  return puhdistaSivunNimi(`Sijoitukset ${koodi}`)
}

/** Sarakenumero (1 = A) kirjaimeksi. ExcelJS ei tarjoa tätä julkisesti. */
export function sarakeKirjain(numero: number): string {
  let n = numero
  let tulos = ''
  while (n > 0) {
    const jaannos = (n - 1) % 26
    tulos = String.fromCharCode(65 + jaannos) + tulos
    n = Math.floor((n - 1) / 26)
  }
  return tulos
}

/** Solun A1-viittaus. */
export function solu(rivi: number, sarake: number): string {
  return `${sarakeKirjain(sarake)}${rivi}`
}

/** Alue A1:B2 -muodossa. */
export function alue(rivi: number, alkuSarake: number, loppuSarake: number): string {
  return `${solu(rivi, alkuSarake)}:${solu(rivi, loppuSarake)}`
}

/** Yhden sarakkeen pystyalue kiinteillä viittauksilla, esim. `$B$4:$B$20`. */
export function sarakeAlue(sarake: number, alkuRivi: number, loppuRivi: number): string {
  const kirjain = sarakeKirjain(sarake)
  return `${kirjain}${alkuRivi}:${kirjain}${loppuRivi}`
}

/**
 * Välilehtiviittauksen etuliite, esim. `'Tuloskortti RA1'!`.
 *
 * Nimi lainausmerkeissä aina: mukautetun kisan lajikoodi voi sisältää välilyöntejä tai
 * numeron alussa, jolloin lainaamaton nimi rikkoisi kaavan. Heittomerkki nimen sisällä
 * kahdennetaan Excelin sääntöjen mukaan.
 */
export function sivuViite(nimi: string): string {
  return `'${nimi.replace(/'/g, "''")}'!`
}

export const OTSIKKO_RIVI = 3
export const ENSIMMAINEN_DATARIVI = 4

/** Kilpailijan perustiedot ennen laukaussarakkeita. */
export const PERUSSARAKKEET = [
  '#',
  'Sukunimi',
  'Etunimi',
  'Yhdistys',
  'Ikäsarja',
  'Luokka',
] as const

/**
 * Tuloskortin sarakeasettelu. Lasketaan lajin rakenteesta, koska sarjojen ja laukausten
 * määrä on asetus eikä vakio. Sama asettelu ohjaa sekä vientiä että tuontia.
 */
export interface Asettelu {
  /** Kilpasarjojen määrä. */
  kilpasarjoja: number
  /** Laukausten määrä kilpasarjassa `s`. Sarjat voivat olla eri mittaisia. */
  laukauksia: (s: number) => number
  /** Pisin kilpasarja. Otsikkorivin laukausnumerot kirjoitetaan tähän asti. */
  pisin: number
  /** Ensimmäinen laukaussarake kilpasarjassa `s` (0-alkuinen). */
  laukausAlku: (s: number) => number
  laukausLoppu: (s: number) => number
  sarjaYht: (s: number) => number
  sarjaNavat: (s: number) => number
  sarjaIskemat: (s: number) => number
  tulos: number
  iskemat: number
  navat: number
  rikkeet: number
  hylatty: number
  huom: number
  /** Piilotettu sarake kilpailijan tunnisteelle, jotta tuonti osuu oikeaan riviin. */
  tunnus: number
  leveys: number
}

/** Kolme johdettua saraketta kilpasarjaa kohti: Yht, ★ ja Isk. */
const JOHDETUT_PER_SARJA = 3

/**
 * Tuloskortin asettelu lajin rakenteesta.
 *
 * Sarjat voivat olla eri mittaisia, joten sarakkeiden paikat lasketaan sarjojen
 * pituuksista kumulatiivisesti — ei kertolaskuna, joka pätisi vain tasamittaisiin.
 */
export function luoAsettelu(rakenne: { kilpasarjat: readonly { laukauksia: number }[] }): Asettelu {
  const perus = PERUSSARAKKEET.length
  const pituudet = rakenne.kilpasarjat.map((k) => k.laukauksia)
  const kilpasarjoja = pituudet.length

  // Kumulatiiviset alkusarakkeet: jokainen sarja vie laukauksensa + kolme johdettua.
  const alut: number[] = []
  let sarake = perus + 1
  for (const pituus of pituudet) {
    alut.push(sarake)
    sarake += pituus + JOHDETUT_PER_SARJA
  }

  const laukauksia = (s: number) => pituudet[s] ?? 0
  const laukausAlku = (s: number) => alut[s] ?? perus + 1
  const laukausLoppu = (s: number) => laukausAlku(s) + laukauksia(s) - 1
  const sarjaYht = (s: number) => laukausLoppu(s) + 1
  const sarjaNavat = (s: number) => laukausLoppu(s) + 2
  const sarjaIskemat = (s: number) => laukausLoppu(s) + 3

  const jalkeen = sarake - 1
  const tulos = jalkeen + 1
  const iskemat = jalkeen + 2
  const navat = jalkeen + 3
  const rikkeet = jalkeen + 4
  const hylatty = jalkeen + 5
  const huom = jalkeen + 6
  const tunnus = jalkeen + 7

  return {
    kilpasarjoja,
    laukauksia,
    pisin: pituudet.reduce((s, p) => Math.max(s, p), 0),
    laukausAlku,
    laukausLoppu,
    sarjaYht,
    sarjaNavat,
    sarjaIskemat,
    tulos,
    iskemat,
    navat,
    rikkeet,
    hylatty,
    huom,
    tunnus,
    leveys: tunnus,
  }
}

/**
 * Kuinka monta tyhjää varariviä tuloskorttiin kirjoitetaan valmiiksi kaavojen kanssa.
 *
 * Tuonti osaa lukea käsin lisätyn rivin (ks. `nimiAvain`), joten järjestäjä voi lisätä
 * ampujan suoraan Exceliin. Ilman valmiita kaavoja lisätyn rivin tulos jäisi tyhjäksi
 * eikä hän näkyisi sijoituksissa lainkaan.
 */
export const VARARIVIT = 5

/**
 * COUNTIF-ehto napakympille.
 *
 * Tähti on COUNTIFin jokerimerkki, joka tarkoittaa "mitä tahansa tekstiä". Pelkkä `"*"`
 * laski siis myös ohilaukaukset (`-`) napakympeiksi ja lisäsi jokaisesta kymmenen
 * pistettä. Tilde pakottaa tulkitsemaan tähden kirjaimellisena merkkinä.
 */
const NAPA_EHTO = '"~*"'

/** Sijoitussivun kiinteät sarakkeet ennen kilpasarjoja. */
export const SIJOITUS_PERUS = [
  'Luokka',
  'Sija',
  'Sukunimi',
  'Etunimi',
  'Yhdistys',
  'Ikäsarja',
] as const

/**
 * Sijoitussivun piilotetut apusarakkeet kirjoitusjärjestyksessä.
 *
 * Kahdeksan ensimmäistä pitävät sijoituslistan järjestyksessä. Viisi viimeistä ovat
 * yhdistys- ja kokonaiskilpailua varten: ne poimivat samalta riviltä sen tiedon, jota
 * koostesivu tarvitsee, jottei koostesivun tarvitse tuntea tuloskortin rakennetta.
 */
export const SIJOITUS_APUSARAKKEET = [
  '_luokka',
  '_avain',
  '_avain2',
  '_rivi',
  '_tulos',
  '_jarjestys',
  '_sija',
  '_osoite',
  '_yhdistys',
  '_yhdSija',
  '_yhdAvain',
  '_hloAvain',
  '_hloPisteet',
] as const

export type SijoitusApusarake = (typeof SIJOITUS_APUSARAKKEET)[number]

export interface SijoitusAsettelu {
  luokka: number
  sija: number
  sukunimi: number
  etunimi: number
  yhdistys: number
  ikasarja: number
  /** Kilpasarjan `s` pistesarake. */
  sarja: (s: number) => number
  tulos: number
  iskemat: number
  navat: number
  /** Näkyvän taulukon viimeinen sarake. */
  leveys: number
  apuAlku: number
  apu: Record<SijoitusApusarake, number>
}

/**
 * Sijoitussivun sarakeasettelu. Omana funktionaan, koska yhdistyssivu viittaa samoihin
 * apusarakkeisiin eikä saa arvata niiden paikkoja.
 */
export function luoSijoitusAsettelu(kilpasarjoja: number): SijoitusAsettelu {
  const perus = SIJOITUS_PERUS.length
  const tulos = perus + kilpasarjoja + 1
  const navat = tulos + 2
  // Apusarakkeet jäävät näkyvän taulukon oikealle puolelle yhden tyhjän sarakkeen taakse.
  const apuAlku = navat + 2

  const apu = Object.fromEntries(
    SIJOITUS_APUSARAKKEET.map((nimi, i) => [nimi, apuAlku + i]),
  ) as Record<SijoitusApusarake, number>

  return {
    luokka: 1,
    sija: 2,
    sukunimi: 3,
    etunimi: 4,
    yhdistys: 5,
    ikasarja: 6,
    sarja: (s: number) => perus + 1 + s,
    tulos,
    iskemat: tulos + 1,
    navat,
    leveys: navat,
    apuAlku,
    apu,
  }
}

/**
 * Kaavat johdetuille sarakkeille. Käytetään tarkoituksella tavallisia funktioita
 * (SUMIF/COUNTIF) eikä taulukkokaavoja: alkuperäisen Excelin SUMPRODUCT(IF(...))
 * vaatii uudemman Excelin, ja SORTBY/FILTER-tyyliset kaavat eivät ole ExcelJS:llä
 * luotettavasti kirjoitettavissa.
 *
 * Jokainen kaava palauttaa tyhjän, jos riville ei ole syötetty mitään. Muuten
 * tuloskortin varariveille jäisi nollia, eikä sijoitussivu erottaisi aloittamatonta
 * kilpailijaa nollan ampuneesta.
 */
export const KAAVAT = {
  /** Sarjan pisteet: numerot ≥ 1 plus napakympit kymppeinä. */
  sarjaYht(alueViite: string): string {
    return `IF(COUNTA(${alueViite})=0,"",SUMIF(${alueViite},">=1")+COUNTIF(${alueViite},${NAPA_EHTO})*10)`
  },
  /** Napakymppien määrä. */
  navat(alueViite: string): string {
    return `IF(COUNTA(${alueViite})=0,"",COUNTIF(${alueViite},${NAPA_EHTO}))`
  },
  /** Iskemien määrä: osumat numerorenkaisiin, eli numerot ≥ 1 ja napakympit. */
  iskemat(alueViite: string): string {
    return `IF(COUNTA(${alueViite})=0,"",COUNTIF(${alueViite},">=1")+COUNTIF(${alueViite},${NAPA_EHTO}))`
  },
  /**
   * Kilpailutulos. Rangaistus on 2 pistettä kerrallaan, hylätyn tulos on 0, eikä
   * tulos voi mennä negatiiviseksi.
   */
  tulos(yhtSolut: string[], rikeSolu: string, hylattySolu: string, summa: boolean): string {
    const lista = yhtSolut.join(',')
    const pohja = summa ? `SUM(${lista})` : `MAX(${lista})`
    return `IF(COUNT(${lista})=0,"",IF(${hylattySolu}="x",0,MAX(0,${pohja}-2*N(${rikeSolu}))))`
  },
  /** Iskemien tai napakymppien summa kaikista kilpasarjoista ('summa'-lajit). */
  yhteensa(solut: string[]): string {
    const lista = solut.join(',')
    return `IF(COUNT(${lista})=0,"",SUM(${lista}))`
  },
  /**
   * Iskemät tai napakympit paremmasta kilpasarjasta ('paras'-lajit, kaksi sarjaa).
   *
   * N() ympärillä siksi, että kesken jääneen sarjan yhteissumma on tyhjä teksti — ja
   * Excelissä mikä tahansa teksti on suurempi kuin mikä tahansa luku, joten paljas
   * vertailu valitsisi tyhjän sarjan.
   */
  parempiSarjasta(yhtA: string, yhtB: string, arvoA: string, arvoB: string): string {
    return `IF(COUNT(${yhtA},${yhtB})=0,"",IF(N(${yhtA})>=N(${yhtB}),${arvoA},${arvoB}))`
  },
}
