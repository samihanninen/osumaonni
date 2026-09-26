import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKisaStore } from '../kisa'
import { kisanLuokat, luokanNimi, LUOKAT } from '@/core/lajit'

/**
 * Mukautetun kisan aseluokat.
 *
 * RESUL-kisassa luokat ovat sääntöjen mukaan Vakio ja Avoin. Mukautetussa kisassa
 * järjestäjä nimeää ne itse, eikä niiden tarvitse liittyä aseeseen lainkaan.
 *
 * Painopiste on samassa kuin sarjoissa: kukaan ei saa jäädä luokkaan jota ei ole.
 * Sijoitukset lasketaan luokan sisällä, joten luokaton osallistuminen katoaisi
 * palkintojenjaosta huomaamatta.
 */
describe('mukautetun kisan aseluokat', () => {
  let store: ReturnType<typeof useKisaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
  })

  /** Kilpailija yhdessä lajissa, jotta luokan siirtymisen näkee. Vain mukautetussa kisassa. */
  function osallistuja(luokka?: string) {
    const laji = store.mukautetutLajit[0]?.id ?? store.lisaaMukautettuLaji().id
    const k = store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'N' })
    store.lisaaOsallistuminen(k.id, laji, luokka)
    return { k, laji }
  }

  it('RESUL-kisassa luokat tulevat säännöistä', () => {
    expect(store.luokat).toEqual([...LUOKAT])
  })

  it('muodon vaihto antaa mukautetulle kisalle luokat näkyvillä nimillä', () => {
    store.asetaKisaTyyppi('mukautettu')
    // Mukautetussa kisassa nimi on tunniste, kuten sarjoissa.
    expect(store.luokat).toEqual(['Vakio', 'Avoin'])
    expect(store.kisa.luokat).toEqual(['Vakio', 'Avoin'])
  })

  it('muodon vaihto takaisin RESULiin palauttaa sääntöjen luokat', () => {
    store.asetaKisaTyyppi('mukautettu')
    store.lisaaLuokka('Optiikka')
    store.asetaKisaTyyppi('resul')

    expect(store.kisa.luokat).toBeUndefined()
    expect(store.luokat).toEqual([...LUOKAT])
  })

  it('lisätty luokka tulee listan loppuun, sama nimi ei kahdesti', () => {
    store.asetaKisaTyyppi('mukautettu')

    expect(store.lisaaLuokka('Optiikka')).toBe(true)
    expect(store.luokat).toEqual(['Vakio', 'Avoin', 'Optiikka'])
    expect(store.lisaaLuokka('Optiikka')).toBe(false)
    expect(store.lisaaLuokka('  ')).toBe(false)
    expect(store.luokat).toHaveLength(3)
  })

  it('nimeäminen siirtää osallistumiset mukana', () => {
    store.asetaKisaTyyppi('mukautettu')
    const { k, laji } = osallistuja('Vakio')

    expect(store.nimeaLuokka('Vakio', 'Rautapiippu')).toBe(true)
    expect(store.luokat).toEqual(['Rautapiippu', 'Avoin'])
    expect(store.kilpailija(k.id)?.osallistumiset[laji]?.luokka).toBe('Rautapiippu')
  })

  it('nimeämistä ei tehdä olemassa olevan luokan päälle', () => {
    store.asetaKisaTyyppi('mukautettu')

    expect(store.nimeaLuokka('Vakio', 'Avoin')).toBe(false)
    expect(store.luokat).toEqual(['Vakio', 'Avoin'])
  })

  /*
   * Poiston koko pointti: osallistumista ei jätetä luokkaan jota ei ole. Tulokset
   * säilyvät, vain luokittelu siirtyy.
   */
  it('poisto siirtää osallistumiset ensimmäiseen jäljelle jäävään luokkaan', () => {
    store.asetaKisaTyyppi('mukautettu')
    const { k, laji } = osallistuja('Avoin')
    expect(store.luokassa('Avoin')).toBe(1)

    store.poistaLuokka('Avoin')

    expect(store.luokat).toEqual(['Vakio'])
    expect(store.kilpailija(k.id)?.osallistumiset[laji]?.luokka).toBe('Vakio')
  })

  it('viimeistä luokkaa ei voi poistaa', () => {
    store.asetaKisaTyyppi('mukautettu')
    store.poistaLuokka('Avoin')

    store.poistaLuokka('Vakio')

    expect(store.luokat).toEqual(['Vakio'])
  })

  /*
   * Ennen `luokat`-kenttää tallennettu mukautettu kisa käyttää tunnisteita `vakio` ja
   * `avoin`. Ensimmäinen muokkaus kirjoittaa listan näkyvillä nimillä ja siirtää
   * kirjatut osallistumiset mukana — muuten ne jäisivät luokkaan jota listassa ei ole.
   */
  it('vanha mukautettu kisa saa luokkalistan ensimmäisellä muokkauksella', () => {
    store.asetaKisaTyyppi('mukautettu')
    const { k, laji } = osallistuja('vakio')
    // Simuloidaan ennen tätä ominaisuutta tallennettua kisaa.
    store.kisa.luokat = undefined

    expect(store.luokat).toEqual([...LUOKAT])
    store.lisaaLuokka('Optiikka')

    expect(store.luokat).toEqual(['Vakio', 'Avoin', 'Optiikka'])
    expect(store.kilpailija(k.id)?.osallistumiset[laji]?.luokka).toBe('Vakio')
  })

  /*
   * Mukautetussa kisassa `vakio` ei välttämättä ole olemassa. Tuntematon oletusluokka
   * jättäisi kilpailijan pois kaikista luokkakohtaisista sijoituksista.
   */
  it('osallistuminen saa oletuksena kisan ensimmäisen luokan', () => {
    store.asetaKisaTyyppi('mukautettu')
    store.poistaLuokka('Vakio')
    store.nimeaLuokka('Avoin', 'Optiikka')
    const { k, laji } = osallistuja()

    expect(store.kilpailija(k.id)?.osallistumiset[laji]?.luokka).toBe('Optiikka')
  })

  it('luokassa laskee osallistumiset, ei kilpailijoita', () => {
    store.asetaKisaTyyppi('mukautettu')
    const laji1 = store.lisaaMukautettuLaji().id
    const laji2 = store.lisaaMukautettuLaji().id
    const k = store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'N' })
    store.lisaaOsallistuminen(k.id, laji1, 'Vakio')
    store.lisaaOsallistuminen(k.id, laji2, 'Vakio')

    // Sama kilpailija kahdessa lajissa: luokka on lajikohtainen valinta.
    expect(store.luokassa('Vakio')).toBe(2)
  })
})

describe('kisanLuokat ja luokanNimi', () => {
  it('RESUL-kisa saa sääntöjen luokat riippumatta luokat-kentästä', () => {
    expect(kisanLuokat({ tyyppi: 'resul', luokat: ['Omat'] })).toEqual([...LUOKAT])
  })

  /* Ennen `luokat`-kenttää tallennettu mukautettu kisa käytti sääntöjen luokkia. */
  it('mukautettu kisa ilman omaa listaa saa sääntöjen luokat', () => {
    expect(kisanLuokat({ tyyppi: 'mukautettu' })).toEqual([...LUOKAT])
    expect(kisanLuokat({ tyyppi: 'mukautettu', luokat: [] })).toEqual([...LUOKAT])
  })

  it('mukautetun kisan oma lista kelpaa sellaisenaan', () => {
    expect(kisanLuokat({ tyyppi: 'mukautettu', luokat: ['Kivääri', 'Pistooli'] })).toEqual([
      'Kivääri',
      'Pistooli',
    ])
  })

  it('sääntöjen tunniste näytetään nimellä, oma nimi sellaisenaan', () => {
    expect(luokanNimi('vakio')).toBe('Vakio')
    expect(luokanNimi('avoin')).toBe('Avoin')
    expect(luokanNimi('Kivääri')).toBe('Kivääri')
  })
})
