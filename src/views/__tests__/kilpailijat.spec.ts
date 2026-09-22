import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import KilpailijatView from '../KilpailijatView.vue'
import { useKisaStore } from '@/stores/kisa'
import { useRosteriStore } from '@/stores/rosteri'

/**
 * Kilpailijalistan järjestys kesken kirjoittamisen.
 *
 * Lista näytetään sukunimen mukaisessa järjestyksessä, ja nimikentät tallentavat joka
 * näppäimenpainalluksella. Yhdessä ne tarkoittivat, että rivi vaihtoi paikkaa kesken
 * sanan: "Pertti Hak" ja "Sanna H…" — kirjain H nostaa Samin ensimmäiseksi, ja kolmas
 * kirjain pudottaa hänet takaisin. Kohdistus seurasi liikkuvaa riviä tai jäi väärään
 * kenttään, eikä nimeä voinut kirjoittaa loppuun.
 */
const globaalit = {
  stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
}

function sukunimikentat(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('input[id^="suku-"]')
}

describe('kilpailijalistan järjestys', () => {
  let store: ReturnType<typeof useKisaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
    store.lisaaKilpailija({ etunimi: 'Pertti', sukunimi: 'Hak', yhdistys: 'Nupures' })
    store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: '', yhdistys: 'Nupures' })
  })

  it('rivi pysyy paikallaan kesken sukunimen kirjoittamisen', async () => {
    const wrapper = mount(KilpailijatView, { global: globaalit })

    const kentat = sukunimikentat(wrapper)
    expect(kentat).toHaveLength(2)
    // Sanna on aluksi ensimmäisenä, koska tyhjä sukunimi järjestyy ensin.
    const sannaKentta = kentat[0]!
    const samiId = sannaKentta.attributes('id')

    // Kirjoitetaan "Hakala" kirjain kerrallaan.
    for (const teksti of ['M', 'Ma', 'Hak', 'Mann', 'Manni', 'Mannin', 'Hakala']) {
      await sannaKentta.setValue(teksti)
      // Kenttä ei saa vaihtaa paikkaa eikä omistajaa kesken kirjoittamisen.
      expect(sukunimikentat(wrapper)[0]!.attributes('id')).toBe(samiId)
    }

    expect(store.kisa.kilpailijat.find((k) => k.etunimi === 'Sanna')?.sukunimi).toBe('Hakala')
  })

  it('järjestys päivittyy kun kenttä menettää kohdistuksen', async () => {
    const wrapper = mount(KilpailijatView, { global: globaalit })

    const sannaKentta = sukunimikentat(wrapper)[0]!
    await sannaKentta.setValue('Hakala')
    await sannaKentta.trigger('blur')

    // Hak < Hakala, joten Pertti nousee ensimmäiseksi vasta kirjoittamisen jälkeen.
    const nimet = wrapper
      .findAll('input[id^="etu-"]')
      .map((i) => (i.element as HTMLInputElement).value)
    expect(nimet).toEqual(['Pertti', 'Sanna'])
  })
})

/**
 * Rosterirasti kilpailijalistalla.
 *
 * Rosteriin pääsi ennen vain kahta kautta: lisäyslomakkeen `Tallenna myös rosteriin`
 * juuri kirjattavalle kilpailijalle, tai rosterikortin nappi koko kisalle kerralla. Jo
 * listalla olevaa yksittäistä kilpailijaa ei saanut rosteriin lainkaan — hänet piti
 * poistaa ja kirjata uudelleen rasti päällä.
 */
describe('rosterirasti kilpailijalistalla', () => {
  let store: ReturnType<typeof useKisaStore>
  let rosteri: ReturnType<typeof useRosteriStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
    rosteri = useRosteriStore()
  })

  function rosterirasti(wrapper: ReturnType<typeof mount>) {
    return wrapper.get('.rivi .rosterirasti input[type="checkbox"]')
  }

  it('rasti tallentaa listalla olevan kilpailijan rosteriin', async () => {
    const k = store.lisaaKilpailija({ etunimi: 'Pertti', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const wrapper = mount(KilpailijatView, { global: globaalit })

    await rosterirasti(wrapper).setValue(true)

    expect(rosteri.maara).toBe(1)
    // Sama tunniste kuin kisassa: se sitoo rosterin henkilön tähän kilpailijaan.
    expect(rosteri.henkilo(k.id)).toMatchObject({ sukunimi: 'Hakala', yhdistys: 'Nupures' })
  })

  it('rasti näkyy valittuna, kun kilpailija on jo rosterissa', () => {
    store.lisaaKilpailija({ etunimi: 'Pertti', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    // Rosteriin kirjattu erikseen, eri tunnisteella: tunnistus osuu nimen kautta.
    rosteri.tallenna({ etunimi: 'Pertti', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const wrapper = mount(KilpailijatView, { global: globaalit })

    expect((rosterirasti(wrapper).element as HTMLInputElement).checked).toBe(true)
  })

  it('rastin poisto vie rosterista mutta jättää kilpailijan kisaan', async () => {
    const k = store.lisaaKilpailija({ etunimi: 'Pertti', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    rosteri.tallenna({ id: k.id, etunimi: 'Pertti', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const wrapper = mount(KilpailijatView, { global: globaalit })

    await rosterirasti(wrapper).setValue(false)

    expect(rosteri.maara).toBe(0)
    expect(store.kilpailijoita).toBe(1)
  })

  /*
   * Ilman sukunimeä rosteri ei ota henkilöä vastaan, joten rasti kimpoaisi takaisin
   * tyhjänä. Silloin ruutua ei näytetä lainkaan.
   */
  it('rasti puuttuu kilpailijalta jolla ei ole sukunimeä', () => {
    store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: '', yhdistys: 'Nupures' })
    const wrapper = mount(KilpailijatView, { global: globaalit })

    expect(wrapper.find('.rivi .rosterirasti').exists()).toBe(false)
  })
})

/**
 * Rosteri siirtyi omalle sivulleen.
 *
 * Taitettuna osiona se näytti kilpailijasivulla samat ihmiset kahdesti — rosterissa ja
 * kisan kilpailijalistassa — eikä kumpaa listaa milloinkin muokkasi erottunut. Sivulle
 * jää vain rosterin tila ja linkki sinne.
 */
describe('rosterikortti kilpailijasivulla', () => {
  let store: ReturnType<typeof useKisaStore>
  let rosteri: ReturnType<typeof useRosteriStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
    rosteri = useRosteriStore()
  })

  it('rosterin nimilistaa ei näytetä kilpailijasivulla', () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const wrapper = mount(KilpailijatView, { global: globaalit })

    expect(wrapper.find('.henkilot').exists()).toBe(false)
    expect(wrapper.find('a[href="/rosteri"]').exists()).toBe(true)
  })

  it('kertoo rosterin tilan', () => {
    const wrapper = mount(KilpailijatView, { global: globaalit })
    expect(wrapper.text()).toContain('tyhjä')

    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    expect(mount(KilpailijatView, { global: globaalit }).text()).toContain('1 henkilöä laitteella')
  })

  /*
   * Tyhjän kisan alussa rosterista on eniten hyötyä, joten linkki nousee ensisijaiseksi
   * ja kertoo mitä sen takaa löytyy. Sama syy, jolla osio oli ennen valmiiksi auki.
   */
  it('nostaa rosterilinkin esiin tyhjässä kisassa', () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const tyhja = mount(KilpailijatView, { global: globaalit })
    const linkki = tyhja.get('a[href="/rosteri"]')
    expect(linkki.text()).toBe('Täppää väki rosterista')
    expect(linkki.classes()).toContain('nappi--ensisijainen')

    store.lisaaKilpailija({ etunimi: 'Pertti', sukunimi: 'Virtanen', yhdistys: 'Nupures' })
    const taynna = mount(KilpailijatView, { global: globaalit })
    expect(taynna.get('a[href="/rosteri"]').text()).toBe('Avaa rosteri')
  })
})
