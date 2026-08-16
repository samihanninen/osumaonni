import type { Cell, Workbook, Worksheet } from 'exceljs'
import type { Kilpailija, Kisa, Laji, Laukaus, Luokka } from '@/types/kisa'
import { LAJI_KOODIT, LUOKAT, LUOKKA_NIMET } from '@/core/lajit'
import { laskeLaji } from '@/core/laskenta'
import { sijoitukset } from '@/core/sijoitukset'
import { yhdistysLaji, yhdistysYhteistulos } from '@/core/yhdistykset'
import { kokonaiskilpailu } from '@/core/kokonaiskilpailu'
import {
  ENSIMMAINEN_DATARIVI,
  KAAVAT,
  KISATIEDOT_VALILEHTI,
  META_VALILEHTI,
  OTSIKKO_RIVI,
  PERUSSARAKKEET,
  SOVELLUS_NIMI,
  SOVELLUS_VERSIO,
  TIEDOSTO_VERSIO,
  YHDISTYKSET_VALILEHTI,
  alue,
  luoAsettelu,
  sijoituksetNimi,
  solu,
  tuloskorttiNimi,
} from './xlsxAsettelu'

const OTSIKKO_TAYTTO = 'FFE6F2EB'
const OTSIKKO_TAYTTO_TUMMA = 'FF1F6F4A'

function tyylitaOtsikko(cell: Cell, tumma = false) {
  cell.font = {
    bold: true,
    size: tumma ? 12 : 10,
    color: { argb: tumma ? 'FFFFFFFF' : 'FF1C1C1F' },
  }
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: tumma ? OTSIKKO_TAYTTO_TUMMA : OTSIKKO_TAYTTO },
  }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  }
}

function laukausSoluun(arvo: Laukaus): string | number | null {
  if (arvo === null || arvo === undefined) return null
  if (arvo === '*' || arvo === '-') return arvo
  if (typeof arvo === 'number') return arvo === 0 ? '-' : arvo
  return null
}

/** Tuloskortti: ainoa muokattava välilehti, jossa on aidot Excel-kaavat. */
function kirjoitaTuloskortti(wb: Workbook, kisa: Kisa, laji: Laji) {
  const maaritys = kisa.asetukset.lajiMaaritykset[laji]
  const a = luoAsettelu(maaritys)
  const ws = wb.addWorksheet(tuloskorttiNimi(laji), {
    views: [{ state: 'frozen', xSplit: PERUSSARAKKEET.length, ySplit: OTSIKKO_RIVI }],
  })

  ws.mergeCells(1, 1, 1, a.leveys)
  const otsikko = ws.getCell(1, 1)
  otsikko.value = `${maaritys.nimi}`
  tyylitaOtsikko(otsikko, true)

  ws.mergeCells(2, 1, 2, a.leveys)
  const ohje = ws.getCell(2, 1)
  ohje.value =
    'Syötä laukaukset: 1–10, * = napakymppi, - = ohilaukaus. ' +
    'Summat, napakympit ja kilpailutulos laskeutuvat kaavoilla uudelleen. ' +
    'Merkitse hylkäys kirjaimella x.'
  ohje.font = { size: 9, italic: true, color: { argb: 'FF62626C' } }
  ohje.alignment = { wrapText: true }

  // Otsikkorivi
  PERUSSARAKKEET.forEach((nimi, i) => {
    const c = ws.getCell(OTSIKKO_RIVI, i + 1)
    c.value = nimi
    tyylitaOtsikko(c)
  })
  for (let s = 0; s < a.kilpasarjoja; s++) {
    for (let i = 0; i < a.laukauksiaSarjassa; i++) {
      const c = ws.getCell(OTSIKKO_RIVI, a.laukausAlku(s) + i)
      c.value = `S${s + 1}.${i + 1}`
      tyylitaOtsikko(c)
    }
    for (const [sarake, nimi] of [
      [a.sarjaYht(s), `S${s + 1} yht`],
      [a.sarjaNavat(s), `S${s + 1} ★`],
      [a.sarjaIskemat(s), `S${s + 1} isk`],
    ] as [number, string][]) {
      const c = ws.getCell(OTSIKKO_RIVI, sarake)
      c.value = nimi
      tyylitaOtsikko(c)
    }
  }
  for (const [sarake, nimi] of [
    [a.tulos, 'Kilpailutulos'],
    [a.iskemat, 'Iskemät'],
    [a.navat, 'Napakympit'],
    [a.rikkeet, 'Rikkeet'],
    [a.hylatty, 'Hylätty'],
    [a.huom, 'Huom'],
    [a.tunnus, 'Tunnus'],
  ] as [number, string][]) {
    const c = ws.getCell(OTSIKKO_RIVI, sarake)
    c.value = nimi
    tyylitaOtsikko(c)
  }

  const osallistujat = kisa.kilpailijat
    .filter((k) => k.osallistumiset[laji])
    .sort(
      (x, y) =>
        x.sukunimi.localeCompare(y.sukunimi, 'fi') || x.etunimi.localeCompare(y.etunimi, 'fi'),
    )

  osallistujat.forEach((k, idx) => {
    const o = k.osallistumiset[laji]
    if (!o) return
    const rivi = ENSIMMAINEN_DATARIVI + idx
    const tulos = laskeLaji(laji, maaritys, o)

    ws.getCell(rivi, 1).value = idx + 1
    ws.getCell(rivi, 2).value = k.sukunimi
    ws.getCell(rivi, 3).value = k.etunimi
    ws.getCell(rivi, 4).value = k.yhdistys
    ws.getCell(rivi, 5).value = k.ikasarja
    ws.getCell(rivi, 6).value = o.luokka

    const yhtSolut: string[] = []
    for (let s = 0; s < a.kilpasarjoja; s++) {
      const laukaukset = o.kilpasarjat[s]?.laukaukset ?? []
      for (let i = 0; i < a.laukauksiaSarjassa; i++) {
        const c = ws.getCell(rivi, a.laukausAlku(s) + i)
        c.value = laukausSoluun(laukaukset[i] ?? null)
        c.alignment = { horizontal: 'center' }
        c.border = { left: { style: 'hair' }, right: { style: 'hair' } }
      }

      const alueViite = alue(rivi, a.laukausAlku(s), a.laukausLoppu(s))
      const laskettu = tulos.sarjat[s]

      ws.getCell(rivi, a.sarjaYht(s)).value = {
        formula: KAAVAT.sarjaYht(alueViite),
        result: laskettu?.pisteet ?? 0,
      }
      ws.getCell(rivi, a.sarjaNavat(s)).value = {
        formula: KAAVAT.navat(alueViite),
        result: laskettu?.navat ?? 0,
      }
      ws.getCell(rivi, a.sarjaIskemat(s)).value = {
        formula: KAAVAT.iskemat(alueViite),
        result: laskettu?.iskemat ?? 0,
      }
      yhtSolut.push(solu(rivi, a.sarjaYht(s)))
    }

    ws.getCell(rivi, a.rikkeet).value = o.rangaistuksia || 0
    ws.getCell(rivi, a.hylatty).value = o.hylatty ? 'x' : null
    ws.getCell(rivi, a.huom).value = o.huom ?? null
    ws.getCell(rivi, a.tunnus).value = k.id

    const rikeSolu = solu(rivi, a.rikkeet)
    const hylattySolu = solu(rivi, a.hylatty)
    const summa = maaritys.tulosSaanto === 'summa'

    const tulosSolu = ws.getCell(rivi, a.tulos)
    tulosSolu.value = {
      formula: KAAVAT.tulos(yhtSolut, rikeSolu, hylattySolu, summa),
      result: tulos.pisteet,
    }
    tulosSolu.font = { bold: true }

    /*
     * Iskemien ja napakymppien yhteismäärä.
     *
     * Summa-lajeissa se on suora summa. Parempi-sarja-lajeissa se otetaan siitä
     * sarjasta, jolla on enemmän pisteitä — sama logiikka kuin alkuperäisessä
     * Excelissä. Jos sarjoja on enemmän kuin kaksi (mahdollista vain muokatulla
     * rakenteella), kaavaa ei kirjoiteta vaan arvo jää staattiseksi; sovellus laskee
     * sen joka tapauksessa uudelleen tuonnissa.
     */
    const iskSolut = Array.from({ length: a.kilpasarjoja }, (_, s) => solu(rivi, a.sarjaIskemat(s)))
    const napaSolut = Array.from({ length: a.kilpasarjoja }, (_, s) => solu(rivi, a.sarjaNavat(s)))

    if (summa) {
      ws.getCell(rivi, a.iskemat).value = {
        formula: `SUM(${iskSolut.join(',')})`,
        result: tulos.peruste.iskemat,
      }
      ws.getCell(rivi, a.navat).value = {
        formula: `SUM(${napaSolut.join(',')})`,
        result: tulos.peruste.navat,
      }
    } else if (a.kilpasarjoja === 2) {
      const ehto = `${yhtSolut[0]}>=${yhtSolut[1]}`
      ws.getCell(rivi, a.iskemat).value = {
        formula: `IF(${ehto},${iskSolut[0]},${iskSolut[1]})`,
        result: tulos.peruste.iskemat,
      }
      ws.getCell(rivi, a.navat).value = {
        formula: `IF(${ehto},${napaSolut[0]},${napaSolut[1]})`,
        result: tulos.peruste.navat,
      }
    } else {
      ws.getCell(rivi, a.iskemat).value = tulos.peruste.iskemat
      ws.getCell(rivi, a.navat).value = tulos.peruste.navat
    }
  })

  // Sarakeleveydet
  ws.getColumn(1).width = 4
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 9
  ws.getColumn(6).width = 8
  for (let s = 0; s < a.kilpasarjoja; s++) {
    for (let i = 0; i < a.laukauksiaSarjassa; i++) ws.getColumn(a.laukausAlku(s) + i).width = 4.5
    ws.getColumn(a.sarjaYht(s)).width = 8
    ws.getColumn(a.sarjaNavat(s)).width = 6
    ws.getColumn(a.sarjaIskemat(s)).width = 6
  }
  ws.getColumn(a.tulos).width = 12
  ws.getColumn(a.iskemat).width = 9
  ws.getColumn(a.navat).width = 11
  ws.getColumn(a.rikkeet).width = 8
  ws.getColumn(a.hylatty).width = 8
  ws.getColumn(a.huom).width = 22
  // Tunnus on tekninen kenttä; piilotetaan mutta säilytetään tuontia varten.
  ws.getColumn(a.tunnus).width = 14
  ws.getColumn(a.tunnus).hidden = true

  // Pudotusvalikot vähentävät kirjoitusvirheitä hand-editoinnissa.
  const viimeinenRivi = ENSIMMAINEN_DATARIVI + Math.max(osallistujat.length, 1) - 1
  for (let rivi = ENSIMMAINEN_DATARIVI; rivi <= viimeinenRivi; rivi++) {
    ws.getCell(rivi, 6).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`"${LUOKAT.join(',')}"`],
    }
    ws.getCell(rivi, a.hylatty).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"x"'],
    }
  }
}

/** Sijoitukset: tilannekuva, ei kaavoja. */
function kirjoitaSijoitukset(wb: Workbook, kisa: Kisa, laji: Laji) {
  const maaritys = kisa.asetukset.lajiMaaritykset[laji]
  const ws = wb.addWorksheet(sijoituksetNimi(laji))

  const leveys = 7 + maaritys.kilpasarjoja
  ws.mergeCells(1, 1, 1, leveys)
  const otsikko = ws.getCell(1, 1)
  otsikko.value = `Sijoitukset — ${laji}`
  tyylitaOtsikko(otsikko, true)

  ws.mergeCells(2, 1, 2, leveys)
  const ohje = ws.getCell(2, 1)
  ohje.value =
    'Tilannekuva viennin hetkellä. Tämä välilehti ei sisällä kaavoja — korjaa tulokset ' +
    'Tuloskortti-välilehdellä ja tuo tiedosto takaisin sovellukseen, niin sijoitukset päivittyvät.'
  ohje.font = { size: 9, italic: true, color: { argb: 'FF8A5A00' } }
  ohje.alignment = { wrapText: true }

  let rivi = OTSIKKO_RIVI
  for (const luokka of LUOKAT) {
    const rivit = sijoitukset(kisa.kilpailijat, laji, luokka, maaritys)
    if (rivit.length === 0) continue

    const luokkaOtsikko = ws.getCell(rivi, 1)
    luokkaOtsikko.value = `${LUOKKA_NIMET[luokka]} luokka`
    luokkaOtsikko.font = { bold: true, size: 11 }
    rivi++

    const otsikot = [
      'Sija',
      'Sukunimi',
      'Etunimi',
      'Yhdistys',
      'Ikäsarja',
      ...Array.from({ length: maaritys.kilpasarjoja }, (_, i) => `S${i + 1}`),
      'Tulos',
      'Iskemät',
      '★',
    ]
    otsikot.forEach((nimi, i) => {
      const c = ws.getCell(rivi, i + 1)
      c.value = nimi
      tyylitaOtsikko(c)
    })
    rivi++

    for (const r of rivit) {
      ws.getCell(rivi, 1).value = r.sija === 0 ? '—' : r.sija
      ws.getCell(rivi, 2).value = r.kilpailija.sukunimi
      ws.getCell(rivi, 3).value = r.kilpailija.etunimi
      ws.getCell(rivi, 4).value = r.kilpailija.yhdistys
      ws.getCell(rivi, 5).value = r.kilpailija.ikasarja
      for (let s = 0; s < maaritys.kilpasarjoja; s++) {
        ws.getCell(rivi, 6 + s).value = r.tulos.sarjat[s]?.pisteet ?? 0
      }
      ws.getCell(rivi, 6 + maaritys.kilpasarjoja).value = r.tulos.hylatty
        ? 'hylätty'
        : r.tulos.pisteet
      ws.getCell(rivi, 7 + maaritys.kilpasarjoja).value = r.tulos.peruste.iskemat
      ws.getCell(rivi, 8 + maaritys.kilpasarjoja).value = r.tulos.peruste.navat
      rivi++
    }
    rivi++
  }

  ws.getColumn(1).width = 6
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 9
}

function kirjoitaYhdistykset(wb: Workbook, kisa: Kisa) {
  const ws = wb.addWorksheet(YHDISTYKSET_VALILEHTI)
  const parhaita = kisa.asetukset.laskettavatParhaat

  ws.mergeCells(1, 1, 1, 7)
  const otsikko = ws.getCell(1, 1)
  otsikko.value = 'Yhdistys- ja kokonaiskilpailu'
  tyylitaOtsikko(otsikko, true)

  ws.getCell(2, 1).value = `Lajitulos = parhaiden ${parhaita} kilpailijan summa. Tilannekuva.`
  ws.getCell(2, 1).font = { size: 9, italic: true, color: { argb: 'FF62626C' } }

  let rivi = 4
  ws.getCell(rivi, 1).value = 'Yhteistulos'
  ws.getCell(rivi, 1).font = { bold: true, size: 11 }
  rivi++

  const otsikot = ['Sija', 'Yhdistys', ...LAJI_KOODIT, 'Yhteensä']
  otsikot.forEach((n, i) => {
    const c = ws.getCell(rivi, i + 1)
    c.value = n
    tyylitaOtsikko(c)
  })
  rivi++

  for (const r of yhdistysYhteistulos(kisa.kilpailijat, {
    parhaita,
    maaritykset: kisa.asetukset.lajiMaaritykset,
  })) {
    ws.getCell(rivi, 1).value = r.sija
    ws.getCell(rivi, 2).value = r.yhdistys
    LAJI_KOODIT.forEach((laji, i) => {
      ws.getCell(rivi, 3 + i).value = r.lajipisteet[laji] || null
    })
    ws.getCell(rivi, 3 + LAJI_KOODIT.length).value = r.pisteet
    rivi++
  }

  rivi += 1
  for (const laji of LAJI_KOODIT) {
    const rivit = yhdistysLaji(kisa.kilpailijat, laji, {
      parhaita,
      maaritykset: kisa.asetukset.lajiMaaritykset,
    })
    if (rivit.length === 0) continue

    ws.getCell(rivi, 1).value = laji
    ws.getCell(rivi, 1).font = { bold: true, size: 11 }
    rivi++
    ;['Sija', 'Yhdistys', 'Tulos', 'Ampujia', 'Huomioidut'].forEach((n, i) => {
      const c = ws.getCell(rivi, i + 1)
      c.value = n
      tyylitaOtsikko(c)
    })
    rivi++

    for (const r of rivit) {
      ws.getCell(rivi, 1).value = r.sija
      ws.getCell(rivi, 2).value = r.yhdistys
      ws.getCell(rivi, 3).value = r.pisteet
      ws.getCell(rivi, 4).value = r.kilpailijoita
      ws.getCell(rivi, 5).value = r.huomioidut
        .map((h) => `${h.kilpailija.sukunimi} ${h.pisteet}`)
        .join(', ')
      rivi++
    }
    rivi++
  }

  ws.getCell(rivi, 1).value = 'Kokonaiskilpailu — henkilökohtainen'
  ws.getCell(rivi, 1).font = { bold: true, size: 11 }
  rivi++
  ;['Sija', 'Sukunimi', 'Etunimi', 'Yhdistys', ...LAJI_KOODIT, 'Yhteensä', 'Lajeja'].forEach(
    (n, i) => {
      const c = ws.getCell(rivi, i + 1)
      c.value = n
      tyylitaOtsikko(c)
    },
  )
  rivi++
  for (const r of kokonaiskilpailu(kisa.kilpailijat, {
    maaritykset: kisa.asetukset.lajiMaaritykset,
  })) {
    ws.getCell(rivi, 1).value = r.sija
    ws.getCell(rivi, 2).value = r.kilpailija.sukunimi
    ws.getCell(rivi, 3).value = r.kilpailija.etunimi
    ws.getCell(rivi, 4).value = r.kilpailija.yhdistys
    LAJI_KOODIT.forEach((laji, i) => {
      ws.getCell(rivi, 5 + i).value = r.lajipisteet[laji]
    })
    ws.getCell(rivi, 5 + LAJI_KOODIT.length).value = r.pisteet
    ws.getCell(rivi, 6 + LAJI_KOODIT.length).value = r.lajeja
    rivi++
  }

  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 30
}

function kirjoitaKisatiedot(wb: Workbook, kisa: Kisa) {
  const ws = wb.addWorksheet(KISATIEDOT_VALILEHTI)
  const t = kisa.kisatiedot

  ws.mergeCells(1, 1, 1, 3)
  const otsikko = ws.getCell(1, 1)
  otsikko.value = 'Kisatiedot'
  tyylitaOtsikko(otsikko, true)

  const parit: [string, string | number][] = [
    ['Kisan nimi', t.nimi],
    ['Järjestäjä', t.jarjestaja],
    ['Kilpailupaikka', t.paikka],
    ['Päivämäärä', t.pvm],
    ['Kilpailunjohtaja', t.kilpailunjohtaja],
    ['Tuomari', t.tuomari],
    ['Kirjuri', t.kirjuri],
    ['Laskettavat parhaat', kisa.asetukset.laskettavatParhaat],
    ['Muistiinpanot', t.muistiinpanot],
  ]

  parit.forEach(([nimi, arvo], i) => {
    const rivi = i + 3
    const avain = ws.getCell(rivi, 1)
    avain.value = nimi
    avain.font = { bold: true }
    ws.getCell(rivi, 2).value = arvo === '' ? null : arvo
  })

  ws.getColumn(1).width = 22
  ws.getColumn(2).width = 40
}

function kirjoitaMeta(wb: Workbook, kisa: Kisa, aika: string) {
  const ws = wb.addWorksheet(META_VALILEHTI)

  const parit: [string, string | number][] = [
    ['tiedostoVersio', TIEDOSTO_VERSIO],
    ['sovellus', SOVELLUS_NIMI],
    ['sovellusVersio', SOVELLUS_VERSIO],
    ['vientiAika', aika],
    ['kisaId', kisa.kisaId],
    ['laskettavatParhaat', kisa.asetukset.laskettavatParhaat],
  ]
  parit.forEach(([avain, arvo], i) => {
    ws.getCell(i + 1, 1).value = avain
    ws.getCell(i + 1, 2).value = arvo
  })

  /*
   * Lajien rakenne talletetaan luettavassa muodossa, koska tuonti tarvitsee sen
   * tietääkseen mistä sarakkeista laukaukset luetaan.
   */
  const alkuRivi = parit.length + 2
  ;['laji', 'kilpasarjoja', 'laukauksiaSarjassa', 'tulosSaanto'].forEach((n, i) => {
    const c = ws.getCell(alkuRivi, i + 1)
    c.value = n
    c.font = { bold: true }
  })
  LAJI_KOODIT.forEach((laji, i) => {
    const m = kisa.asetukset.lajiMaaritykset[laji]
    const rivi = alkuRivi + 1 + i
    ws.getCell(rivi, 1).value = laji
    ws.getCell(rivi, 2).value = m.kilpasarjoja
    ws.getCell(rivi, 3).value = m.laukauksiaSarjassa
    ws.getCell(rivi, 4).value = m.tulosSaanto
  })

  ws.getColumn(1).width = 22
  ws.getColumn(2).width = 26
  ws.getColumn(3).width = 20
  ws.getColumn(4).width = 14
  ws.state = 'hidden'
}

export interface VientiTulos {
  tiedostonimi: string
  tavut: ArrayBuffer
}

/** Tiedostonimi, joka kertoo kisan ja päivämäärän ja on turvallinen kaikilla alustoilla. */
export function vientiTiedostonimi(kisa: Kisa, aika: Date): string {
  const paiva = aika.toISOString().slice(0, 10)
  const nimi = (kisa.kisatiedot.nimi || 'reservilaisammunta')
    .toLowerCase()
    .replace(/[äå]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${nimi || 'reservilaisammunta'}-${paiva}.xlsx`
}

/**
 * Kirjoittaa koko kisan Excel-tiedostoksi.
 *
 * ExcelJS ladataan vasta tässä (~900 kB), jottei sovelluksen käynnistys hidastu.
 */
export async function vieKisa(kisa: Kisa, nyt: Date = new Date()): Promise<VientiTulos> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = SOVELLUS_NIMI
  wb.created = nyt

  kirjoitaKisatiedot(wb, kisa)
  for (const laji of LAJI_KOODIT) kirjoitaTuloskortti(wb, kisa, laji)
  for (const laji of LAJI_KOODIT) kirjoitaSijoitukset(wb, kisa, laji)
  kirjoitaYhdistykset(wb, kisa)
  kirjoitaMeta(wb, kisa, nyt.toISOString())

  const tavut = await wb.xlsx.writeBuffer()
  return {
    tiedostonimi: vientiTiedostonimi(kisa, nyt),
    tavut: tavut as ArrayBuffer,
  }
}

/** Vain testejä varten: paljastaa apurit ilman erillistä tiedostoa. */
export const _sisaiset = { laukausSoluun, tyylitaOtsikko }
export type { Kilpailija, Luokka, Worksheet }
