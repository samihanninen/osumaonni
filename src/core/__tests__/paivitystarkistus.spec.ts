import { describe, it, expect, vi } from 'vitest'
import {
  TARKISTUSVALI_MS,
  tarkistaPaivitys,
  type Paivitettava,
  type Tarkistusymparisto,
} from '../paivitystarkistus'

type Paivitys = Paivitettava['update']
type Haku = Tarkistusymparisto['hae']

function ymparisto(osat: Partial<Tarkistusymparisto> = {}): Tarkistusymparisto {
  return {
    verkossa: () => true,
    hae: () => Promise.resolve({ status: 200 }),
    ...osat,
  }
}

describe('päivityksen tarkistus', () => {
  it('kysyy päivitystä kun palvelin vastaa uudella service workerilla', async () => {
    const rekisterointi = { update: vi.fn<Paivitys>().mockResolvedValue(undefined) }

    const kysyttiin = await tarkistaPaivitys('/sw.js', rekisterointi, ymparisto())

    expect(kysyttiin).toBe(true)
    expect(rekisterointi.update).toHaveBeenCalledOnce()
  })

  it('ohittaa palvelimen kokonaan ilman verkkoyhteyttä', async () => {
    const hae = vi.fn<Haku>()
    const rekisterointi = { update: vi.fn<Paivitys>() }

    const kysyttiin = await tarkistaPaivitys(
      '/sw.js',
      rekisterointi,
      ymparisto({ verkossa: () => false, hae }),
    )

    // Ampumaradalla ollaan katvessa koko päivä. Turha kysely joka tunti kuluttaisi
    // akkua eikä voisi onnistua.
    expect(kysyttiin).toBe(false)
    expect(hae).not.toHaveBeenCalled()
    expect(rekisterointi.update).not.toHaveBeenCalled()
  })

  it('ei päivitä kun palvelin vastaa virhesivulla', async () => {
    const rekisterointi = { update: vi.fn<Paivitys>() }

    const kysyttiin = await tarkistaPaivitys(
      '/sw.js',
      rekisterointi,
      ymparisto({ hae: () => Promise.resolve({ status: 404 }) }),
    )

    // Virhe- tai kirjautumissivu ei ole uusi versio. Sen syöttäminen `update()`:lle
    // voisi purkaa rekisteröinnin ja viedä offline-tuen.
    expect(kysyttiin).toBe(false)
    expect(rekisterointi.update).not.toHaveBeenCalled()
  })

  it('nielee verkkovirheen eikä häiritse käyttäjää', async () => {
    const rekisterointi = { update: vi.fn<Paivitys>() }

    const kysyttiin = await tarkistaPaivitys(
      '/sw.js',
      rekisterointi,
      ymparisto({ hae: () => Promise.reject(new Error('verkko poikki')) }),
    )

    expect(kysyttiin).toBe(false)
    expect(rekisterointi.update).not.toHaveBeenCalled()
  })

  it('nielee myös update()-kutsun virheen', async () => {
    const rekisterointi = {
      update: vi.fn<Paivitys>().mockRejectedValue(new Error('rekisteröinti kaatui')),
    }

    await expect(tarkistaPaivitys('/sw.js', rekisterointi, ymparisto())).resolves.toBe(false)
  })

  it('hakee service workerin välimuistin ohi', async () => {
    const hae = vi.fn<Haku>().mockResolvedValue({ status: 200 })

    await tarkistaPaivitys('/sw.js', { update: vi.fn<Paivitys>() }, ymparisto({ hae }))

    // Ilman tätä selain vastaisi omasta välimuististaan eikä uutta versiota
    // huomattaisi koskaan — tarkistus näyttäisi toimivan mutta ei tekisi mitään.
    const asetukset = hae.mock.calls[0]?.[1]
    expect(asetukset?.cache).toBe('no-store')
  })

  it('tarkistaa kerran tunnissa', () => {
    // Kilpailupäivä on lyhyempi kuin sovelluksen elinkaari taustalla, joten väli saa
    // olla pitkä. Liian tiheä kysely ei toisi mitään: julkaisuja on harvakseltaan.
    expect(TARKISTUSVALI_MS).toBe(60 * 60 * 1000)
  })
})
