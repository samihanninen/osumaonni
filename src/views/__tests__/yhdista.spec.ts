import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import YhdistaView from '../YhdistaView.vue'
import { useKisaStore } from '@/stores/kisa'
import { useLaiteStore } from '@/stores/laite'
import { paketoi, rakennaOsapaketti, rakennaTayspaketti } from '@/io/siirto'
import { laskeVersio } from '@/core/yhdistaminen'
import { laskeLaji } from '@/core/laskenta'
import { LAJIT } from '@/core/lajit'
import type { Kisa, Laukaus } from '@/types/kisa'

/**
 * QR-komponentit korvataan tynkillä: jsdomissa ei ole canvasia eikä kameraa, eikä
 * niiden toiminta ole tämän näkymän logiikkaa. Siirtokoodi syötetään tekstinä, mikä on
 * sama polku kuin kameralla luettaessa.
 */
const globaalit = {
  stubs: {
    QrKoodi: { props: ['teksti'], template: '<div class="qr-tynka">{{ teksti }}</div>' },
    QrLukija: {
      template: '<div class="lukija-tynka" />',
      methods: {
        pysayta() {},
        nollaaViimeisin() {},
      },
    },
    RouterLink: { template: '<a><slot /></a>' },
  },
}

function luoRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'etusivu', component: { template: '<div />' } },
      { path: '/yhdista', name: 'yhdista', component: YhdistaView },
      { path: '/vienti', name: 'vienti', component: { template: '<div />' } },
    ],
  })
}

async function asenna(query = '') {
  const router = luoRouter()
  await router.push(`/yhdista${query}`)
  await router.isReady()
  const wrapper = mount(YhdistaView, { global: { ...globaalit, plugins: [router] } })
  await wrapper.vm.$nextTick()
  return wrapper
}

function kloonaa<T>(arvo: T): T {
  return JSON.parse(JSON.stringify(arvo)) as T
}

/** Perustaa kisan, jossa on kaksi RA1-kilpailijaa. */
function perustaKisa() {
  const store = useKisaStore()
  const a = store.lisaaKilpailija({ etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes' })
  const b = store.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
  store.lisaaOsallistuminen(a.id, 'RA1')
  store.lisaaOsallistuminen(b.id, 'RA1')
  return { store, a, b }
}

function kirjaa(
  store: ReturnType<typeof useKisaStore>,
  id: string,
  arvot: Laukaus[],
  laji: 'RA1' = 'RA1',
) {
  arvot.forEach((arvo, i) => store.asetaLaukaus(id, laji, 0, i, arvo))
}

/** Rakentaa toisen laitteen paketin annetusta kisasta ja kirjauksista. */
function toiseltaLaitteelta(
  pohja: Kisa,
  kirjaukset: (store: ReturnType<typeof useKisaStore>) => void,
  tyyppi: 'osa' | 'taysi' = 'osa',
): string[] {
  const nykyinen = getActivePiniaSafe()
  setActivePinia(createPinia())
  const store = useKisaStore()
  store.korvaaKisa(kloonaa(pohja))
  kirjaukset(store)

  const tunnisteet = {
    laiteId: 'laite-B',
    laiteNimi: 'Koje 2',
    versio: laskeVersio(store.kisa),
    aika: '2026-06-15T12:00:00.000Z',
  }
  const paketti =
    tyyppi === 'taysi'
      ? rakennaTayspaketti(store.kisa, tunnisteet)
      : rakennaOsapaketti(store.kisa, tunnisteet)
  const palat = paketoi(paketti)

  setActivePinia(nykyinen)
  return palat
}

// Pinia ei tarjoa suoraa getteriä aktiiviselle instanssille testeissä, joten
// tallennetaan se itse.
let aktiivinenPinia: ReturnType<typeof createPinia>
function getActivePiniaSafe() {
  return aktiivinenPinia
}

/** Liittää siirtokoodin vastaanottonäkymään. */
async function liita(wrapper: Awaited<ReturnType<typeof asenna>>, palat: string[]) {
  await wrapper.findAll('.valilehti')[1]!.trigger('click')
  await wrapper.get('textarea').setValue(palat.join('\n'))
  await wrapper.get('.napit button').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('YhdistaView — lähettäminen', () => {
  beforeEach(() => {
    aktiivinenPinia = createPinia()
    setActivePinia(aktiivinenPinia)
  })

  it('näyttää molemmat välilehdet', async () => {
    const wrapper = await asenna()
    const valilehdet = wrapper.findAll('.valilehti').map((v) => v.text())
    expect(valilehdet).toEqual(['Lähetä', 'Vastaanota'])
  })

  it('kertoo tyhjästä kisasta eikä anna luoda koodia', async () => {
    const wrapper = await asenna()
    const nappi = wrapper.findAll('button').find((b) => b.text() === 'Luo siirtokoodi')!
    expect(nappi.attributes('disabled')).toBeDefined()
  })

  it('luo siirtokoodin ja näyttää QR-koodin', async () => {
    const { store, a } = perustaKisa()
    kirjaa(store, a.id, [9, 9, 9])

    const wrapper = await asenna()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Luo siirtokoodi')!
      .trigger('click')

    const qr = wrapper.get('.qr-tynka')
    expect(qr.text()).toMatch(/^OO1\./)
  })

  it('tarjoaa jakolinkin, kun koodi mahtuu yhteen osaan', async () => {
    const { store, a } = perustaKisa()
    kirjaa(store, a.id, [9, 9, 9])

    const wrapper = await asenna()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Luo siirtokoodi')!
      .trigger('click')

    expect(wrapper.findAll('button').some((b) => b.text() === 'Kopioi jakolinkki')).toBe(true)
    // QR on ainoa tapa, jossa tiedot eivät poistu paikalta — se on kerrottava.
    expect(wrapper.text()).toContain('QR-koodi on ainoa tapa')
  })

  it('koko kisan lähettäminen varoittaa korvaamisesta ja tarjoaa luovutuksen', async () => {
    const { store, a } = perustaKisa()
    kirjaa(store, a.id, [9, 9, 9])

    const wrapper = await asenna()
    // Valitaan arvon perusteella, ei järjestyksen: järjestys voi muuttua.
    await wrapper.find('input[type="radio"][value="taysi"]').setValue()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Luo siirtokoodi')!
      .trigger('click')

    expect(wrapper.text()).toContain('korvataan kokonaan')

    const laite = useLaiteStore()
    expect(laite.luovutettu).toBe(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Merkitse luovutetuksi')!
      .trigger('click')
    expect(laite.luovutettu).toBe(true)
  })
})

describe('YhdistaView — vastaanottaminen', () => {
  beforeEach(() => {
    aktiivinenPinia = createPinia()
    setActivePinia(aktiivinenPinia)
  })

  it('tyhjän päälle yhdistäminen tuo tulokset ilman ristiriitoja', async () => {
    const { store, a } = perustaKisa()
    const palat = toiseltaLaitteelta(store.kisa, (b) => {
      kirjaa(b, a.id, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
    })

    const wrapper = await asenna()
    await liita(wrapper, palat)

    expect(wrapper.text()).toContain('Tarkista ennen yhdistämistä')
    expect(wrapper.text()).toContain('Koje 2')
    expect(wrapper.text()).not.toContain('Ristiriidat')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Yhdistä tulokset')!
      .trigger('click')

    const osallistuminen = store.kilpailija(a.id)!.osallistumiset.RA1!
    expect(laskeLaji('RA1', LAJIT.RA1, osallistuminen).pisteet).toBe(100)
  })

  it('ristiriita näytetään eikä mitään korvata ennen valintaa', async () => {
    const { store, a } = perustaKisa()
    kirjaa(store, a.id, [9, 9, 9])

    const palat = toiseltaLaitteelta(store.kisa, (b) => {
      // Toinen laite on kirjannut saman sarjan toisin.
      kirjaa(b, a.id, [10, 10, 10])
    })

    const wrapper = await asenna()
    await liita(wrapper, palat)

    expect(wrapper.text()).toContain('Ristiriidat (1)')
    expect(wrapper.text()).toContain('Ahonen, Aada')

    // Yhdistämistä ei voi vahvistaa ennen kuin ristiriita on ratkaistu.
    const vahvista = wrapper.findAll('button').find((b) => b.text() === 'Yhdistä tulokset')!
    expect(vahvista.attributes('disabled')).toBeDefined()

    // Omat tulokset ovat yhä koskemattomat.
    expect(store.kilpailija(a.id)!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(9)
  })

  it('ristiriidan voi ratkaista saapuvan hyväksi', async () => {
    const { store, a } = perustaKisa()
    kirjaa(store, a.id, [9, 9, 9])
    const palat = toiseltaLaitteelta(store.kisa, (b) => kirjaa(b, a.id, [10, 10, 10]))

    const wrapper = await asenna()
    await liita(wrapper, palat)

    // Valitaan saapuva vaihtoehto (toinen painike ristiriidan sisällä).
    await wrapper.findAll('.ristiriita .vaihtoehto')[1]!.trigger('click')
    await wrapper.vm.$nextTick()

    const vahvista = wrapper.findAll('button').find((b) => b.text() === 'Yhdistä tulokset')!
    expect(vahvista.attributes('disabled')).toBeUndefined()
    await vahvista.trigger('click')

    expect(store.kilpailija(a.id)!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(10)
  })

  it('ristiriidan voi ratkaista oman hyväksi', async () => {
    const { store, a } = perustaKisa()
    kirjaa(store, a.id, [9, 9, 9])
    const palat = toiseltaLaitteelta(store.kisa, (b) => kirjaa(b, a.id, [10, 10, 10]))

    const wrapper = await asenna()
    await liita(wrapper, palat)

    await wrapper.findAll('.ristiriita .vaihtoehto')[0]!.trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Yhdistä tulokset')!
      .trigger('click')

    expect(store.kilpailija(a.id)!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(9)
  })

  it('kaikki kerralla -valinta ratkaisee jokaisen ristiriidan', async () => {
    const { store, a, b } = perustaKisa()
    kirjaa(store, a.id, [9, 9, 9])
    kirjaa(store, b.id, [8, 8, 8])

    const palat = toiseltaLaitteelta(store.kisa, (toinen) => {
      kirjaa(toinen, a.id, [10, 10, 10])
      kirjaa(toinen, b.id, [7, 7, 7])
    })

    const wrapper = await asenna()
    await liita(wrapper, palat)
    expect(wrapper.text()).toContain('Ristiriidat (2)')

    await wrapper
      .findAll('button')
      .find((x) => x.text() === 'Kaikki saapuvat')!
      .trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper
      .findAll('button')
      .find((x) => x.text() === 'Yhdistä tulokset')!
      .trigger('click')
    expect(store.kilpailija(a.id)!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(10)
    expect(store.kilpailija(b.id)!.osallistumiset.RA1!.kilpasarjat[0]!.laukaukset[0]).toBe(7)
  })

  it('eri kisan koodi kertoo mitä tehdä ja tarjoaa ohituksen', async () => {
    const { store } = perustaKisa()
    const vieras = { ...kloonaa(store.kisa), kisaId: 'ERIKISA' }
    const palat = paketoi(
      rakennaOsapaketti(vieras, {
        laiteId: 'x',
        versio: 1,
        aika: '2026-06-15T12:00:00.000Z',
      }),
    )

    const wrapper = await asenna()
    await liita(wrapper, palat)

    expect(wrapper.text()).toContain('Koodi kuuluu eri kisaan')
    // Ohje kertoo ratkaisun, ei pelkkää vikaa.
    expect(wrapper.text()).toContain('koko kisa')

    // Ohitus on tarjolla ja tekee yhdistämisestä mahdollisen.
    const ohita = wrapper.findAll('button').find((b) => b.text() === 'Yhdistä silti')!
    expect(ohita).toBeDefined()
    await ohita.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('button').some((b) => b.text() === 'Yhdistä tulokset')).toBe(true)
  })

  it('koko kisan voi vastaanottaa, vaikka kisatunnus poikkeaa', async () => {
    // Tämä on luovutuksen tavallisin tilanne: vastaanottajalla on oma tyhjä kisa.
    const { store, a } = perustaKisa()
    const vieras = { ...kloonaa(store.kisa), kisaId: 'TOINENKISA' }
    const palat = paketoi(
      rakennaTayspaketti(vieras, {
        laiteId: 'x',
        laiteNimi: 'Koje 2',
        versio: 3,
        aika: '2026-06-15T12:00:00.000Z',
      }),
    )

    const wrapper = await asenna()
    await liita(wrapper, palat)

    // Ei virhettä, vaan tavallinen vahvistus.
    expect(wrapper.text()).not.toContain('Koodi kuuluu eri kisaan')
    expect(wrapper.text()).toContain('Koko kisa korvaa tämän laitteen tiedot')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Korvaa tiedot')!
      .trigger('click')
    expect(store.kisa.kisaId).toBe('TOINENKISA')
    expect(store.kilpailija(a.id)).toBeDefined()
  })

  it('roskakoodi ei kaada näkymää', async () => {
    perustaKisa()
    const wrapper = await asenna()
    await liita(wrapper, ['EI OLE KOODI'])
    expect(wrapper.text()).toContain('ei ole OsumaOnnin siirtokoodi')
  })

  it('koko kisan vastaanotto korvaa tiedot ja purkaa lukituksen', async () => {
    const { store, a } = perustaKisa()
    const laite = useLaiteStore()
    laite.merkitseLuovutetuksi()

    const palat = toiseltaLaitteelta(
      store.kisa,
      (b) => {
        kirjaa(b, a.id, [10, 10, 10])
        b.lisaaKilpailija({ etunimi: 'Uusi', sukunimi: 'Tulokas', yhdistys: 'FoRe' })
      },
      'taysi',
    )

    const wrapper = await asenna()
    await liita(wrapper, palat)

    expect(wrapper.text()).toContain('Koko kisa korvaa tämän laitteen tiedot')
    await wrapper
      .findAll('button')
      .find((x) => x.text() === 'Korvaa tiedot')!
      .trigger('click')

    expect(store.kilpailijoita).toBe(3)
    // Vastaanottaja jatkaa kirjaamista, joten lukitus purkautuu.
    expect(laite.luovutettu).toBe(false)
  })

  it('jakolinkin data luetaan suoraan osoitteesta', async () => {
    const { store, a } = perustaKisa()
    const palat = toiseltaLaitteelta(store.kisa, (b) => kirjaa(b, a.id, [8, 8, 8]))

    const wrapper = await asenna(`?d=${encodeURIComponent(palat[0]!)}`)

    // Näkymä vaihtuu vastaanottoon ja paketti on valmiiksi luettuna.
    expect(wrapper.text()).toContain('Tarkista ennen yhdistämistä')
  })
})
