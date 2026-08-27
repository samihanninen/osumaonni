import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import KisatiedotView from '../KisatiedotView.vue'
import KilpailijatView from '../KilpailijatView.vue'
import EtusivuView from '../EtusivuView.vue'
import OhjeView from '../OhjeView.vue'
import { useKisaStore } from '@/stores/kisa'

/**
 * Savutestit: varmistavat että näkymät renderöityvät ilman ajonaikaisia virheitä.
 * Tyyppitarkistus ei huomaa esimerkiksi puuttuvaa viittausta templaatissa.
 */

const globaalit = {
  stubs: { RouterLink: { template: '<a><slot /></a>' } },
}

describe('näkymien renderöinti', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('etusivu renderöityy ja kertoo paikallisesta tallennuksesta', () => {
    const wrapper = mount(EtusivuView, { global: globaalit })
    expect(wrapper.text()).toContain('Tiedot tallentuvat vain tähän laitteeseen')
  })

  /*
   * Ohje on käännösaikana mukaan luettu tiedosto. Testi varmistaa, että se todella
   * päätyy nippuun: ilman sitä näkymä olisi tyhjä vasta radalla, ilman verkkoyhteyttä.
   */
  it('ohjenäkymä renderöi kisapäivän muistilistan', () => {
    const wrapper = mount(OhjeView, { global: globaalit })
    expect(wrapper.text()).toContain('Kilpailupäivän ohje')
    expect(wrapper.text()).toContain('Myöhemmin')
    // Markdown on jäsennetty rakenteeksi, ei jätetty raa'aksi tekstiksi.
    expect(wrapper.findAll('ol').length).toBeGreaterThan(0)
    expect(wrapper.findAll('strong').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.huomio--varoitus').length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('**')
  })

  it('kisatiedot renderöityy ja näyttää lajien rakenteen', () => {
    const wrapper = mount(KisatiedotView, { global: globaalit })
    const teksti = wrapper.text()
    expect(teksti).toContain('Kisatiedot')
    // Rakennetaulukossa on rivi jokaiselle lajille.
    for (const laji of ['RA1', 'RA2', 'RA3', 'RA4']) expect(teksti).toContain(laji)
    // RA2:n maksimi on 180 ja RA1:n 100.
    expect(teksti).toContain('180')
    expect(teksti).toContain('100')
  })

  it('kisatiedot sitoo kisan nimen storeen', async () => {
    const store = useKisaStore()
    const wrapper = mount(KisatiedotView, { global: globaalit })
    await wrapper.get('#nimi').setValue('Nupureksen mestaruuskilpailut')
    expect(store.kisa.kisatiedot.nimi).toBe('Nupureksen mestaruuskilpailut')
  })

  it('kilpailijat-näkymä kertoo tyhjästä listasta', () => {
    const wrapper = mount(KilpailijatView, { global: globaalit })
    expect(wrapper.text()).toContain('Ei vielä kilpailijoita')
  })

  it('kilpailijan lisääminen vaatii sukunimen', async () => {
    const store = useKisaStore()
    const wrapper = mount(KilpailijatView, { global: globaalit })

    await wrapper.get('#etunimi').setValue('Sanna')
    await wrapper.get('form').trigger('submit')

    expect(store.kilpailijoita).toBe(0)
    expect(wrapper.text()).toContain('Sukunimi on pakollinen')
  })

  it('kilpailijan lisääminen onnistuu ja rivi näkyy listassa', async () => {
    const store = useKisaStore()
    const wrapper = mount(KilpailijatView, { global: globaalit })

    await wrapper.get('#etunimi').setValue('Sanna')
    await wrapper.get('#sukunimi').setValue('Hakala')
    await wrapper.get('#yhdistys').setValue('Nupures')
    await wrapper.get('form').trigger('submit')

    expect(store.kilpailijoita).toBe(1)
    expect(wrapper.text()).toContain('1 kilpailijaa')
    // Yhdistys jää lomakkeeseen seuraavaa kilpailijaa varten.
    expect((wrapper.get('#yhdistys').element as HTMLInputElement).value).toBe('Nupures')
    expect((wrapper.get('#sukunimi').element as HTMLInputElement).value).toBe('')
  })

  it('lajivalinta luo osallistumisen ja näyttää aseluokan', async () => {
    const store = useKisaStore()
    const wrapper = mount(KilpailijatView, { global: globaalit })

    await wrapper.get('#etunimi').setValue('Sanna')
    await wrapper.get('#sukunimi').setValue('Hakala')
    await wrapper.get('form').trigger('submit')

    const id = store.kisa.kilpailijat[0]!.id
    const ruudut = wrapper.findAll('input[type="checkbox"]')
    expect(ruudut).toHaveLength(4) // RA1–RA4

    await ruudut[0]!.setValue(true)
    expect(store.kilpailija(id)?.osallistumiset.RA1).toBeDefined()
    expect(store.kilpailija(id)?.osallistumiset.RA1?.kilpasarjat).toHaveLength(2)

    // Aseluokkavalitsin ilmestyy vasta osallistumisen myötä.
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('select').length).toBeGreaterThan(1)

    await ruudut[0]!.setValue(false)
    expect(store.kilpailija(id)?.osallistumiset.RA1).toBeUndefined()
  })

  it('poisto vaatii vahvistuksen', async () => {
    const store = useKisaStore()
    const wrapper = mount(KilpailijatView, { global: globaalit })

    await wrapper.get('#sukunimi').setValue('Hakala')
    await wrapper.get('form').trigger('submit')
    expect(store.kilpailijoita).toBe(1)

    const poistoNapit = wrapper.findAll('button').filter((b) => b.text() === 'Poista')
    await poistoNapit[0]!.trigger('click')
    // Ensimmäinen napautus vain kysyy varmistusta.
    expect(store.kilpailijoita).toBe(1)
    expect(wrapper.text()).toContain('Poistetaanko myös kirjatut tulokset?')

    const varmaNapit = wrapper.findAll('button').filter((b) => b.text() === 'Kyllä, poista')
    await varmaNapit[0]!.trigger('click')
    expect(store.kilpailijoita).toBe(0)
  })
})
