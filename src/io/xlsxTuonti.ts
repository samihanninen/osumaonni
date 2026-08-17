import type { Cell, Workbook, Worksheet } from 'exceljs'
import type {
  IkaSarja,
  Kilpailija,
  Kisa,
  Laji,
  LajiMaaritys,
  Laukaus,
  Luokka,
  Osallistuminen,
  TulosSaanto,
} from '@/types/kisa'
import { LAJIT, LAJI_KOODIT } from '@/core/lajit'
import { KISA_SKEEMA_VERSIO } from '@/core/skeema'
import { jasennaLaukaus } from '@/core/laukaus'
import { lyhytTunnus, uusiId } from '@/core/tunnus'
import {
  ENSIMMAINEN_DATARIVI,
  KISATIEDOT_VALILEHTI,
  META_VALILEHTI,
  TIEDOSTO_VERSIO,
  luoAsettelu,
  tuloskorttiNimi,
} from './xlsxAsettelu'

export class TuontiVirhe extends Error {
  constructor(viesti: string) {
    super(viesti)
    this.name = 'TuontiVirhe'
  }
}

/** Solun arvo tekstinä. Kaavasolusta luetaan laskettu tulos, ei kaavaa. */
function teksti(cell: Cell | undefined): string {
  if (!cell) return ''
  const arvo = cell.value
  if (arvo === null || arvo === undefined) return ''
  if (typeof arvo === 'object') {
    if ('result' in arvo && arvo.result !== undefined && arvo.result !== null) {
      return String(arvo.result)
    }
    if ('text' in arvo && typeof arvo.text === 'string') return arvo.text
    if ('richText' in arvo && Array.isArray(arvo.richText)) {
      return arvo.richText.map((r) => r.text).join('')
    }
    return ''
  }
  return String(arvo)
}

function luku(cell: Cell | undefined, oletus = 0): number {
  const t = teksti(cell).trim().replace(',', '.')
  if (t === '') return oletus
  const n = Number(t)
  return Number.isFinite(n) ? n : oletus
}

/** Lukee `_meta`-välilehden avain–arvo-parit ja lajien rakenteet. */
function lueMeta(wb: Workbook) {
  const ws = wb.getWorksheet(META_VALILEHTI)
  if (!ws) {
    throw new TuontiVirhe(
      'Tiedostosta puuttuu _meta-välilehti. Onko tiedosto viety tästä sovelluksesta?',
    )
  }

  const parit = new Map<string, string>()
  const rakenteet = new Map<
    Laji,
    { kilpasarjoja: number; laukauksiaSarjassa: number; tulosSaanto: TulosSaanto }
  >()

  ws.eachRow((rivi) => {
    const a = teksti(rivi.getCell(1)).trim()
    if (!a) return
    if ((LAJI_KOODIT as readonly string[]).includes(a)) {
      const kilpasarjoja = luku(rivi.getCell(2), 0)
      const laukauksiaSarjassa = luku(rivi.getCell(3), 0)
      const saanto = teksti(rivi.getCell(4)).trim()
      if (kilpasarjoja > 0 && laukauksiaSarjassa > 0) {
        rakenteet.set(a as Laji, {
          kilpasarjoja,
          laukauksiaSarjassa,
          tulosSaanto: saanto === 'summa' ? 'summa' : 'paras',
        })
      }
      return
    }
    parit.set(a, teksti(rivi.getCell(2)).trim())
  })

  const versio = Number(parit.get('tiedostoVersio') ?? '0')
  if (!Number.isFinite(versio) || versio < 1) {
    throw new TuontiVirhe('Tiedoston versiotietoa ei voitu lukea.')
  }
  if (versio > TIEDOSTO_VERSIO) {
    throw new TuontiVirhe(
      `Tiedosto on tehty uudemmalla sovellusversiolla (muoto ${versio}, tuettu ${TIEDOSTO_VERSIO}). ` +
        'Päivitä sovellus ennen tuontia.',
    )
  }

  return { parit, rakenteet }
}

function lueKisatiedot(wb: Workbook): Kisa['kisatiedot'] {
  const tyhja: Kisa['kisatiedot'] = {
    nimi: '',
    jarjestaja: '',
    paikka: '',
    pvm: '',
    kilpailunjohtaja: '',
    tuomari: '',
    kirjuri: '',
    muistiinpanot: '',
  }
  const ws = wb.getWorksheet(KISATIEDOT_VALILEHTI)
  if (!ws) return tyhja

  const kentat: Record<string, keyof Kisa['kisatiedot']> = {
    'kisan nimi': 'nimi',
    järjestäjä: 'jarjestaja',
    kilpailupaikka: 'paikka',
    päivämäärä: 'pvm',
    kilpailunjohtaja: 'kilpailunjohtaja',
    tuomari: 'tuomari',
    kirjuri: 'kirjuri',
    muistiinpanot: 'muistiinpanot',
  }

  ws.eachRow((rivi) => {
    const avain = teksti(rivi.getCell(1)).trim().toLowerCase()
    const kentta = kentat[avain]
    if (kentta) tyhja[kentta] = teksti(rivi.getCell(2))
  })
  return tyhja
}

function onLuokka(arvo: string): arvo is Luokka {
  return arvo === 'vakio' || arvo === 'avoin'
}

function onIkasarja(arvo: string): arvo is IkaSarja {
  return arvo === 'H' || arvo === 'H50'
}

/** Avain kilpailijan tunnistamiseen, kun Tunnus-sarake on tyhjä (käsin lisätty rivi). */
function nimiAvain(sukunimi: string, etunimi: string, yhdistys: string): string {
  return `${sukunimi.trim().toLowerCase()}|${etunimi.trim().toLowerCase()}|${yhdistys.trim().toLowerCase()}`
}

interface Kerays {
  kilpailijat: Map<string, Kilpailija>
  nimiIndeksi: Map<string, string>
}

/**
 * Lukee yhden tuloskortin. Luetaan **vain laukaukset ja kilpailijatiedot** — johdetut
 * sarakkeet (summat, tulos, iskemät) sivuutetaan tarkoituksella ja lasketaan uudelleen,
 * jotta järjestäjän käsin tekemät korjaukset menevät varmasti läpi eikä vanhentunut
 * välisumma voi jäädä voimaan.
 */
function lueTuloskortti(ws: Worksheet, laji: Laji, maaritys: LajiMaaritys, kerays: Kerays) {
  const a = luoAsettelu(maaritys)

  for (let rivi = ENSIMMAINEN_DATARIVI; rivi <= ws.rowCount; rivi++) {
    const r = ws.getRow(rivi)
    const sukunimi = teksti(r.getCell(2)).trim()
    const etunimi = teksti(r.getCell(3)).trim()
    if (!sukunimi && !etunimi) continue

    const yhdistys = teksti(r.getCell(4)).trim()
    const ikasarjaTeksti = teksti(r.getCell(5)).trim()
    const luokkaTeksti = teksti(r.getCell(6)).trim().toLowerCase()
    const tunnus = teksti(r.getCell(a.tunnus)).trim()

    const avain = nimiAvain(sukunimi, etunimi, yhdistys)
    let id = tunnus || kerays.nimiIndeksi.get(avain) || ''
    if (!id || !kerays.kilpailijat.has(id)) {
      if (!id) id = uusiId()
      kerays.kilpailijat.set(id, {
        id,
        etunimi,
        sukunimi,
        yhdistys,
        ikasarja: onIkasarja(ikasarjaTeksti) ? ikasarjaTeksti : 'H',
        osallistumiset: {},
      })
      kerays.nimiIndeksi.set(avain, id)
    }

    const kilpailija = kerays.kilpailijat.get(id)
    if (!kilpailija) continue

    const kilpasarjat = []
    for (let s = 0; s < maaritys.kilpasarjoja; s++) {
      const laukaukset: Laukaus[] = []
      for (let i = 0; i < maaritys.laukauksiaSarjassa; i++) {
        const arvo = jasennaLaukaus(teksti(r.getCell(a.laukausAlku(s) + i)))
        laukaukset.push(arvo === undefined ? null : arvo)
      }
      kilpasarjat.push({ laukaukset })
    }

    const osallistuminen: Osallistuminen = {
      luokka: onLuokka(luokkaTeksti) ? luokkaTeksti : 'vakio',
      kilpasarjat,
      rangaistuksia: Math.max(0, Math.trunc(luku(r.getCell(a.rikkeet), 0))),
      hylatty: teksti(r.getCell(a.hylatty)).trim().toLowerCase() === 'x',
    }
    const huom = teksti(r.getCell(a.huom)).trim()
    if (huom) osallistuminen.huom = huom

    kilpailija.osallistumiset[laji] = osallistuminen
  }
}

export interface TuontiYhteenveto {
  kisa: Kisa
  /** Kilpailijoiden määrä. */
  kilpailijoita: number
  /** Osallistumisten määrä lajeittain. */
  osallistumiset: Record<Laji, number>
  /** Tiedostoon merkitty vientiaika, jos luettavissa. */
  vientiAika: string
  /** Onko tiedoston kisaId sama kuin nykyisen kisan? Kutsuja voi varoittaa eri kisasta. */
  kisaId: string
}

/**
 * Lukee Excel-tiedoston kisaksi.
 *
 * Tuonti ei muuta sovelluksen tilaa — kutsuja päättää, korvataanko nykyinen kisa.
 */
export async function tuoKisa(tavut: ArrayBuffer): Promise<TuontiYhteenveto> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  try {
    await wb.xlsx.load(tavut)
  } catch {
    throw new TuontiVirhe('Tiedostoa ei voitu lukea. Onko se kelvollinen .xlsx-tiedosto?')
  }

  const { parit, rakenteet } = lueMeta(wb)

  const lajiMaaritykset = structuredClone(LAJIT)
  for (const laji of LAJI_KOODIT) {
    const r = rakenteet.get(laji)
    if (r) Object.assign(lajiMaaritykset[laji], r)
  }

  const kerays: Kerays = { kilpailijat: new Map(), nimiIndeksi: new Map() }
  const osallistumiset = { RA1: 0, RA2: 0, RA3: 0, RA4: 0 } as Record<Laji, number>

  let loytyiTuloskortti = false
  for (const laji of LAJI_KOODIT) {
    const ws = wb.getWorksheet(tuloskorttiNimi(laji))
    if (!ws) continue
    loytyiTuloskortti = true
    lueTuloskortti(ws, laji, lajiMaaritykset[laji], kerays)
  }

  if (!loytyiTuloskortti) {
    throw new TuontiVirhe('Tiedostosta ei löytynyt yhtään Tuloskortti-välilehteä.')
  }

  const kilpailijat = [...kerays.kilpailijat.values()]
  for (const k of kilpailijat) {
    for (const laji of LAJI_KOODIT) {
      if (k.osallistumiset[laji]) osallistumiset[laji]++
    }
  }

  const parhaat = Number(parit.get('laskettavatParhaat') ?? '3')

  const kisa: Kisa = {
    schemaVersion: KISA_SKEEMA_VERSIO,
    // Tuonti lukee toistaiseksi vain RESUL-kisoja; mukautettu kisa tulee omana työnään.
    tyyppi: 'resul',
    kisaId: parit.get('kisaId') || lyhytTunnus(),
    kisatiedot: lueKisatiedot(wb),
    asetukset: {
      laskettavatParhaat: Number.isFinite(parhaat) && parhaat > 0 ? Math.trunc(parhaat) : 3,
      // Puuttuva tieto tarkoittaa päällä: vanhemmalla versiolla viedyssä tiedostossa
      // yhdistyskilpailu oli aina mukana.
      joukkuekilpailu: parit.get('joukkuekilpailu') !== 'ei',
      lajiMaaritykset,
    },
    kilpailijat,
  }

  return {
    kisa,
    kilpailijoita: kilpailijat.length,
    osallistumiset,
    vientiAika: parit.get('vientiAika') ?? '',
    kisaId: kisa.kisaId,
  }
}
