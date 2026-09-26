import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import RosteriView from '../RosteriView.vue'
import { useKisaStore } from '@/stores/kisa'
import { useRosteriStore } from '@/stores/rosteri'

/**
 * Rosterisivun paluu kilpailijalistaan.
 *
 * Rosteri oli ennen taitettu osio kilpailijalistan yläpuolella, ja avattuna samat
 * ihmiset näkyivät sivulla kahdesti. Omalla sivulla paluu on oma toimintonsa, ja se
 * tehdään `replace`illa: `push` jättäisi historiaan Kilpailijat → Rosteri →
 * Kilpailijat, jolloin laitteen paluupainike toisi takaisin rosteriin.
 */
function luoRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'etusivu', component: { template: '<div />' } },
      { path: '/rosteri', name: 'rosteri', component: RosteriView },
      { path: '/kilpailijat', name: 'kilpailijat', component: { template: '<div />' } },
    ],
  })
}

/** Tullaan rosteriin kilpailijalistalta, kuten sovelluksessa. */
async function asenna() {
  const router = luoRouter()
  await router.push('/kilpailijat')
  await router.push('/rosteri')
  await router.isReady()
  const wrapper = mount(RosteriView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

function nappi(wrapper: Awaited<ReturnType<typeof asenna>>['wrapper'], teksti: string | RegExp) {
  const osuu = (t: string) => (typeof teksti === 'string' ? t.includes(teksti) : teksti.test(t))
  const loydetty = wrapper.findAll('button').find((b) => osuu(b.text()))
  if (!loydetty) throw new Error(`Painiketta "${teksti}" ei löytynyt`)
  return loydetty
}

describe('RosteriView', () => {
  let kisa: ReturnType<typeof useKisaStore>
  let rosteri: ReturnType<typeof useRosteriStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    kisa = useKisaStore()
    rosteri = useRosteriStore()
  })

  it('paluunappi vie kilpailijalistaan', async () => {
    const { wrapper, router } = await asenna()

    await nappi(wrapper, 'Takaisin kilpailijoihin').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/kilpailijat')
  })

  /*
   * Juuri tämä erottaa `replace`n `push`ista: paluun jälkeen laitteen paluupainike ei
   * saa tuoda takaisin rosteriin, josta oltiin jo poistuttu.
   */
  it('paluu ei jätä rosteria selaimen historiaan', async () => {
    const { wrapper, router } = await asenna()

    await nappi(wrapper, 'Takaisin kilpailijoihin').trigger('click')
    await flushPromises()
    router.go(-1)
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/kilpailijat')
  })

  it('paluunappi kertoo montako kilpailijaa kisassa on', async () => {
    rosteri.tallenna({ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' })
    const { wrapper } = await asenna()

    // Tyhjässä kisassa lukumäärä ei kerro mitään, joten nappi vain nimeää määränpään.
    expect(wrapper.text()).toContain('Takaisin kilpailijoihin')

    await wrapper.get('.henkilo input[type="checkbox"]').setValue(true)
    expect(kisa.kilpailijoita).toBe(1)
    expect(wrapper.text()).toContain('Valmis — kisassa 1 kilpailija')

    kisa.lisaaKilpailija({ etunimi: 'Pertti', sukunimi: 'Virtanen', yhdistys: 'Nupures' })
    await flushPromises()
    expect(wrapper.text()).toContain('Valmis — kisassa 2 kilpailijaa')
  })
})
