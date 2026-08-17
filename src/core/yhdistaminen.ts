import type { Kilpailija, Kisa, Laji, Laukaus, Osallistuminen } from '@/types/kisa'
import { merkitLaukauksiksi, type SiirtoRivi, type Siirtopaketti } from '@/io/siirto'
import { LAJIT, LAJI_KOODIT } from './lajit'
import { KISA_SKEEMA_VERSIO } from './skeema'
import { uusiId } from './tunnus'

/**
 * Tulosten yhdistäminen laitteiden välillä.
 *
 * Perusperiaate: **ristiriitaa ei koskaan ratkaista huomaamatta.** Tyhjän päälle
 * kirjoitetaan vapaasti, samanlainen tulos on tyhjä toimenpide, mutta jos kaksi laitetta
 * on kirjannut samaan kilpasarjaan eri tuloksen, käyttäjä päättää kumpi jää voimaan.
 * Väärä automaattinen valinta tarkoittaisi kadonnutta tulosta, jota kukaan ei huomaa.
 */

export type RistiriidanValinta = 'oma' | 'saapuva'

export interface Ristiriita {
  /** Yksilöivä avain valintojen välittämiseen. */
  avain: string
  kilpailijaId: string
  nimi: string
  laji: Laji
  kilpasarja: number
  oma: Laukaus[]
  saapuva: Laukaus[]
  omaPisteet: number
  saapuvaPisteet: number
}

export interface YhdistamisTulos {
  /** Yhdistetty kisa. Alkuperäistä ei muuteta. */
  kisa: Kisa
  ristiriidat: Ristiriita[]
  /** Kilpailijat, joita ei ollut ennestään. */
  lisatytKilpailijat: string[]
  /** Montako kilpasarjaa sai uutta tietoa. */
  paivitetytSarjat: number
  /** Montako kilpasarjaa oli jo samanlainen. */
  samatSarjat: number
  /** Onko saapuva paketti vanhempi kuin oma tila? */
  vanhempiVersio: boolean
}

export class YhdistamisVirhe extends Error {
  constructor(viesti: string) {
    super(viesti)
    this.name = 'YhdistamisVirhe'
  }
}

/** Onko kilpasarja tyhjä eli ei sisällä yhtään syötettyä laukausta? */
function onTyhja(laukaukset: Laukaus[]): boolean {
  return laukaukset.every((l) => l === null || l === undefined)
}

function samat(a: Laukaus[], b: Laukaus[]): boolean {
  if (a.length !== b.length) return false
  return a.every((arvo, i) => arvo === b[i])
}

/** Karkea pistesumma näytettäväksi ristiriidassa. */
function pisteet(laukaukset: Laukaus[]): number {
  return laukaukset.reduce<number>((summa, l) => {
    if (l === '*') return summa + 10
    if (typeof l === 'number' && l >= 1) return summa + Math.min(l, 10)
    return summa
  }, 0)
}

export function ristiriidanAvain(kilpailijaId: string, laji: Laji, kilpasarja: number): string {
  return `${kilpailijaId}|${laji}|${kilpasarja}`
}

/** Kilpailijan tunnistus nimen ja yhdistyksen perusteella, kun tunniste ei täsmää. */
function nimiAvain(sukunimi: string, etunimi: string, yhdistys: string): string {
  return [sukunimi, etunimi, yhdistys].map((osa) => osa.trim().toLocaleLowerCase('fi')).join('|')
}

/**
 * Syväkopio kisasta.
 *
 * Käytetään tarkoituksella JSON-kierrosta eikä `structuredClone`ia: sovelluksesta tuleva
 * kisa on Vuen reaktiivinen välityskohde (Proxy), jota `structuredClone` ei osaa kopioida
 * vaan heittää DataCloneErrorin. Kisan tietomalli on puhdasta JSON-dataa — ei
 * päivämääriä, Map-rakenteita eikä funktioita — joten JSON-kierros on tarkka kopio ja
 * purkaa samalla reaktiivisuuden. Tämä moduuli pysyy näin myös riippumattomana Vuesta.
 */
function kopioi(kisa: Kisa): Kisa {
  return JSON.parse(JSON.stringify(kisa)) as Kisa
}

/** Luo tyhjän osallistumisen lajin rakenteen mukaan. */
function tyhjaOsallistuminen(kisa: Kisa, laji: Laji, rivi: SiirtoRivi): Osallistuminen {
  const maaritys = kisa.asetukset.lajiMaaritykset[laji] ?? LAJIT[laji]
  return {
    luokka: rivi.luokka,
    kilpasarjat: Array.from({ length: maaritys.kilpasarjoja }, () => ({
      laukaukset: Array.from({ length: maaritys.laukauksiaSarjassa }, () => null),
    })),
    rangaistuksia: 0,
    hylatty: false,
  }
}

export interface YhdistaOptiot {
  /** Käyttäjän tekemät ristiriitavalinnat avaimen mukaan. */
  valinnat?: Map<string, RistiriidanValinta>
  /** Salli yhdistäminen, vaikka kisatunnus poikkeaa. Oletuksena ei. */
  salliEriKisa?: boolean
}

/**
 * Yhdistää saapuvan paketin omaan kisaan.
 *
 * Funktio on puhdas: se ei muuta annettua kisaa vaan palauttaa uuden. Ilman valintoja
 * ristiriidat jäävät soveltamatta ja palautetaan listana, jotta käyttöliittymä voi
 * näyttää ne rinnakkain ennen kuin mitään korvataan.
 */
export function yhdista(
  oma: Kisa,
  paketti: Siirtopaketti,
  optiot: YhdistaOptiot = {},
): YhdistamisTulos {
  const { valinnat, salliEriKisa = false } = optiot

  /*
   * Täysi paketti korvaa koko kisan, myös kisatunnuksen — se on luovutuksen koko idea.
   * Tunnusten vertaaminen ennen korvaamista estäisi luovutuksen juuri siinä tilanteessa,
   * jota varten se on olemassa: vastaanottajalla ei vielä ole samaa kisaa.
   */
  if (paketti.tyyppi === 'taysi') {
    return yhdistaTaysi(oma, paketti)
  }

  /*
   * Osittaisessa paketissa tunnus tarkistetaan, koska toisen kisan tulosten sulauttaminen
   * omiin sotkisi tulokset. Tarkistuksen voi ohittaa tietoisesti, jolloin kilpailijat
   * tunnistetaan nimen ja yhdistyksen perusteella.
   */
  if (!salliEriKisa && paketti.kisaId !== oma.kisaId) {
    throw new YhdistamisVirhe(
      'Koodi kuuluu eri kisaan. Jos laitteille on perustettu kisa erikseen, lähetä ensin ' +
        '"koko kisa" toiselle laitteelle — silloin molemmilla on sama kisa ja tulokset ' +
        'yhdistyvät oikein.',
    )
  }

  const tulos = kopioi(oma)
  const ristiriidat: Ristiriita[] = []
  const lisatyt: string[] = []
  let paivitetyt = 0
  let samatMaara = 0

  for (const rivi of paketti.rivit ?? []) {
    let kilpailija = tulos.kilpailijat.find((k) => k.id === rivi.id)

    /*
     * Jos tunnistetta ei löydy, kokeillaan nimeä ja yhdistystä. Laitteet arpovat omat
     * tunnisteensa, joten erikseen perustetuissa kisoissa sama henkilö on eri tunnuksella
     * kummallakin. Ilman tätä yhdistäminen loisi jokaisesta kilpailijasta kaksoiskappaleen.
     */
    if (!kilpailija && (rivi.sukunimi || rivi.etunimi)) {
      const avain = nimiAvain(rivi.sukunimi ?? '', rivi.etunimi ?? '', rivi.yhdistys ?? '')
      kilpailija = tulos.kilpailijat.find(
        (k) => nimiAvain(k.sukunimi, k.etunimi, k.yhdistys) === avain,
      )
    }

    // Tuntematon kilpailija: lisätään, jos paketissa on nimitiedot mukana.
    if (!kilpailija) {
      if (!rivi.sukunimi && !rivi.etunimi) continue
      kilpailija = {
        id: rivi.id || uusiId(),
        etunimi: rivi.etunimi ?? '',
        sukunimi: rivi.sukunimi ?? '',
        yhdistys: rivi.yhdistys ?? '',
        ikasarja: rivi.ikasarja === 'H50' ? 'H50' : 'H',
        osallistumiset: {},
      }
      tulos.kilpailijat.push(kilpailija)
      lisatyt.push(kilpailija.id)
    }

    let osallistuminen = kilpailija.osallistumiset[rivi.laji]
    if (!osallistuminen) {
      osallistuminen = tyhjaOsallistuminen(tulos, rivi.laji, rivi)
      kilpailija.osallistumiset[rivi.laji] = osallistuminen
    }

    rivi.sarjat.forEach((merkit, indeksi) => {
      const saapuva = merkitLaukauksiksi(merkit)
      const kohde = osallistuminen.kilpasarjat[indeksi]
      if (!kohde) return

      // Saapuva tyhjä: ei ole mitään lisättävää.
      if (onTyhja(saapuva)) return

      // Oma tyhjä: otetaan saapuva sellaisenaan.
      if (onTyhja(kohde.laukaukset)) {
        kohde.laukaukset = saapuva
        kohde.muokattu = paketti.aika
        kohde.laiteId = paketti.laiteId
        paivitetyt++
        return
      }

      if (samat(kohde.laukaukset, saapuva)) {
        samatMaara++
        return
      }

      // Aito ristiriita.
      const avain = ristiriidanAvain(kilpailija.id, rivi.laji, indeksi)
      const valinta = valinnat?.get(avain)
      if (valinta === 'saapuva') {
        kohde.laukaukset = saapuva
        kohde.muokattu = paketti.aika
        kohde.laiteId = paketti.laiteId
        paivitetyt++
        return
      }
      if (valinta === 'oma') return

      ristiriidat.push({
        avain,
        kilpailijaId: kilpailija.id,
        nimi: `${kilpailija.sukunimi}, ${kilpailija.etunimi}`.replace(/^, |, $/, ''),
        laji: rivi.laji,
        kilpasarja: indeksi,
        oma: [...kohde.laukaukset],
        saapuva,
        omaPisteet: pisteet(kohde.laukaukset),
        saapuvaPisteet: pisteet(saapuva),
      })
    })

    /*
     * Rangaistukset ja hylkäys: otetaan käyttöön ankarampi arvo. Nämä ovat tuomarin
     * merkintöjä, ja niiden katoaminen yhdistämisessä olisi pahempi virhe kuin se, että
     * merkintä säilyy molemmilla laitteilla.
     */
    osallistuminen.rangaistuksia = Math.max(osallistuminen.rangaistuksia, rivi.rangaistuksia)
    osallistuminen.hylatty = osallistuminen.hylatty || rivi.hylatty
    if (rivi.huom && !osallistuminen.huom) osallistuminen.huom = rivi.huom
  }

  return {
    kisa: tulos,
    ristiriidat,
    lisatytKilpailijat: lisatyt,
    paivitetytSarjat: paivitetyt,
    samatSarjat: samatMaara,
    vanhempiVersio: false,
  }
}

/**
 * Täysi paketti korvaa koko kisan (vuorottelu).
 *
 * Versionumeroa verrataan, jotta vanhemman tilan kirjoittaminen uudemman päälle
 * havaitaan. Se on vuorottelun klassinen vahinko: laite lukee vanhan koodin ja pyyhkii
 * juuri kirjatut tulokset. Päätöksen tekee käyttäjä, mutta tieto on annettava.
 */
/**
 * Rakentaa kisan täydestä paketista.
 *
 * Paketti on tarkoituksella tiivis, jotta se mahtuu QR-koodiin: lajien nimet, kuvaukset
 * ja etäisyydet täydennetään vastaanottajan omista oletuksista, ja vain rakenteelliset
 * kentät tulevat mukana.
 */
function rakennaKisaPaketista(paketti: Siirtopaketti): Kisa {
  const lajiMaaritykset = structuredClone(LAJIT)
  for (const laji of LAJI_KOODIT) {
    const r = paketti.rakenteet?.[laji]
    if (r) Object.assign(lajiMaaritykset[laji], r)
  }

  const kilpailijat: Kilpailija[] = (paketti.kilpailijat ?? []).map((k) => ({
    id: k.id,
    etunimi: k.etunimi,
    sukunimi: k.sukunimi,
    yhdistys: k.yhdistys,
    ikasarja: k.ikasarja === 'H50' ? 'H50' : 'H',
    osallistumiset: {},
  }))

  const indeksi = new Map(kilpailijat.map((k) => [k.id, k]))

  for (const rivi of paketti.rivit ?? []) {
    const kilpailija = indeksi.get(rivi.id)
    if (!kilpailija) continue
    kilpailija.osallistumiset[rivi.laji] = {
      luokka: rivi.luokka,
      kilpasarjat: rivi.sarjat.map((merkit) => ({ laukaukset: merkitLaukauksiksi(merkit) })),
      rangaistuksia: rivi.rangaistuksia,
      hylatty: rivi.hylatty,
      ...(rivi.huom ? { huom: rivi.huom } : {}),
    }
  }

  return {
    schemaVersion: KISA_SKEEMA_VERSIO,
    // Puuttuva muoto tarkoittaa RESUL-kisaa; lähettäjä jättää sen pois oletustapauksessa.
    tyyppi: paketti.kisaTyyppi ?? 'resul',
    ...(paketti.mukautetutLajit ? { lajit: paketti.mukautetutLajit } : {}),
    kisaId: paketti.kisaId,
    kisatiedot: paketti.kisatiedot ?? {
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
      laskettavatParhaat: paketti.laskettavatParhaat ?? 3,
      lajiMaaritykset,
    },
    kilpailijat,
  }
}

function yhdistaTaysi(oma: Kisa, paketti: Siirtopaketti): YhdistamisTulos {
  if (!paketti.kilpailijat) {
    throw new YhdistamisVirhe('Täysi paketti ei sisältänyt kilpailijoita.')
  }

  const omaVersio = laskeVersio(oma)
  const vanhempi = paketti.versio < omaVersio

  return {
    kisa: rakennaKisaPaketista(paketti),
    ristiriidat: [],
    lisatytKilpailijat: [],
    paivitetytSarjat: 0,
    samatSarjat: 0,
    vanhempiVersio: vanhempi,
  }
}

/**
 * Karkea versionumero kisan sisällöstä: syötettyjen laukausten määrä.
 *
 * Tämä riittää vuorottelun suojaksi. Se kasvaa aina kun kirjataan lisää, joten
 * pienempi luku tarkoittaa käytännössä vanhempaa tilaa. Se ei kasva, jos laukauksia
 * pelkästään korjataan — siksi lopullinen päätös jätetään käyttäjälle.
 */
export function laskeVersio(kisa: Kisa): number {
  let n = 0
  for (const k of kisa.kilpailijat) {
    for (const osallistuminen of Object.values(k.osallistumiset)) {
      if (!osallistuminen) continue
      for (const sarja of osallistuminen.kilpasarjat) {
        for (const laukaus of sarja.laukaukset) {
          if (laukaus !== null && laukaus !== undefined) n++
        }
      }
    }
  }
  return n
}

/** Yhteenveto paketista ennen yhdistämistä. */
export interface PakettiYhteenveto {
  tyyppi: Siirtopaketti['tyyppi']
  laiteNimi: string
  aika: string
  kilpailijoita: number
  lajit: Laji[]
  eriKisa: boolean
}

export function kuvaaPaketti(paketti: Siirtopaketti, oma: Kisa): PakettiYhteenveto {
  const lajit = new Set<Laji>()
  let kilpailijoita = 0

  if (paketti.tyyppi === 'taysi') {
    kilpailijoita = paketti.kilpailijat?.length ?? 0
    for (const rivi of paketti.rivit ?? []) lajit.add(rivi.laji)
  } else {
    const idt = new Set<string>()
    for (const rivi of paketti.rivit ?? []) {
      idt.add(rivi.id)
      lajit.add(rivi.laji)
    }
    kilpailijoita = idt.size
  }

  return {
    tyyppi: paketti.tyyppi,
    laiteNimi: paketti.laiteNimi || 'Tuntematon laite',
    aika: paketti.aika,
    kilpailijoita,
    lajit: [...lajit].sort(),
    eriKisa: paketti.kisaId !== oma.kisaId,
  }
}

/** Kilpailijan nimi tunnisteen perusteella, jos se löytyy. */
export function kilpailijanNimi(kisa: Kisa, id: string): string | undefined {
  const k: Kilpailija | undefined = kisa.kilpailijat.find((x) => x.id === id)
  return k ? `${k.sukunimi}, ${k.etunimi}`.replace(/^, |, $/, '') : undefined
}
