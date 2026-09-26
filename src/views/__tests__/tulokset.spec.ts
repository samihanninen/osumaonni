import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import SijoituksetView from '../SijoituksetView.vue'
import YhdistyksetView from '../YhdistyksetView.vue'
import { useKisaStore } from '@/stores/kisa'
import type { IkaSarja, Laji, Luokka } from '@/types/kisa'

function luoRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'etusivu', component: { template: '<div />' } },
      { path: '/kisatiedot', name: 'kisatiedot', component: { template: '<div />' } },
      { path: '/syota/:laji', name: 'syotto', component: { template: '<div />' } },
      { path: '/tulokset/:laji', name: 'sijoitukset', component: SijoituksetView },
    ],
  })
}

async function asennaSijoitukset(laji = 'RA1') {
  const router = luoRouter()
  await router.push(`/tulokset/${laji}`)
  await router.isReady()
  return mount(SijoituksetView, { global: { plugins: [router] } })
}

/** Lisää kilpailijan ja täyttää yhden kilpasarjan samalla arvolla. */
function lisaa(
  store: ReturnType<typeof useKisaStore>,
  nimi: [string, string],
  yhdistys: string,
  laji: Laji,
  arvo: number,
  optiot: { luokka?: Luokka; ikasarja?: IkaSarja; sarja?: number } = {},
) {
  const k = store.lisaaKilpailija({
    etunimi: nimi[0],
    sukunimi: nimi[1],
    yhdistys,
    ikasarja: optiot.ikasarja ?? 'H',
  })
  store.lisaaOsallistuminen(k.id, laji, optiot.luokka ?? 'vakio')
  const maaritys = store.kisa.asetukset.lajiMaaritykset[laji]
  const sarja = optiot.sarja ?? 0
  for (let i = 0; i < maaritys.laukauksiaSarjassa; i++) {
    store.asetaLaukaus(k.id, laji, sarja, i, arvo)
  }
  return k
}

describe('SijoituksetView', () => {
  let store: ReturnType<typeof useKisaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
  })

  it('kertoo tyhjästä tuloslistasta', async () => {
    const wrapper = await asennaSijoitukset()
    expect(wrapper.text()).toContain('Ei tuloksia')
  })

  it('näyttää kilpailijat tulosjärjestyksessä', async () => {
    lisaa(store, ['Aaro', 'Ahonen'], 'Nupures', 'RA1', 7)
    lisaa(store, ['Bertta', 'Berg'], 'KaRes', 'RA1', 9)

    const wrapper = await asennaSijoitukset()
    const rivit = wrapper.findAll('tbody tr')
    expect(rivit).toHaveLength(2)
    expect(rivit[0]!.text()).toContain('Berg')
    expect(rivit[0]!.text()).toContain('90')
    expect(rivit[1]!.text()).toContain('Ahonen')
  })

  it('vakio ja avoin luokka näytetään erikseen', async () => {
    lisaa(store, ['Vakio', 'Ampuja'], 'N', 'RA1', 7, { luokka: 'vakio' })
    lisaa(store, ['Avoin', 'Ampuja'], 'N', 'RA1', 10, { luokka: 'avoin' })

    const wrapper = await asennaSijoitukset()
    // Oletuksena vakioluokka.
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('Vakio')

    const avoinNappi = wrapper.findAll('.pikkunappi').find((n) => n.text().startsWith('Avoin'))!
    await avoinNappi.trigger('click')

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('Avoin')
  })

  it('ikäsarjarajaus laskee sijoitukset rajauksen sisällä', async () => {
    lisaa(store, ['Nuori', 'Nopea'], 'N', 'RA1', 10, { ikasarja: 'H' })
    lisaa(store, ['Vanhempi', 'Varma'], 'N', 'RA1', 8, { ikasarja: 'H50' })

    const wrapper = await asennaSijoitukset()
    // Kaikki: H50-ampuja on toinen.
    let rivit = wrapper.findAll('tbody tr')
    expect(rivit).toHaveLength(2)
    expect(rivit[1]!.text()).toContain('Varma')

    const h50 = wrapper.findAll('.pikkunappi').find((n) => n.text() === 'H50')!
    await h50.trigger('click')

    rivit = wrapper.findAll('tbody tr')
    expect(rivit).toHaveLength(1)
    // Rajauksen sisällä hän on ensimmäinen, ei toinen.
    expect(rivit[0]!.find('.sija').text()).toBe('1')
    expect(wrapper.text()).toContain('laskettu ikäsarjan H50 sisällä')
  })

  it('merkitsee jaetut sijat ja hylätyt', async () => {
    lisaa(store, ['Aa', 'Yksi'], 'N', 'RA1', 8)
    lisaa(store, ['Bb', 'Kaksi'], 'N', 'RA1', 8)
    const hylatty = lisaa(store, ['Cc', 'Kolme'], 'N', 'RA1', 10)
    store.asetaHylatty(hylatty.id, 'RA1', true)

    const wrapper = await asennaSijoitukset()
    const rivit = wrapper.findAll('tbody tr')
    expect(rivit).toHaveLength(3)
    // Kaksi tasatulosta jakavat sijan 1.
    expect(rivit[0]!.find('.sija').text()).toContain('1')
    expect(rivit[1]!.find('.sija').text()).toContain('1')
    // Hylätty on lopussa ilman sijalukua.
    expect(rivit[2]!.text()).toContain('hylätty')
    expect(rivit[2]!.find('.sija').text()).toBe('—')
  })

  it('näyttää rangaistuksen vähennyksen', async () => {
    const k = lisaa(store, ['Aa', 'Yksi'], 'N', 'RA1', 10)
    store.asetaRangaistukset(k.id, 'RA1', 1)

    const wrapper = await asennaSijoitukset()
    expect(wrapper.text()).toContain('98')
    expect(wrapper.text()).toContain('−2')
  })

  it('RA2 näyttää kolme sarjasaraketta', async () => {
    lisaa(store, ['Aa', 'Yksi'], 'N', 'RA2', 8)
    const wrapper = await asennaSijoitukset('RA2')
    const otsikot = wrapper.findAll('thead th').map((t) => t.text())
    expect(otsikot).toContain('S1')
    expect(otsikot).toContain('S2')
    expect(otsikot).toContain('S3')
  })
})

describe('YhdistyksetView', () => {
  let store: ReturnType<typeof useKisaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
  })

  function asenna() {
    const router = luoRouter()
    return mount(YhdistyksetView, { global: { plugins: [router] } })
  }

  it('kertoo tyhjästä tilanteesta', () => {
    const wrapper = asenna()
    expect(wrapper.text()).toContain('Ei vielä tuloksia')
  })

  it('laskee parhaiden kolmen summan yhdistykselle', async () => {
    lisaa(store, ['A', 'Yksi'], 'Nupures', 'RA1', 10) // 100
    lisaa(store, ['B', 'Kaksi'], 'Nupures', 'RA1', 9) // 90
    lisaa(store, ['C', 'Kolme'], 'Nupures', 'RA1', 8) // 80
    lisaa(store, ['D', 'Nelja'], 'Nupures', 'RA1', 7) // 70, ei mukaan
    lisaa(store, ['E', 'Viisi'], 'KaRes', 'RA1', 6) // 60

    const wrapper = asenna()
    const teksti = wrapper.text()
    expect(teksti).toContain('270')
    expect(teksti).toContain('Nupures')
    expect(teksti).toContain('KaRes')
    // Vajaa joukkue merkitään.
    expect(teksti).toContain('vajaa')
  })

  it('laskee henkilökohtaisen kokonaiskilpailun', async () => {
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'Yksi', yhdistys: 'N' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    store.lisaaOsallistuminen(k.id, 'RA2')
    for (let i = 0; i < 10; i++) store.asetaLaukaus(k.id, 'RA1', 0, i, 8) // 80
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 6; i++) store.asetaLaukaus(k.id, 'RA2', s, i, 9) // 162
    }

    const wrapper = asenna()
    expect(wrapper.text()).toContain('Kokonaiskilpailu')
    expect(wrapper.text()).toContain('242')
  })

  it('aseluokkarajaus vaikuttaa yhdistystuloksiin', async () => {
    lisaa(store, ['A', 'Yksi'], 'Nupures', 'RA1', 10, { luokka: 'vakio' })
    lisaa(store, ['B', 'Kaksi'], 'Nupures', 'RA1', 5, { luokka: 'avoin' })

    const wrapper = asenna()
    // Kaikki yhdessä: 100 + 50 = 150.
    expect(wrapper.text()).toContain('150')

    const vakio = wrapper.findAll('.pikkunappi').find((n) => n.text() === 'Vakio')!
    await vakio.trigger('click')
    expect(wrapper.text()).toContain('100')
  })
})

/**
 * Suodattimien "ei rajausta" -tila.
 *
 * Rajaamattomuutta merkittiin ennen merkkijonolla "kaikki". Mukautetussa kisassa sarjan ja
 * aseluokan nimeää järjestäjä, joten juuri sen niminen sarja olisi ollut sama asia kuin
 * rajauksen poisto: hänen kilpailijansa olisivat kadonneet omasta listastaan, ja lista
 * olisi näyttänyt koko kisan ilman että mikään kertoi rajauksen pudonneen.
 */
describe('suodatin sarjalla nimeltä "kaikki"', () => {
  let store: ReturnType<typeof useKisaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useKisaStore()
    store.asetaKisaTyyppi('mukautettu')
    store.lisaaSarja('kaikki')
  })

  /** Mukautettu laji ja kaksi ampujaa eri sarjoissa, jotta rajauksen näkee. */
  function perusta() {
    const laji = store.lisaaMukautettuLaji({ koodi: 'PK', nimi: 'Pikakivääri' })
    const tee = (sukunimi: string, sarja: string, arvo: number) => {
      const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi, yhdistys: 'N', ikasarja: sarja })
      store.lisaaOsallistuminen(k.id, laji.id)
      for (let i = 0; i < 10; i++) store.asetaLaukaus(k.id, laji.id, 0, i, arvo)
      return k
    }
    tee('Kaikkilainen', 'kaikki', 9)
    tee('Yleinen', 'Yleinen', 8)
    return laji
  }

  async function asenna(lajiId: string) {
    const router = luoRouter()
    await router.push('/tulokset/' + lajiId)
    await router.isReady()
    return mount(SijoituksetView, { global: { plugins: [router] } })
  }

  it('rajaus sarjaan "kaikki" näyttää vain sen sarjan', async () => {
    const laji = perusta()
    const wrapper = await asenna(laji.id)

    // Sarjanappi, ei rajauksen poistava "Kaikki"-nappi (eri kirjainkoko, eri merkitys).
    const nappi = wrapper.findAll('button').find((b) => b.text() === 'kaikki')!
    await nappi.trigger('click')

    const rivit = wrapper.findAll('tbody tr')
    expect(rivit).toHaveLength(1)
    expect(rivit[0]!.text()).toContain('Kaikkilainen')
    // Otsikko kertoo rajauksen, joten tulkinta ei jää arvailun varaan.
    expect(wrapper.find('.tulososio').text()).toContain('kaikki')
  })

  it('ilman rajausta näkyvät kaikki sarjat', async () => {
    const laji = perusta()
    const wrapper = await asenna(laji.id)

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })
})
