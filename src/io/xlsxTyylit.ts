import type { Cell } from 'exceljs'

/**
 * Vientitiedoston yhteiset solutyylit.
 *
 * Omassa moduulissaan, koska tuloskortti, sijoitussivu ja yhdistyssivu kirjoitetaan
 * kukin omastaan eikä otsikkotyylistä saa syntyä kolmea hieman erilaista versiota.
 */

const OTSIKKO_TAYTTO = 'FFE6F2EB'
const OTSIKKO_TAYTTO_TUMMA = 'FF1F6F4A'

export function tyylitaOtsikko(cell: Cell, tumma = false) {
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

/** Lohkon väliotsikko, esim. "Yhteistulos" tai lajin nimi. */
export function tyylitaValiotsikko(cell: Cell) {
  cell.font = { bold: true, size: 11 }
}

/** Ohjeteksti otsikon alla. */
export function tyylitaOhje(cell: Cell, korostettu = false) {
  cell.font = { size: 9, italic: true, color: { argb: korostettu ? 'FF8A5A00' : 'FF62626C' } }
  cell.alignment = { wrapText: true }
}
