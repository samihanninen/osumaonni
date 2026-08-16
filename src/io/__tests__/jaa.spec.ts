import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  jaaTiedosto,
  jakoKaytettavissa,
  luoTiedosto,
  luonnosTeksti,
  mailtoOsoite,
  tukeeTiedostonJakoa,
} from '../jaa'

type JakoNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean
  share?: (data?: ShareData) => Promise<void>
}

const nav = navigator as JakoNavigator
const alkuperainen = { canShare: nav.canShare, share: nav.share }

function asetaJakotuki(
  canShare: ((data?: ShareData) => boolean) | undefined,
  share?: (data?: ShareData) => Promise<void>,
) {
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true })
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
}

describe('tiedoston luonti', () => {
  it('luo File-olion oikealla nimellä ja tyypillä', () => {
    const f = luoTiedosto(new ArrayBuffer(8), 'tulokset.xlsx')
    expect(f.name).toBe('tulokset.xlsx')
    expect(f.type).toContain('spreadsheetml')
    expect(f.size).toBe(8)
  })
})

describe('jakotuen tunnistus', () => {
  afterEach(() => asetaJakotuki(alkuperainen.canShare, alkuperainen.share))

  it('ilman rajapintaa jakoa ei tueta', () => {
    asetaJakotuki(undefined, undefined)
    expect(jakoKaytettavissa()).toBe(false)
    expect(tukeeTiedostonJakoa(luoTiedosto(new ArrayBuffer(0), 'a.xlsx'))).toBe(false)
  })

  it('pelkkä navigator.share riittää painikkeen näyttämiseen', () => {
    // Tunnistus on tarkoituksella väljä: canShare tyhjällä koetiedostolla antoi
    // vääriä negatiivisia, jolloin jakopainike jäi piiloon toimivilla laitteilla.
    asetaJakotuki(undefined, () => Promise.resolve())
    expect(jakoKaytettavissa()).toBe(true)
  })

  it('canShare ratkaisee yksittäisen tiedoston jakamisen', () => {
    asetaJakotuki(
      () => true,
      () => Promise.resolve(),
    )
    expect(tukeeTiedostonJakoa(luoTiedosto(new ArrayBuffer(4), 'a.xlsx'))).toBe(true)

    asetaJakotuki(
      () => false,
      () => Promise.resolve(),
    )
    expect(tukeeTiedostonJakoa(luoTiedosto(new ArrayBuffer(4), 'a.xlsx'))).toBe(false)
  })

  it('canSharen poikkeus tulkitaan tuen puutteeksi', () => {
    asetaJakotuki(
      () => {
        throw new Error('ei käy')
      },
      () => Promise.resolve(),
    )
    expect(tukeeTiedostonJakoa(luoTiedosto(new ArrayBuffer(4), 'a.xlsx'))).toBe(false)
  })
})

describe('jaaTiedosto', () => {
  const tiedosto = luoTiedosto(new ArrayBuffer(4), 'tulokset.xlsx')
  const tiedot = { otsikko: 'Tulokset', teksti: 'Kisan tulokset' }

  afterEach(() => asetaJakotuki(alkuperainen.canShare, alkuperainen.share))

  it('onnistunut jako palauttaa "jaettu"', async () => {
    const share = vi.fn<(data?: ShareData) => Promise<void>>().mockResolvedValue(undefined)
    asetaJakotuki(() => true, share)

    await expect(jaaTiedosto(tiedosto, tiedot)).resolves.toBe('jaettu')
    expect(share).toHaveBeenCalledOnce()
    expect(share.mock.calls[0]?.[0]).toMatchObject({ title: 'Tulokset' })
  })

  it('käyttäjän peruutus tunnistetaan', async () => {
    asetaJakotuki(
      () => true,
      () => Promise.reject(new DOMException('peruttu', 'AbortError')),
    )
    await expect(jaaTiedosto(tiedosto, tiedot)).resolves.toBe('peruutettu')
  })

  it('selaimen esto tunnistetaan omaksi tapaukseksi', async () => {
    // Safari heittää tämän, jos jako ei tapahdu heti käyttäjän eleen jälkeen.
    asetaJakotuki(
      () => true,
      () => Promise.reject(new DOMException('ei sallittu', 'NotAllowedError')),
    )
    await expect(jaaTiedosto(tiedosto, tiedot)).resolves.toBe('estetty')
  })

  it('tuen puuttuminen palauttaa "ei-tuettu" eikä kutsu jakoa', async () => {
    asetaJakotuki(undefined, undefined)
    await expect(jaaTiedosto(tiedosto, tiedot)).resolves.toBe('ei-tuettu')
  })

  it('muu virhe tulkitaan tuen puutteeksi', async () => {
    asetaJakotuki(
      () => true,
      () => Promise.reject(new Error('jotain muuta')),
    )
    await expect(jaaTiedosto(tiedosto, tiedot)).resolves.toBe('ei-tuettu')
  })
})

describe('mailto-osoite', () => {
  it('koodaa aiheen ja viestin', () => {
    const osoite = mailtoOsoite({ aihe: 'Tulokset: Kesäkisa', viesti: 'Rivi 1\nRivi 2' })
    expect(osoite.startsWith('mailto:?')).toBe(true)
    expect(osoite).toContain('subject=Tulokset%3A%20Kes%C3%A4kisa')
    expect(osoite).toContain('Rivi%201%0ARivi%202')
  })

  it('käyttää %20 eikä plussaa välilyönneille', () => {
    // Sähköpostiohjelmat eivät tulkitse plussaa välilyönniksi mailto-rungossa.
    const osoite = mailtoOsoite({ aihe: 'a b', viesti: 'c d' })
    expect(osoite).not.toContain('+')
    expect(osoite).toContain('a%20b')
  })

  it('vastaanottaja voidaan antaa', () => {
    const osoite = mailtoOsoite({
      vastaanottaja: 'kisa@example.com',
      aihe: 'x',
      viesti: 'y',
    })
    expect(osoite.startsWith('mailto:kisa@example.com?')).toBe(true)
  })
})

describe('sähköpostiluonnos', () => {
  it('sisältää kisan tiedot ja muistutuksen liitteestä', () => {
    const luonnos = luonnosTeksti({
      kisanNimi: 'Nupureksen mestaruuskilpailut',
      pvm: '15.6.2026',
      tiedostonimi: 'tulokset.xlsx',
      kilpailijoita: 22,
    })
    expect(luonnos.aihe).toBe('Tulokset: Nupureksen mestaruuskilpailut (15.6.2026)')
    expect(luonnos.viesti).toContain('Kilpailijoita: 22')
    expect(luonnos.viesti).toContain('tulokset.xlsx')
    // Rajoite on kerrottava, jottei käyttäjä luota liitteen ilmestyvän itsestään.
    expect(luonnos.viesti).toContain('liitä tiedosto viestiin itse')
  })

  it('toimii ilman kisan nimeä ja päivämäärää', () => {
    const luonnos = luonnosTeksti({
      kisanNimi: '',
      pvm: '',
      tiedostonimi: 'a.xlsx',
      kilpailijoita: 0,
    })
    expect(luonnos.aihe).toBe('Tulokset: Reserviläisammunta')
    expect(luonnos.viesti).not.toContain('Päivämäärä')
  })
})
