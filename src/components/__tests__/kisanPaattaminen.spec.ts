import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import KisanPaattaminen from '../KisanPaattaminen.vue'
import { useKisaStore } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'

const globaalit = { stubs: { RouterLink: { template: '<a><slot /></a>' } } }

function nappi(wrapper: ReturnType<typeof mount>, teksti: string) {
  const napit = wrapper.findAll('button').filter((b) => b.text() === teksti)
  if (napit.length === 0) throw new Error(`Painiketta "${teksti}" ei löytynyt`)
  return napit[0]!
}

describe('KisanPaattaminen', () => {
  let kisa: ReturnType<typeof useKisaStore>
  let laite: ReturnType<typeof useLaiteStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    kisa = useKisaStore()
    laite = useLaiteStore()
    localStorage.clear()
  })

  function lisaaTuloksia() {
    const k = kisa.lisaaKilpailija({ etunimi: 'Sami', sukunimi: 'Hänninen', yhdistys: 'Nupures' })
    kisa.lisaaOsallistuminen(k.id, 'RA1')
    kisa.asetaLaukaus(k.id, 'RA1', 0, 0, 10)
    return k
  }

  it('kertoo kun poistettavaa ei ole', () => {
    const wrapper = mount(KisanPaattaminen, { global: globaalit })
    expect(wrapper.text()).toContain('ei ole kisatietoja')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('varoittaa, jos tuloksia ei ole viety tiedostoon', () => {
    lisaaTuloksia()
    const wrapper = mount(KisanPaattaminen, { global: globaalit })

    expect(wrapper.text()).toContain('Tuloksia ei ole viety tiedostoon')
    // Vienti tarjotaan ensisijaisena vaihtoehtona ennen poistoa.
    expect(wrapper.text()).toContain('Vie tulokset ensin')
  })

  it('näyttää viennin ajankohdan, kun tulokset on viety', () => {
    lisaaTuloksia()
    laite.merkitseVienti(new Date('2026-06-15T10:30:00').toISOString())
    const wrapper = mount(KisanPaattaminen, { global: globaalit })

    expect(wrapper.text()).toContain('Tulokset viety tiedostoon')
    expect(wrapper.text()).not.toContain('Vie tulokset ensin')
  })

  it('poisto vaatii vahvistuksen', async () => {
    lisaaTuloksia()
    const wrapper = mount(KisanPaattaminen, { global: globaalit })

    await nappi(wrapper, 'Aloita uusi kisa').trigger('click')
    // Ensimmäinen napautus vain kysyy.
    expect(kisa.kilpailijoita).toBe(1)
    expect(wrapper.text()).toContain('Poistetaanko 1 kilpailijan tiedot?')

    await nappi(wrapper, 'Peruuta').trigger('click')
    expect(kisa.kilpailijoita).toBe(1)
  })

  it('uusi kisa poistaa tulokset mutta säilyttää laiteasetukset', async () => {
    lisaaTuloksia()
    laite.nimea('Koje 1')
    laite.asetaSyottotapa('taulukko')
    laite.merkitseVienti(new Date().toISOString())
    const tunniste = laite.laiteId

    const wrapper = mount(KisanPaattaminen, { global: globaalit })
    await nappi(wrapper, 'Aloita uusi kisa').trigger('click')
    await nappi(wrapper, 'Kyllä, poista kisan tiedot').trigger('click')

    expect(kisa.kilpailijoita).toBe(0)
    // Laite jatkaa käytössä, joten sen asetukset säilyvät.
    expect(laite.laiteId).toBe(tunniste)
    expect(laite.laiteNimi).toBe('Koje 1')
    expect(laite.syottotapa).toBe('taulukko')
    // Kisakohtaiset merkinnät nollautuvat.
    expect(laite.viimeinenVienti).toBe('')
    expect(wrapper.text()).toContain('Kisan tiedot poistettu')
  })

  it('uusi kisa saa uuden tunnuksen', async () => {
    lisaaTuloksia()
    const vanhaKisaId = kisa.kisa.kisaId

    const wrapper = mount(KisanPaattaminen, { global: globaalit })
    await nappi(wrapper, 'Aloita uusi kisa').trigger('click')
    await nappi(wrapper, 'Kyllä, poista kisan tiedot').trigger('click')

    expect(kisa.kisa.kisaId).not.toBe(vanhaKisaId)
  })

  it('kaikkien tietojen poisto nollaa myös laitetunnisteen', async () => {
    lisaaTuloksia()
    laite.nimea('Koje 1')
    laite.merkitseLuovutetuksi()
    const tunniste = laite.laiteId

    const wrapper = mount(KisanPaattaminen, { global: globaalit })
    await nappi(wrapper, 'Poista kaikki tiedot').trigger('click')
    await nappi(wrapper, 'Kyllä, poista kaikki').trigger('click')

    expect(kisa.kilpailijoita).toBe(0)
    // Uusi tunniste: laitetta ei voi yhdistää edelliseen kisaan.
    expect(laite.laiteId).not.toBe(tunniste)
    expect(laite.laiteNimi).toBe('')
    expect(laite.luovutettu).toBe(false)
    expect(wrapper.text()).toContain('Kaikki tiedot poistettu')
  })

  it('poistaa myös pysyvän tallennuksen', async () => {
    lisaaTuloksia()
    localStorage.setItem('kisa', '{"vanhaa":"dataa"}')
    localStorage.setItem('laite', '{"vanhaa":"dataa"}')

    const wrapper = mount(KisanPaattaminen, { global: globaalit })
    await nappi(wrapper, 'Poista kaikki tiedot').trigger('click')
    await nappi(wrapper, 'Kyllä, poista kaikki').trigger('click')

    // Muistista nollaaminen ei riitä: myös tallennettu kopio on poistettava.
    expect(localStorage.getItem('kisa')).toBeNull()
    expect(localStorage.getItem('laite')).toBeNull()
  })

  /*
   * Talteen otetuissa tallennuksissa on kilpailijoiden nimiä. Jos ne jäisivät laitteelle,
   * sovellus lupaisi tyhjentäneensä laitteen ja jättäisi silti henkilötiedot muistiin.
   */
  it('poistaa myös talteen otetut varmuuskopiot', async () => {
    lisaaTuloksia()
    localStorage.setItem('kisa-varmuuskopio-v2', '{"kisa":{"kilpailijat":[]}}')
    localStorage.setItem('kisa-varmuuskopio-rikki', '{ rikki')

    const wrapper = mount(KisanPaattaminen, { global: globaalit })
    await nappi(wrapper, 'Poista kaikki tiedot').trigger('click')
    await nappi(wrapper, 'Kyllä, poista kaikki').trigger('click')

    expect(localStorage.getItem('kisa-varmuuskopio-v2')).toBeNull()
    expect(localStorage.getItem('kisa-varmuuskopio-rikki')).toBeNull()
  })

  it('uusi kisa poistaa varmuuskopiot mutta säilyttää laiteasetukset', async () => {
    lisaaTuloksia()
    laite.nimea('Koje 1')
    localStorage.setItem('kisa-varmuuskopio-v2', '{"kisa":{"kilpailijat":[]}}')

    const wrapper = mount(KisanPaattaminen, { global: globaalit })
    await nappi(wrapper, 'Aloita uusi kisa').trigger('click')
    await nappi(wrapper, 'Kyllä, poista kisan tiedot').trigger('click')

    expect(localStorage.getItem('kisa-varmuuskopio-v2')).toBeNull()
    expect(laite.laiteNimi).toBe('Koje 1')
  })

  it('kahta vahvistusta ei voi olla auki yhtä aikaa', async () => {
    lisaaTuloksia()
    const wrapper = mount(KisanPaattaminen, { global: globaalit })

    await nappi(wrapper, 'Aloita uusi kisa').trigger('click')
    expect(wrapper.text()).toContain('Poistetaanko 1 kilpailijan tiedot?')

    await nappi(wrapper, 'Poista kaikki tiedot').trigger('click')
    // Edellinen varmistus sulkeutuu, jottei väärää painiketta paina vahingossa.
    expect(wrapper.text()).not.toContain('Poistetaanko 1 kilpailijan tiedot?')
    expect(wrapper.text()).toContain('myös laitteen asetukset')
  })
})
