import { describe, it, expect } from 'vitest'
import { henkiloAvain, jarjestaHenkilot, puhdistaRosteri } from '../rosteri'

/**
 * Rosterin logiikka: henkilön tunnistus ja tallennuksen luenta.
 *
 * Tunnistus on tässä olennainen: sama henkilö on tunnistettava rosterista ja kisasta
 * samalla tavalla, tai rasti tekisi hänestä kaksoiskappaleen. Luenta puolestaan pudottaa
 * kelvottomat rivit — rosteri on uudelleen kirjattavissa, joten sotkuista riviä ei
 * kannata ottaa talteen niin kuin kisan tallennusta.
 */
describe('henkilön tunnistus', () => {
  it('sivuuttaa kirjainkoon ja välilyönnit', () => {
    expect(henkiloAvain({ etunimi: ' Sanna ', sukunimi: 'HAKALA', yhdistys: 'Nupures' })).toBe(
      henkiloAvain({ etunimi: 'sanna', sukunimi: 'hakala', yhdistys: ' nupures' }),
    )
  })

  /* Yhdistyskilpailussa kaksi samannimistä eri yhdistyksestä ovat eri kilpailijat. */
  it('erottaa saman nimen eri yhdistyksissä', () => {
    expect(henkiloAvain({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })).not.toBe(
      henkiloAvain({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Toinen' }),
    )
  })

  it('järjestää sukunimen ja etunimen mukaan', () => {
    const lista = [
      { id: '1', etunimi: 'Sanna', sukunimi: 'Öhman', yhdistys: '' },
      { id: '2', etunimi: 'Pertti', sukunimi: 'Hakala', yhdistys: '' },
      { id: '3', etunimi: 'Anna', sukunimi: 'Hakala', yhdistys: '' },
    ]
    expect(jarjestaHenkilot(lista).map((h) => h.id)).toEqual(['3', '2', '1'])
    // Alkuperäinen lista ei muutu.
    expect(lista.map((h) => h.id)).toEqual(['1', '2', '3'])
  })
})

describe('rosterin luenta', () => {
  it('lukee kelvolliset rivit ja siistii välilyönnit', () => {
    const tulos = puhdistaRosteri([
      {
        id: ' a ',
        etunimi: ' Sanna ',
        sukunimi: ' Hakala ',
        yhdistys: ' Nupures ',
        ikasarja: 'H50',
      },
    ])
    expect(tulos).toEqual([
      { id: 'a', etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures', ikasarja: 'H50' },
    ])
  })

  /* Ilman tunnistetta tai sukunimeä henkilöä ei voi lisätä kisaan, joten rivi on turha. */
  it('pudottaa rivit joilta puuttuu tunniste tai sukunimi', () => {
    const tulos = puhdistaRosteri([
      { id: 'a', etunimi: 'Sanna', sukunimi: '', yhdistys: 'Nupures' },
      { etunimi: 'Pertti', sukunimi: 'Hakala', yhdistys: 'Nupures' },
      { id: 'c', etunimi: 'Anna', sukunimi: 'Virtanen', yhdistys: '' },
    ])
    expect(tulos.map((h) => h.id)).toEqual(['c'])
  })

  it('pudottaa kaksoiskappaleet nimen ja tunnisteen mukaan', () => {
    const tulos = puhdistaRosteri([
      { id: 'a', etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' },
      { id: 'b', etunimi: 'sanna', sukunimi: 'hakala', yhdistys: 'nupures' },
      { id: 'a', etunimi: 'Toinen', sukunimi: 'Nimi', yhdistys: 'X' },
    ])
    expect(tulos).toHaveLength(1)
    expect(tulos[0]?.id).toBe('a')
  })

  it('sietää rikkinäisen tai tyhjän tallennuksen', () => {
    expect(puhdistaRosteri(undefined)).toEqual([])
    expect(puhdistaRosteri('rikki')).toEqual([])
    expect(puhdistaRosteri([null, 42, 'x', {}])).toEqual([])
  })

  /* Tuntemattomat kentät eivät kelpaa mukaan: rosteri pysyy tunnetun muotoisena. */
  it('ottaa vain tunnetut kentät', () => {
    const tulos = puhdistaRosteri([
      { id: 'a', etunimi: 'A', sukunimi: 'B', yhdistys: 'C', osallistumiset: { RA1: {} } },
    ])
    expect(Object.keys(tulos[0] ?? {}).sort()).toEqual(['etunimi', 'id', 'sukunimi', 'yhdistys'])
  })
})
