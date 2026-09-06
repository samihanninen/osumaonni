import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RosteriValinta from '../RosteriValinta.vue'
import { useKisaStore } from '@/stores/kisa'
import { useRosteriStore } from '@/stores/rosteri'

/**
 * Rosterista täppääminen.
 *
 * Koko toiminnon tarkoitus on, ettei samaa porukkaa tarvitse syöttää uudelleen joka
 * kisaan: rasti tuo henkilön kisaan kaikkine lajeineen. Poisto on siksi yhtä nopea —
 * ja juuri siksi kirjatut tulokset vaativat vahvistuksen ennen kuin ne katoavat.
 */
const globaalit = { stubs: { RouterLink: { template: '<a><slot /></a>' } } }

function nappi(wrapper: ReturnType<typeof mount>, teksti: string) {
  const napit = wrapper.findAll('button').filter((b) => b.text().includes(teksti))
  if (napit.length === 0) throw new Error(`Painiketta "${teksti}" ei löytynyt`)
  return napit[0]!
}

describe('RosteriValinta', () => {
  let kisa: ReturnType<typeof useKisaStore>
  let rosteri: ReturnType<typeof useRosteriStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    kisa = useKisaStore()
    rosteri = useRosteriStore()
  })

  it('kertoo tyhjästä rosterista', () => {
    const wrapper = mount(RosteriValinta, { global: globaalit })
    expect(wrapper.text()).toContain('Rosteri on tyhjä')
  })

  it('rasti lisää henkilön kisaan kaikkine lajeineen', async () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures', ikasarja: 'H50' })
    const wrapper = mount(RosteriValinta, { global: globaalit })

    await wrapper.get('.henkilo input[type="checkbox"]').setValue(true)

    expect(kisa.kilpailijoita).toBe(1)
    const k = kisa.kisa.kilpailijat[0]!
    expect(k.sukunimi).toBe('Hakala')
    // Sarja tulee rosterista, koska RESUL-kisassa on H50.
    expect(k.ikasarja).toBe('H50')
    expect(Object.keys(k.osallistumiset).sort()).toEqual(['RA1', 'RA2', 'RA3', 'RA4'])
  })

  /*
   * Mukautetun kisan sarjat ovat järjestäjän itse nimeämiä, joten rosterin H50 ei
   * tarkoita siellä mitään. Tuntematon sarja jättäisi kilpailijan pois kaikista
   * sarjakohtaisista tuloksista.
   */
  it('sivuuttaa rosterin sarjan jota kisassa ei ole', async () => {
    kisa.asetaKisaTyyppi('mukautettu')
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures', ikasarja: 'H50' })
    const wrapper = mount(RosteriValinta, { global: globaalit })

    await wrapper.get('.henkilo input[type="checkbox"]').setValue(true)

    expect(kisa.kisa.kilpailijat[0]?.ikasarja).toBe('Yleinen')
  })

  it('rastin poisto poistaa kisasta, kun tuloksia ei ole kirjattu', async () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const wrapper = mount(RosteriValinta, { global: globaalit })
    const ruutu = wrapper.get('.henkilo input[type="checkbox"]')

    await ruutu.setValue(true)
    await ruutu.setValue(false)

    expect(kisa.kilpailijoita).toBe(0)
  })

  it('kirjatut tulokset vaativat vahvistuksen ennen poistoa', async () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const wrapper = mount(RosteriValinta, { global: globaalit })
    const ruutu = wrapper.get('.henkilo input[type="checkbox"]')

    await ruutu.setValue(true)
    const id = kisa.kisa.kilpailijat[0]!.id
    kisa.asetaLaukaus(id, 'RA1', 0, 0, 10)

    await ruutu.setValue(false)
    // Ensimmäinen napautus vain kysyy, ja kertoo mitä poisto maksaisi.
    expect(kisa.kilpailijoita).toBe(1)
    expect(wrapper.text()).toContain('1 kirjattua laukausta katoaa')

    await nappi(wrapper, 'Kyllä, poista kisasta').trigger('click')
    expect(kisa.kilpailijoita).toBe(0)
  })

  /* Sama henkilö on voitu kirjata kisaan käsin ennen rosteriin tallentamista. */
  it('tunnistaa kisassa jo olevan henkilön nimen perusteella', () => {
    kisa.lisaaKilpailija({ etunimi: 'sanna', sukunimi: 'hakala', yhdistys: 'nupures' })
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })

    const wrapper = mount(RosteriValinta, { global: globaalit })
    const ruutu = wrapper.get('.henkilo input[type="checkbox"]')

    expect((ruutu.element as HTMLInputElement).checked).toBe(true)
  })

  it('lisää kaikki puuttuvat kisaan yhdellä napautuksella', async () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    rosteri.tallenna({ etunimi: 'Pertti', sukunimi: 'Virtanen', yhdistys: 'Nupures' })
    const wrapper = mount(RosteriValinta, { global: globaalit })

    await nappi(wrapper, 'Lisää kaikki kisaan').trigger('click')

    expect(kisa.kilpailijoita).toBe(2)
    // Kaikki ovat mukana, joten nappi ei enää tee mitään.
    expect(nappi(wrapper, 'Lisää kaikki kisaan').attributes('disabled')).toBeDefined()
  })

  it('tallentaa kisan kilpailijat rosteriin', async () => {
    kisa.lisaaKilpailija({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    kisa.lisaaKilpailija({ etunimi: 'Pertti', sukunimi: 'Virtanen', yhdistys: 'Nupures' })
    const wrapper = mount(RosteriValinta, { global: globaalit })

    await nappi(wrapper, 'Tallenna kisan kilpailijat rosteriin').trigger('click')

    expect(rosteri.maara).toBe(2)
    expect(wrapper.text()).toContain('2 uutta henkilöä')
  })

  it('poisto rosterista vaatii vahvistuksen eikä koske kisaan', async () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const wrapper = mount(RosteriValinta, { global: globaalit })
    await wrapper.get('.henkilo input[type="checkbox"]').setValue(true)

    await nappi(wrapper, 'Poista rosterista').trigger('click')
    expect(rosteri.maara).toBe(1)

    await nappi(wrapper, 'Kyllä, poista rosterista').trigger('click')
    expect(rosteri.maara).toBe(0)
    // Kisaan lisätty kilpailija jää: rosterista poistaminen ei ole kisasta poistamista.
    expect(kisa.kilpailijoita).toBe(1)
  })
})
