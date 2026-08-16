import { describe, it, expect } from 'vitest'
import { KISA_SKEEMA_VERSIO, lueTallennettu, migroi, type Migraatio } from '../skeema'

/** Rakentaa tallennuksen sellaisena kuin persistedstate sen kirjoittaa. */
function tallennus(kisa: Record<string, unknown>): string {
  return JSON.stringify({ kisa })
}

function nykyinenKisa(lisat: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: KISA_SKEEMA_VERSIO,
    kisaId: 'ABCD2345',
    kisatiedot: { nimi: 'Syyskisa' },
    asetukset: { laskettavatParhaat: 3 },
    kilpailijat: [],
    ...lisat,
  }
}

describe('skeeman luenta', () => {
  it('tyhjä tallennus on tyhjä eikä virhe', () => {
    expect(lueTallennettu(null).tila).toBe('tyhja')
    expect(lueTallennettu('').tila).toBe('tyhja')
    expect(lueTallennettu(undefined).tila).toBe('tyhja')
  })

  it('nykyinen versio otetaan käyttöön sellaisenaan', () => {
    const tulos = lueTallennettu(tallennus(nykyinenKisa()))
    expect(tulos.tila).toBe('ok')
    expect(tulos.loydettyVersio).toBe(KISA_SKEEMA_VERSIO)
    expect(tulos.tallennettu?.kisa.kisaId).toBe('ABCD2345')
  })

  it('vioittunut JSON ei kaada eikä lataudu', () => {
    const tulos = lueTallennettu('{ tämä ei ole json')
    expect(tulos.tila).toBe('vioittunut')
    expect(tulos.tallennettu).toBeUndefined()
  })

  it('tallennus ilman kisa-kenttää hylätään', () => {
    expect(lueTallennettu(JSON.stringify({ jotain: 'muuta' })).tila).toBe('vioittunut')
    expect(lueTallennettu(JSON.stringify({ kisa: 'teksti' })).tila).toBe('vioittunut')
    expect(lueTallennettu(JSON.stringify({ kisa: [] })).tila).toBe('vioittunut')
  })

  /*
   * Tämä on versioinnin ydin: versiotonta tallennusta ei tulkita versioksi 1. Arvaus
   * voisi lukea vieraan rakenteen oikeana ja hävittää tulokset huomaamatta.
   */
  it('versioton tallennus hylätään eikä sitä arvata vanhimmaksi versioksi', () => {
    const tulos = lueTallennettu(tallennus({ kisaId: 'X', kilpailijat: [] }))
    expect(tulos.tila).toBe('vioittunut')
    expect(tulos.tallennettu).toBeUndefined()
  })

  it('kelvoton versionumero hylätään', () => {
    for (const versio of ['1', 0, -1, 1.5, null]) {
      expect(lueTallennettu(tallennus(nykyinenKisa({ schemaVersion: versio }))).tila).toBe(
        'vioittunut',
      )
    }
  })

  /*
   * Uudempi tallennus syntyy, kun virheellinen julkaisu perutaan: laitteelle on jo
   * kirjoitettu uudemmalla versiolla. Vanhempi sovellus ei saa lukea sitä puolittain.
   */
  it('uudempi tallennus tunnistetaan eikä sitä ladata', () => {
    const tulos = lueTallennettu(tallennus(nykyinenKisa({ schemaVersion: KISA_SKEEMA_VERSIO + 1 })))
    expect(tulos.tila).toBe('uudempi')
    expect(tulos.loydettyVersio).toBe(KISA_SKEEMA_VERSIO + 1)
    expect(tulos.tallennettu).toBeUndefined()
  })
})

describe('migraatiot', () => {
  it('ajaa askeleet järjestyksessä yksi versio kerrallaan', () => {
    const jarjestys: number[] = []
    const migraatiot: Record<number, Migraatio> = {
      1: (k) => {
        jarjestys.push(1)
        return { ...k, lisattyYhdessa: true }
      },
      2: (k) => {
        jarjestys.push(2)
        return { ...k, lisattyKahdessa: true }
      },
    }

    const tulos = migroi({ schemaVersion: 1, kisaId: 'X' }, 1, 3, migraatiot)

    expect(jarjestys).toEqual([1, 2])
    expect(tulos).toMatchObject({
      kisaId: 'X',
      lisattyYhdessa: true,
      lisattyKahdessa: true,
      schemaVersion: 3,
    })
  })

  it('puuttuva askel keskeyttää ketjun eikä palauta arvausta', () => {
    const migraatiot: Record<number, Migraatio> = { 1: (k) => k }
    expect(migroi({ schemaVersion: 1 }, 1, 3, migraatiot)).toBeNull()
  })

  /*
   * Nykyinen versio annetaan testeissä erikseen, koska muuten migraatiopolkua ei voisi
   * ajaa ennen ensimmäistä oikeaa rakennemuutosta. Mekanismi on koeteltu jo silloin,
   * kun sitä ensi kertaa tarvitaan — se on koko pointti.
   */
  it('vanhempi tallennus migroidaan luennassa nykyiseen versioon', () => {
    const migraatiot: Record<number, Migraatio> = {
      1: (k) => ({ ...k, kisatiedot: { nimi: 'Siirretty' } }),
    }
    const vanha = tallennus({ schemaVersion: 1, kisaId: 'VANHA', kilpailijat: [] })

    const tulos = lueTallennettu(vanha, migraatiot, 2)

    expect(tulos.tila).toBe('migroitu')
    expect(tulos.loydettyVersio).toBe(1)
    expect(tulos.tallennettu?.kisa.schemaVersion).toBe(2)
    expect(tulos.tallennettu?.kisa.kisaId).toBe('VANHA')
    expect(tulos.tallennettu?.kisa.kisatiedot.nimi).toBe('Siirretty')
  })

  it('vanhempi tallennus ilman migraatiota hylätään eikä ladata puolittain', () => {
    const vanha = tallennus({ schemaVersion: 1, kisaId: 'VANHA', kilpailijat: [] })

    const tulos = lueTallennettu(vanha, {}, 2)

    expect(tulos.tila).toBe('vioittunut')
    expect(tulos.loydettyVersio).toBe(1)
    expect(tulos.tallennettu).toBeUndefined()
  })
})
