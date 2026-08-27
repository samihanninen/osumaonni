import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import SyottoView from '../SyottoView.vue'
import TuloskorttiTaulukko from '@/components/TuloskorttiTaulukko.vue'
import { useKisaStore } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'
import { LAJIT, resulRakenne } from '@/core/lajit'
import type { Kilpailija } from '@/types/kisa'

/**
 * jsdom ei toteuta matchMedia:a, joten useMediaKysely palauttaa false ja näkymä
 * käyttää kosketusnäppäimistöä. Juuri se on tässä testattava polku.
 */

function luoRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'etusivu', component: { template: '<div />' } },
      { path: '/syota/:laji', name: 'syotto', component: SyottoView },
      { path: '/kilpailijat', name: 'kilpailijat', component: { template: '<div />' } },
    ],
  })
}

async function asenna(laji = 'RA1') {
  const router = luoRouter()
  await router.push(`/syota/${laji}`)
  await router.isReady()
  const wrapper = mount(SyottoView, { global: { plugins: [router] } })
  await wrapper.vm.$nextTick()
  return wrapper
}

/** Näppäimistön arvonäppäimet järjestyksessä 7 8 9 10 4 5 6 ★ 1 2 3 – */
function arvoNappain(wrapper: Awaited<ReturnType<typeof asenna>>, teksti: string) {
  const napit = wrapper.findAll('.nappain')
  const nappi = napit.find((n) => n.text() === teksti)
  if (!nappi) throw new Error(`Näppäintä "${teksti}" ei löytynyt`)
  return nappi
}

describe('SyottoView — kosketusnäppäimistö', () => {
  let store: ReturnType<typeof useKisaStore>
  let kilpailija: Kilpailija

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
    kilpailija = store.lisaaKilpailija({
      etunimi: 'Sanna',
      sukunimi: 'Hakala',
      yhdistys: 'Nupures',
    })
    store.lisaaOsallistuminen(kilpailija.id, 'RA1')
  })

  it('ei renderöi tekstikenttiä, joten laitteen näppäimistö ei avaudu', async () => {
    const wrapper = await asenna()
    // Vain lisätiedoissa on number-kenttä; laukausten syöttö on pelkkiä painikkeita.
    expect(wrapper.findAll('input[type="text"]')).toHaveLength(0)
    expect(wrapper.findAll('.nappain').length).toBeGreaterThan(10)
  })

  it('näppäin kirjaa laukauksen ja siirtyy seuraavaan ruutuun', async () => {
    const wrapper = await asenna()

    await arvoNappain(wrapper, '9').trigger('click')
    await arvoNappain(wrapper, '10').trigger('click')

    const laukaukset = store.kilpailija(kilpailija.id)?.osallistumiset.RA1?.kilpasarjat[0]
      ?.laukaukset
    expect(laukaukset?.[0]).toBe(9)
    expect(laukaukset?.[1]).toBe(10)
    expect(laukaukset?.[2]).toBeNull()
  })

  it('napakymppi ja ohilaukaus kirjautuvat omina merkkeinään', async () => {
    const wrapper = await asenna()

    await arvoNappain(wrapper, '★').trigger('click')
    await arvoNappain(wrapper, '–').trigger('click')

    const laukaukset = store.kilpailija(kilpailija.id)?.osallistumiset.RA1?.kilpasarjat[0]
      ?.laukaukset
    expect(laukaukset?.[0]).toBe('*')
    expect(laukaukset?.[1]).toBe('-')
  })

  it('sarjan täyttyessä siirtyy seuraavaan kilpasarjaan', async () => {
    const wrapper = await asenna()

    // RA1: 2 × 10. Täytetään ensimmäinen sarja kokonaan.
    for (let i = 0; i < 10; i++) await arvoNappain(wrapper, '8').trigger('click')
    // Yhdestoista painallus menee toiseen sarjaan.
    await arvoNappain(wrapper, '5').trigger('click')

    const sarjat = store.kilpailija(kilpailija.id)?.osallistumiset.RA1?.kilpasarjat
    expect(sarjat?.[0]?.laukaukset.every((l) => l === 8)).toBe(true)
    expect(sarjat?.[1]?.laukaukset[0]).toBe(5)
  })

  it('peruutus tyhjentää edellisen kirjatun laukauksen', async () => {
    const wrapper = await asenna()

    await arvoNappain(wrapper, '7').trigger('click')
    await arvoNappain(wrapper, '9').trigger('click')

    const peruuta = wrapper.findAll('.nappain').find((n) => n.text() === '⌫')!
    await peruuta.trigger('click')

    const laukaukset = store.kilpailija(kilpailija.id)?.osallistumiset.RA1?.kilpasarjat[0]
      ?.laukaukset
    // Aktiivinen ruutu oli tyhjä indeksissä 2, joten peruutus poistaa indeksin 1.
    expect(laukaukset?.[0]).toBe(7)
    expect(laukaukset?.[1]).toBeNull()
  })

  it('näyttää lasketun tuloksen kortissa', async () => {
    const wrapper = await asenna()
    for (let i = 0; i < 10; i++) await arvoNappain(wrapper, '10').trigger('click')
    expect(wrapper.text()).toContain('100')
  })

  it('siirtyy kilpailijasta toiseen', async () => {
    const toinen = store.lisaaKilpailija({ etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes' })
    store.lisaaOsallistuminen(toinen.id, 'RA1')

    const wrapper = await asenna()
    // Sukunimen mukaan Ahonen on ensimmäinen.
    expect(wrapper.text()).toContain('Aada Ahonen')
    expect(wrapper.get('.laskuri').text()).toBe('1 / 2')

    const seuraava = wrapper.findAll('.nappain').find((n) => n.text().includes('Seuraava'))!
    await seuraava.trigger('click')
    expect(wrapper.text()).toContain('Sanna Hakala')
    expect(wrapper.get('.laskuri').text()).toBe('2 / 2')
  })

  it('valitsimesta voi hypätä suoraan kilpailijaan', async () => {
    const toinen = store.lisaaKilpailija({ etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes' })
    store.lisaaOsallistuminen(toinen.id, 'RA1')
    const kolmas = store.lisaaKilpailija({ etunimi: 'Cecil', sukunimi: 'Cronberg', yhdistys: 'X' })
    store.lisaaOsallistuminen(kolmas.id, 'RA1')

    const wrapper = await asenna()
    expect(wrapper.text()).toContain('Aada Ahonen')

    // Kolmanteen suoraan, ilman kahta erillistä "Seuraava"-napautusta.
    // Aakkosjärjestys: Ahonen (0), Cronberg (1), Hakala (2).
    await wrapper.get('#kilpailijavalinta').setValue('2')
    expect(wrapper.text()).toContain('Sanna Hakala')
    expect(wrapper.get('.laskuri').text()).toBe('3 / 3')

    await wrapper.get('#kilpailijavalinta').setValue('1')
    expect(wrapper.text()).toContain('Cecil Cronberg')
    expect(wrapper.get('.laskuri').text()).toBe('2 / 3')
  })

  it('valitsin näyttää kirjaamisen tilan', async () => {
    const wrapper = await asenna()
    // Aluksi tyhjä.
    expect(wrapper.get('#kilpailijavalinta').text()).toContain('tyhjä')

    // Yksi laukaus → kesken, 1/20.
    await arvoNappain(wrapper, '9').trigger('click')
    expect(wrapper.get('#kilpailijavalinta').text()).toContain('1/20')
  })

  it('väärän ruudun voi korjata napauttamalla sitä ja syöttämällä uuden arvon', async () => {
    const wrapper = await asenna()

    await arvoNappain(wrapper, '9').trigger('click')
    await arvoNappain(wrapper, '8').trigger('click')
    await arvoNappain(wrapper, '7').trigger('click')

    // Toinen laukaus meni väärin: napautetaan sitä ja syötetään oikea arvo.
    const ruudut = wrapper.findAll('.ruutu')
    await ruudut[1]!.trigger('click')
    await arvoNappain(wrapper, '10').trigger('click')

    const laukaukset = store.kilpailija(kilpailija.id)?.osallistumiset.RA1?.kilpasarjat[0]
      ?.laukaukset
    expect(laukaukset?.slice(0, 3)).toEqual([9, 10, 7])
  })

  it('kertoo jos lajiin ei osallistu kukaan', async () => {
    const wrapper = await asenna('RA3')
    expect(wrapper.text()).toContain('Yksikään kilpailija ei osallistu lajiin RA3')
  })

  it('luovutettu laite lukitsee näppäimistön', async () => {
    const laite = useLaiteStore()
    laite.merkitseLuovutetuksi()

    const wrapper = await asenna()
    expect(wrapper.text()).toContain('luovuttanut kisan eteenpäin')
    expect(arvoNappain(wrapper, '9').attributes('disabled')).toBeDefined()
  })

  it('RA2 näyttää kolme kuuden laukauksen sarjaa', async () => {
    store.lisaaOsallistuminen(kilpailija.id, 'RA2')
    const wrapper = await asenna('RA2')
    expect(wrapper.text()).toContain('3 × 6 laukausta')
    expect(wrapper.text()).toContain('sarjojen summa')
    // Kolme sarjaa × 6 ruutua = 18 laukausruutua.
    expect(wrapper.findAll('.ruutu')).toHaveLength(18)
  })
})

describe('TuloskorttiTaulukko — näppäimistösyöttö', () => {
  let store: ReturnType<typeof useKisaStore>
  let kilpailija: Kilpailija

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
    kilpailija = store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'N' })
    store.lisaaOsallistuminen(kilpailija.id, 'RA1')
  })

  function asennaTaulukko() {
    return mount(TuloskorttiTaulukko, {
      props: {
        kilpailijat: [store.kisa.kilpailijat[0]!],
        laji: 'RA1',
        rakenne: resulRakenne('RA1', LAJIT.RA1),
      },
    })
  }

  it('yksinumeroinen arvo kirjautuu heti', async () => {
    const wrapper = asennaTaulukko()
    await wrapper.findAll('.ruutu')[0]!.trigger('keydown', { key: '7' })
    expect(wrapper.emitted('syota')?.[0]).toEqual([kilpailija.id, 0, 0, 7])
  })

  it('ykkönen ja nolla muodostavat kympin', async () => {
    const wrapper = asennaTaulukko()
    const ruutu = wrapper.findAll('.ruutu')[0]!

    await ruutu.trigger('keydown', { key: '1' })
    expect(wrapper.emitted('syota')?.[0]).toEqual([kilpailija.id, 0, 0, 1])

    await ruutu.trigger('keydown', { key: '0' })
    // Sama ruutu päivittyy kympiksi eikä nolla mene seuraavaan ruutuun.
    expect(wrapper.emitted('syota')?.[1]).toEqual([kilpailija.id, 0, 0, 10])
  })

  it('ykkösen jälkeen muu numero jää voimaan ja uusi arvo menee seuraavaan ruutuun', async () => {
    const wrapper = asennaTaulukko()
    // Ykkösen jälkeen kohdistus JÄÄ samaan ruutuun odottamaan nollaa, joten myös
    // seuraava näppäin osuu samaan ruutuun. Ykkönen ei silti saa kadota.
    const ruutu = wrapper.findAll('.ruutu')[0]!

    await ruutu.trigger('keydown', { key: '1' })
    await ruutu.trigger('keydown', { key: '5' })

    expect(wrapper.emitted('syota')?.[0]).toEqual([kilpailija.id, 0, 0, 1])
    expect(wrapper.emitted('syota')?.[1]).toEqual([kilpailija.id, 0, 1, 5])
  })

  it('nopea sarja 1 5 9 kirjautuu kolmeen eri ruutuun', async () => {
    const wrapper = asennaTaulukko()
    const ruudut = wrapper.findAll('.ruutu')

    // Ykkönen jättää kohdistuksen paikalleen, joten viitonen tulee samaan ruutuun...
    await ruudut[0]!.trigger('keydown', { key: '1' })
    await ruudut[0]!.trigger('keydown', { key: '5' })
    // ...ja ysi jo seuraavaan, koska viitonen siirsi kohdistuksen.
    await ruudut[2]!.trigger('keydown', { key: '9' })

    expect(wrapper.emitted('syota')).toEqual([
      [kilpailija.id, 0, 0, 1],
      [kilpailija.id, 0, 1, 5],
      [kilpailija.id, 0, 2, 9],
    ])
  })

  it('kaksi ykköstä peräkkäin kirjautuu erillisiksi laukauksiksi', async () => {
    const wrapper = asennaTaulukko()
    const ruutu = wrapper.findAll('.ruutu')[0]!

    await ruutu.trigger('keydown', { key: '1' })
    await ruutu.trigger('keydown', { key: '1' })

    expect(wrapper.emitted('syota')?.[0]).toEqual([kilpailija.id, 0, 0, 1])
    expect(wrapper.emitted('syota')?.[1]).toEqual([kilpailija.id, 0, 1, 1])
  })

  it('ykkönen sarjan viimeisessä ruudussa ei vuoda seuraavan rivin yli', async () => {
    const wrapper = asennaTaulukko()
    const ruudut = wrapper.findAll('.ruutu')
    // RA1: 2 × 10 = 20 ruutua, viimeinen indeksi 19.
    const viimeinen = ruudut[19]!

    await viimeinen.trigger('keydown', { key: '1' })
    await viimeinen.trigger('keydown', { key: '5' })

    // Ykkönen kirjautui, mutta viitoselle ei ole ruutua — sitä ei kirjata minnekään.
    expect(wrapper.emitted('syota')).toEqual([[kilpailija.id, 1, 9, 1]])
  })

  it('tähti on napakymppi ja nolla ohilaukaus', async () => {
    const wrapper = asennaTaulukko()
    const ruudut = wrapper.findAll('.ruutu')

    await ruudut[0]!.trigger('keydown', { key: '*' })
    await ruudut[1]!.trigger('keydown', { key: '0' })

    expect(wrapper.emitted('syota')?.[0]).toEqual([kilpailija.id, 0, 0, '*'])
    expect(wrapper.emitted('syota')?.[1]).toEqual([kilpailija.id, 0, 1, '-'])
  })

  it('askelpalautin tyhjentää ruudun', async () => {
    const wrapper = asennaTaulukko()
    await wrapper.findAll('.ruutu')[0]!.trigger('keydown', { key: 'Backspace' })
    expect(wrapper.emitted('syota')?.[0]).toEqual([kilpailija.id, 0, 0, null])
  })

  it('kirjaimet hylätään', async () => {
    const wrapper = asennaTaulukko()
    await wrapper.findAll('.ruutu')[0]!.trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('syota')).toBeUndefined()
  })

  it('luokan, rikkeiden ja hylkäyksen muutokset välittyvät', async () => {
    const wrapper = asennaTaulukko()

    await wrapper.get('.luokkavalinta').setValue('avoin')
    expect(wrapper.emitted('luokka')?.[0]).toEqual([kilpailija.id, 'avoin'])

    await wrapper.get('.rikesolu').setValue('2')
    expect(wrapper.emitted('rangaistukset')?.[0]).toEqual([kilpailija.id, 2])

    await wrapper.get('.hylkays').setValue(true)
    expect(wrapper.emitted('hylatty')?.[0]).toEqual([kilpailija.id, true])
  })

  it('lukittu taulukko estää syötön', () => {
    const wrapper = mount(TuloskorttiTaulukko, {
      props: {
        kilpailijat: [store.kisa.kilpailijat[0]!],
        laji: 'RA1',
        rakenne: resulRakenne('RA1', LAJIT.RA1),
        lukittu: true,
      },
    })
    expect(wrapper.findAll('.ruutu')[0]!.attributes('disabled')).toBeDefined()
  })
})

/**
 * Mukautettu kisa syötössä.
 *
 * Olennaista on eri mittaiset sarjat: taulukkosyöttö numeroi laukaukset yhtenä jonona,
 * joten tasamittaisuuteen nojaava jakolasku menisi väärään ruutuun heti ensimmäisen
 * lyhyen sarjan jälkeen.
 */
describe('SyottoView — mukautettu kisa', () => {
  let store: ReturnType<typeof useKisaStore>
  let lajiId: string

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
    store.asetaKisaTyyppi('mukautettu')
    const laji = store.lisaaMukautettuLaji({ koodi: '3-as', nimi: 'Kolme asentoa' })
    lajiId = laji.id
    store.asetaKilpasarjat(lajiId, [
      { nimi: 'Makuu', laukauksia: 3 },
      { nimi: 'Polvi', laukauksia: 2 },
      { nimi: 'Pysty', laukauksia: 1 },
    ])
    const k = store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    store.lisaaOsallistuminen(k.id, lajiId)
  })

  it('näyttää lajin oman lyhenteen ja sarjarakenteen', async () => {
    const wrapper = await asenna(lajiId)

    expect(wrapper.text()).toContain('3-as')
    // Eri mittaiset sarjat luetellaan, koska kertolasku ei kuvaisi niitä.
    expect(wrapper.text()).toContain('3 + 2 + 1 laukausta')
  })

  it('näyttää sarjojen omat nimet', async () => {
    const wrapper = await asenna(lajiId)

    expect(wrapper.text()).toContain('Makuu')
    expect(wrapper.text()).toContain('Polvi')
    expect(wrapper.text()).toContain('Pysty')
  })

  it('kirjaa laukauksen mukautettuun lajiin', async () => {
    const wrapper = await asenna(lajiId)

    await arvoNappain(wrapper, '9').trigger('click')

    const k = store.kisa.kilpailijat[0]!
    expect(k.osallistumiset[lajiId]?.kilpasarjat[0]?.laukaukset[0]).toBe(9)
  })

  it('sarjoissa on kussakin oma määrä ruutuja', async () => {
    const wrapper = await asenna(lajiId)

    // Kortissa yksi ruutu per laukaus: 3 + 2 + 1.
    expect(wrapper.findAll('.ruutu')).toHaveLength(6)

    const sarjat = store.kisa.kilpailijat[0]!.osallistumiset[lajiId]!.kilpasarjat
    expect(sarjat.map((s) => s.laukaukset.length)).toEqual([3, 2, 1])
  })

  it('kertoo jos kisassa ei ole lajeja', async () => {
    store.poistaMukautettuLaji(lajiId)
    const wrapper = await asenna('mitaan')

    expect(wrapper.text()).toContain('Kisassa ei ole vielä lajeja')
  })
})
