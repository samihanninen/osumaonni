import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { useKisaStore, nollaaLuentaTila } from '../kisa'
import { KISA_SKEEMA_VERSIO } from '@/core/skeema'

/**
 * Tallennuksen luku laitteen käynnistyessä.
 *
 * Nämä testit ajavat oikean persistedstate-liitännäisen oikeaa localStoragea vasten,
 * koska juuri tuossa rajapinnassa tulokset voidaan menettää: väärin luettu tallennus
 * korvautuu ensimmäisellä kirjauksella, eikä sitä saa enää mistään takaisin.
 */

/**
 * Pinia asennetaan oikeaan sovellukseen, ei pelkkänä irrallisena instanssina:
 * `pinia.use()` jonottaa liitännäiset siihen asti, kunnes pinia asennetaan appiin.
 * Ilman `app.use(pinia)`-riviä tallennusliitännäistä ei kutsuttaisi lainkaan ja
 * testit menisivät läpi mittaamatta mitään.
 */
function pystytaPinia() {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  pinia.use(piniaPluginPersistedstate)
  setActivePinia(pinia)
}

function kirjoitaTallennus(kisa: Record<string, unknown>) {
  localStorage.setItem('kisa', JSON.stringify({ kisa }))
}

function kisaData(lisat: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: KISA_SKEEMA_VERSIO,
    kisaId: 'ABCD2345',
    kisatiedot: {
      nimi: 'Syyskisa',
      jarjestaja: '',
      paikka: '',
      pvm: '',
      kilpailunjohtaja: '',
      tuomari: '',
      kirjuri: '',
      muistiinpanot: '',
    },
    asetukset: { laskettavatParhaat: 3, lajiMaaritykset: {} },
    kilpailijat: [],
    ...lisat,
  }
}

describe('kisan tallennuksen luku', () => {
  beforeEach(() => {
    localStorage.clear()
    nollaaLuentaTila()
    pystytaPinia()
  })

  it('lataa nykyisen version tallennuksen', () => {
    kirjoitaTallennus(kisaData())

    const store = useKisaStore()

    expect(store.skeemaTila).toBe('ok')
    expect(store.kisa.kisaId).toBe('ABCD2345')
    expect(store.kisa.kisatiedot.nimi).toBe('Syyskisa')
  })

  it('tyhjästä laitteesta ei tule virhettä', () => {
    const store = useKisaStore()

    expect(store.skeemaTila).toBe('tyhja')
    expect(store.kilpailijoita).toBe(0)
  })

  describe('uudempi tallennus', () => {
    const uudempi = () => kisaData({ schemaVersion: KISA_SKEEMA_VERSIO + 1, kisaId: 'UUSI1234' })

    it('ei lataudu, vaan sovellus aloittaa tyhjästä', () => {
      kirjoitaTallennus(uudempi())

      const store = useKisaStore()

      expect(store.skeemaTila).toBe('uudempi')
      expect(store.skeemaVersio).toBe(KISA_SKEEMA_VERSIO + 1)
      expect(store.kisa.kisaId).not.toBe('UUSI1234')
      expect(store.kilpailijoita).toBe(0)
    })

    it('otetaan talteen omalle avaimelleen', () => {
      kirjoitaTallennus(uudempi())
      const alkuperainen = localStorage.getItem('kisa')

      useKisaStore()

      expect(localStorage.getItem(`kisa-varmuuskopio-v${KISA_SKEEMA_VERSIO + 1}`)).toBe(
        alkuperainen,
      )
    })

    /*
     * Tämä on se hetki, jonka takia varmuuskopio on olemassa: kirjaaja ei huomaa
     * mitään, syöttää ensimmäisen laukauksen, ja tallennus kirjoittuu yli.
     */
    it('säilyy vaikka kirjaaja jatkaisi kirjaamista päälle', async () => {
      kirjoitaTallennus(uudempi())
      const alkuperainen = localStorage.getItem('kisa')

      const store = useKisaStore()
      store.lisaaKilpailija({ etunimi: 'Sami', sukunimi: 'Hänninen', yhdistys: 'Nupures' })
      // Tallennus kirjoitetaan vasta seuraavalla tikillä.
      await nextTick()

      expect(localStorage.getItem('kisa')).not.toBe(alkuperainen)
      expect(localStorage.getItem(`kisa-varmuuskopio-v${KISA_SKEEMA_VERSIO + 1}`)).toBe(
        alkuperainen,
      )
    })

    it('ei korvaa aiempaa varmuuskopiota', () => {
      const ensimmainen = JSON.stringify({ kisa: uudempi() })
      localStorage.setItem(`kisa-varmuuskopio-v${KISA_SKEEMA_VERSIO + 1}`, ensimmainen)
      kirjoitaTallennus(kisaData({ schemaVersion: KISA_SKEEMA_VERSIO + 1, kisaId: 'MYOHEMPI' }))

      useKisaStore()

      expect(localStorage.getItem(`kisa-varmuuskopio-v${KISA_SKEEMA_VERSIO + 1}`)).toBe(ensimmainen)
    })
  })

  describe('vioittunut tallennus', () => {
    it('ei lataudu ja otetaan talteen', () => {
      localStorage.setItem('kisa', '{ ei ole json')

      const store = useKisaStore()

      expect(store.skeemaTila).toBe('vioittunut')
      expect(localStorage.getItem('kisa-varmuuskopio-rikki')).toBe('{ ei ole json')
    })

    it('versioton tallennus otetaan talteen eikä arvata', () => {
      kirjoitaTallennus({ kisaId: 'VERSIOTON', kilpailijat: [] })
      const alkuperainen = localStorage.getItem('kisa')

      const store = useKisaStore()

      expect(store.skeemaTila).toBe('vioittunut')
      expect(store.kisa.kisaId).not.toBe('VERSIOTON')
      expect(localStorage.getItem('kisa-varmuuskopio-rikki')).toBe(alkuperainen)
    })
  })

  describe('kirjoitus', () => {
    it('leimaa tallennukseen nykyisen version', async () => {
      const store = useKisaStore()
      store.lisaaKilpailija({ etunimi: 'Sami', sukunimi: 'Hänninen', yhdistys: 'Nupures' })
      await nextTick()

      const tallennettu = JSON.parse(localStorage.getItem('kisa') ?? '{}')
      expect(tallennettu.kisa.schemaVersion).toBe(KISA_SKEEMA_VERSIO)
    })

    /* Tallennukseen ei saa vuotaa muuta kuin kisa: versiointi lupaa tunnetun rakenteen. */
    it('tallentaa vain kisan', async () => {
      const store = useKisaStore()
      store.lisaaKilpailija({ etunimi: 'Sami', sukunimi: 'Hänninen', yhdistys: 'Nupures' })
      await nextTick()

      const tallennettu = JSON.parse(localStorage.getItem('kisa') ?? '{}')
      expect(Object.keys(tallennettu)).toEqual(['kisa'])
    })
  })
})
