import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRosteriStore } from '../rosteri'

/**
 * Rosterin tallennus: sama henkilö vain kertaalleen.
 *
 * Kaksoiskappale näkyisi listassa kahtena rastina, joista toinen ei tekisi mitään — ja
 * pienessä yhdistyksessä nimi tallentuu rosteriin monta kertaa: joka kisan jälkeen
 * uudelleen samalta napilta.
 */
describe('rosteri-store', () => {
  let rosteri: ReturnType<typeof useRosteriStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    rosteri = useRosteriStore()
  })

  it('tallentaa henkilön ja antaa tunnisteen', () => {
    const h = rosteri.tallenna({ etunimi: ' Sanna ', sukunimi: ' Hakala ', yhdistys: ' Nupures ' })

    expect(h?.id).toBeTruthy()
    expect(h?.etunimi).toBe('Sanna')
    expect(h?.yhdistys).toBe('Nupures')
    expect(rosteri.maara).toBe(1)
  })

  it('ei tallenna ilman sukunimeä', () => {
    expect(
      rosteri.tallenna({ etunimi: 'Sanna', sukunimi: '  ', yhdistys: 'Nupures' }),
    ).toBeUndefined()
    expect(rosteri.maara).toBe(0)
  })

  it('päivittää saman henkilön eikä lisää kahdesti', () => {
    const eka = rosteri.tallenna({
      etunimi: 'Sanna',
      sukunimi: 'Hakala',
      yhdistys: 'Nupures',
      ikasarja: 'H',
    })
    const toka = rosteri.tallenna({
      etunimi: 'sanna',
      sukunimi: 'HAKALA',
      yhdistys: 'nupures',
      ikasarja: 'H50',
    })

    expect(rosteri.maara).toBe(1)
    // Tunniste säilyy: se sitoo rosterin henkilön kisassa olevaan kilpailijaan.
    expect(toka?.id).toBe(eka?.id)
    expect(toka?.ikasarja).toBe('H50')
  })

  it('säilyttää annetun tunnisteen', () => {
    const h = rosteri.tallenna({ id: 'k-1', etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    expect(h?.id).toBe('k-1')
    expect(rosteri.henkilo('k-1')).toBeDefined()
  })

  it('tallentaa monta ja kertoo montako oli uusia', () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })

    const uusia = rosteri.tallennaMonta([
      { etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' },
      { etunimi: 'Pertti', sukunimi: 'Virtanen', yhdistys: 'Nupures' },
      { etunimi: 'Ei', sukunimi: '', yhdistys: 'Kelpaa' },
    ])

    expect(uusia).toBe(1)
    expect(rosteri.maara).toBe(2)
  })

  it('järjestää henkilöt sukunimen mukaan', () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Virtanen', yhdistys: '' })
    rosteri.tallenna({ etunimi: 'Pertti', sukunimi: 'Hakala', yhdistys: '' })

    expect(rosteri.jarjestetyt.map((h) => h.sukunimi)).toEqual(['Hakala', 'Virtanen'])
  })

  it('poistaa yhden ja tyhjentää kaikki', () => {
    const h = rosteri.tallenna({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    rosteri.tallenna({ etunimi: 'D', sukunimi: 'E', yhdistys: 'F' })

    rosteri.poista(h!.id)
    expect(rosteri.maara).toBe(1)

    rosteri.tyhjenna()
    expect(rosteri.maara).toBe(0)
  })

  it('etsii henkilön nimellä kirjainkoosta riippumatta', () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })

    expect(
      rosteri.etsiNimella({ etunimi: 'SANNA', sukunimi: 'hakala', yhdistys: ' Nupures ' }),
    ).toBeDefined()
    expect(
      rosteri.etsiNimella({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Toinen' }),
    ).toBeUndefined()
  })
})
