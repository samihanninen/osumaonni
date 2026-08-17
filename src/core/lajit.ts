import type {
  Kilpasarjamaaritys,
  Kisa,
  Laji,
  LajiId,
  LajiMaaritys,
  Luokka,
  MukautettuLaji,
  TulosSaanto,
} from '@/types/kisa'

/**
 * Lajien rakenteet RESUL:n virallisten sääntöjen mukaan.
 *
 * Lähteet: RA1 v1.6 (2025), RA2 v1.6 (2025), RA3 v1.6 (2025), RA4 v1.6 (2025).
 * Kaikki hyväksytty RESUL:n hallituksen kokouksessa marraskuussa 2025.
 *
 * Nämä ovat oletuksia — järjestäjä voi muokata rakennetta asetuksista, koska säännöt
 * muuttuvat. Sarjarakenne on siis dataa, ei koodia.
 */
export const LAJIT: Record<Laji, LajiMaaritys> = {
  RA1: {
    koodi: 'RA1',
    nimi: 'RA1 — Kivääriammunta makuulta',
    kuvaus: 'Kertalaukausten ampuminen makuuasennosta itselataavalla kiväärillä.',
    ase: 'Itselataava kivääri, kaliiperi 5,45–8,00 mm',
    kilpasarjoja: 2,
    laukauksiaSarjassa: 10,
    tulosSaanto: 'paras',
    etaisyys: '150 m',
    taulu: 'PV n:o 03',
    asento: 'Makuu, lipastuki sallittu',
    koelaukauksia: 5,
  },
  RA2: {
    koodi: 'RA2',
    nimi: 'RA2 — Kivääriammunta kääntyviin tauluihin',
    kuvaus:
      'Nopeiden kertalaukausten ja kahden perättäisen laukauksen ampuminen makuuasennosta. ' +
      'Kolme kilpasarjaa: taulu näkyvissä 5 s, 3 s ja 5 s (kaksi laukausta).',
    ase: 'Itselataava kivääri, kaliiperi 5,45–8,00 mm',
    kilpasarjoja: 3,
    laukauksiaSarjassa: 6,
    tulosSaanto: 'summa',
    etaisyys: '150 m',
    taulu: 'PV n:o 03',
    asento: 'Makuu, lipastuki sallittu',
    koelaukauksia: 5,
  },
  RA3: {
    koodi: 'RA3',
    nimi: 'RA3 — Pistooliammunta',
    kuvaus:
      'Kertalaukausten ampuminen seisten yhden tai kahden käden otteella. ' +
      'Ampuma-aika 5 min; avoimessa luokassa 30 s.',
    ase: 'Itselataava pistooli, kaliiperi vähintään 9,00 mm',
    kilpasarjoja: 2,
    laukauksiaSarjassa: 10,
    tulosSaanto: 'paras',
    etaisyys: '25 m',
    taulu: 'PV n:o 04',
    asento: 'Seisten',
    koelaukauksia: 5,
  },
  RA4: {
    koodi: 'RA4',
    nimi: 'RA4 — Pistooliammunta, tuplat',
    kuvaus:
      'Kahden hallitun peräkkäisen laukauksen ampuminen seisten. Taulu näkyvissä 3 s, ' +
      'jona aikana ammutaan kaksi laukausta; viisi tuplaa muodostaa kilpasarjan.',
    ase: 'Itselataava pistooli, kaliiperi vähintään 9,00 mm',
    kilpasarjoja: 2,
    laukauksiaSarjassa: 10,
    tulosSaanto: 'paras',
    etaisyys: '25 m',
    taulu: 'PV n:o 04',
    asento: 'Seisten',
    koelaukauksia: 5,
  },
}

export const LAJI_KOODIT: readonly Laji[] = ['RA1', 'RA2', 'RA3', 'RA4'] as const

/** Kaikissa lajeissa on kaksi aseluokkaa. */
export const LUOKAT: readonly Luokka[] = ['vakio', 'avoin'] as const

export const LUOKKA_NIMET: Record<Luokka, string> = {
  vakio: 'Vakio',
  avoin: 'Avoin',
}

/** Onko annettu merkkijono kelvollinen lajikoodi? Käytetään reitin parametrin tarkistuksessa. */
export function onLaji(arvo: unknown): arvo is Laji {
  return typeof arvo === 'string' && (LAJI_KOODIT as readonly string[]).includes(arvo)
}

/** Lajin kilpalaukausten kokonaismäärä. */
export function laukauksiaYhteensa(m: LajiMaaritys): number {
  return m.kilpasarjoja * m.laukauksiaSarjassa
}

/** Suurin mahdollinen kilpailutulos lajissa. */
export function suurinTulos(m: LajiMaaritys): number {
  const sarjanMaksimi = m.laukauksiaSarjassa * 10
  return m.tulosSaanto === 'paras' ? sarjanMaksimi : sarjanMaksimi * m.kilpasarjoja
}

/** Luo tyhjät kilpasarjat lajin rakenteen mukaan. */
export function tyhjatKilpasarjat(m: LajiMaaritys): null[][] {
  return Array.from({ length: m.kilpasarjoja }, () =>
    Array.from({ length: m.laukauksiaSarjassa }, () => null),
  )
}

/**
 * Lajin rakenne kisan muodosta riippumatta.
 *
 * Yhteinen esitys, jotta syöttö, sijoitukset ja vienti voivat käsitellä RESUL-lajia ja
 * mukautettua lajia samalla koodilla. RESUL-lajin tasainen `kilpasarjoja ×
 * laukauksiaSarjassa` avataan tässä sarjalistaksi; laskenta ei silti muutu, koska se
 * lukee rakenteesta vain `tulosSaanto`-kentän.
 */
export interface LajiRakenne {
  id: LajiId
  koodi: string
  nimi: string
  kilpasarjat: Kilpasarjamaaritys[]
  tulosSaanto: TulosSaanto
}

/** RESUL-lajin määritys yhteiseen muotoon. */
export function resulRakenne(laji: Laji, m: LajiMaaritys): LajiRakenne {
  return {
    id: laji,
    koodi: laji,
    nimi: m.nimi,
    kilpasarjat: Array.from({ length: m.kilpasarjoja }, () => ({
      laukauksia: m.laukauksiaSarjassa,
    })),
    tulosSaanto: m.tulosSaanto,
  }
}

/** Mukautetun lajin määritys yhteiseen muotoon. */
export function mukautettuRakenne(laji: MukautettuLaji): LajiRakenne {
  return {
    id: laji.id,
    koodi: laji.koodi,
    nimi: laji.nimi,
    kilpasarjat: laji.kilpasarjat,
    tulosSaanto: laji.tulosSaanto,
  }
}

/**
 * Kisan lajit järjestyksessä, muodosta riippumatta.
 *
 * Tämä on se sauma, jonka varaan mukautettu kisa rakennetaan: kutsuja ei tiedä kumpaa
 * muotoa kisa on. RESUL-kisassa lajit tulevat säännöistä ja järjestäjän mahdollisista
 * muokkauksista, mukautetussa kisan omasta listasta.
 */
export function kisanLajit(kisa: Pick<Kisa, 'tyyppi' | 'asetukset' | 'lajit'>): LajiRakenne[] {
  if (kisa.tyyppi === 'mukautettu') {
    return (kisa.lajit ?? []).map(mukautettuRakenne)
  }
  return LAJI_KOODIT.map((laji) => resulRakenne(laji, kisa.asetukset.lajiMaaritykset[laji]))
}

/** Lajin kokonaislaukausmäärä yhteisessä muodossa. */
export function rakenteenLaukaukset(r: LajiRakenne): number {
  return r.kilpasarjat.reduce((s, k) => s + k.laukauksia, 0)
}
