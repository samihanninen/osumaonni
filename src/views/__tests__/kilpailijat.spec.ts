import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import KilpailijatView from '../KilpailijatView.vue'
import { useKisaStore } from '@/stores/kisa'

/**
 * Kilpailijalistan järjestys kesken kirjoittamisen.
 *
 * Lista näytetään sukunimen mukaisessa järjestyksessä, ja nimikentät tallentavat joka
 * näppäimenpainalluksella. Yhdessä ne tarkoittivat, että rivi vaihtoi paikkaa kesken
 * sanan: "Pertti Hak" ja "Sanna H…" — kirjain H nostaa Samin ensimmäiseksi, ja kolmas
 * kirjain pudottaa hänet takaisin. Kohdistus seurasi liikkuvaa riviä tai jäi väärään
 * kenttään, eikä nimeä voinut kirjoittaa loppuun.
 */
const globaalit = { stubs: { RouterLink: { template: '<a><slot /></a>' } } }

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
