import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  henkiloAvain,
  jarjestaHenkilot,
  puhdistaRosteri,
  type RosteriHenkilo,
} from '@/core/rosteri'
import { uusiId } from '@/core/tunnus'

/**
 * Rosteri: laitteelle jäävä henkilölista, josta kisaan täpätään sen päivän väki.
 *
 * Oma store eikä osa kisaa, koska rosteri elää kisojen yli — ks. `core/rosteri`. Siksi
 * se on myös omassa tallennusavaimessaan (`rosteri`), eikä kisan skeemaversio koske
 * siihen: rosterin katoaminen tarkoittaa nimien uudelleen kirjaamista, kirjattujen
 * tulosten katoaminen kisan menettämistä.
 */
export const useRosteriStore = defineStore(
  'rosteri',
  () => {
    const henkilot = ref<RosteriHenkilo[]>([])

    const maara = computed(() => henkilot.value.length)

    /** Rosteri sukunimen mukaisessa järjestyksessä, kuten kilpailijalista. */
    const jarjestetyt = computed(() => jarjestaHenkilot(henkilot.value))

    function henkilo(id: string): RosteriHenkilo | undefined {
      return henkilot.value.find((h) => h.id === id)
    }

    /** Löytyykö samanniminen saman yhdistyksen henkilö jo rosterista? */
    function etsiNimella(tiedot: {
      etunimi: string
      sukunimi: string
      yhdistys: string
    }): RosteriHenkilo | undefined {
      const avain = henkiloAvain(tiedot)
      return henkilot.value.find((h) => henkiloAvain(h) === avain)
    }

    /**
     * Tallentaa henkilön rosteriin ja palauttaa tallennetun rivin.
     *
     * Sama henkilö ei mene kahdesti: jos nimi ja yhdistys täsmäävät, rivi päivitetään.
     * Näin kisan kilpailijoiden tallentaminen rosteriin on toistettavissa — nappia voi
     * painaa kisan aikana montakin kertaa, ja sarja päivittyy sitä mukaa kuin se on
     * kisan puolella korjattu.
     *
     * Tyhjä sukunimi hylätään: kilpailija ei kelpaa kisaan ilman sukunimeä, joten
     * sellainen rivi olisi rosterissa hyödytön.
     */
    function tallenna(tiedot: {
      id?: string
      etunimi: string
      sukunimi: string
      yhdistys: string
      ikasarja?: string
    }): RosteriHenkilo | undefined {
      const sukunimi = tiedot.sukunimi.trim()
      if (!sukunimi) return undefined

      const uusi: RosteriHenkilo = {
        id: tiedot.id?.trim() || uusiId(),
        etunimi: tiedot.etunimi.trim(),
        sukunimi,
        yhdistys: tiedot.yhdistys.trim(),
        ...(tiedot.ikasarja?.trim() ? { ikasarja: tiedot.ikasarja.trim() } : {}),
      }

      const vanha = etsiNimella(uusi) ?? henkilo(uusi.id)
      if (vanha) {
        // Tunniste säilyy: se sitoo rosterin henkilön kisassa olevaan kilpailijaan.
        Object.assign(vanha, { ...uusi, id: vanha.id })
        return vanha
      }
      henkilot.value.push(uusi)
      return uusi
    }

    /** Tallentaa monta henkilöä ja kertoo montako oli ennestään tuntematonta. */
    function tallennaMonta(
      lista: readonly {
        id?: string
        etunimi: string
        sukunimi: string
        yhdistys: string
        ikasarja?: string
      }[],
    ): number {
      let uusia = 0
      for (const tiedot of lista) {
        const oliJo = Boolean(etsiNimella(tiedot))
        if (tallenna(tiedot) && !oliJo) uusia++
      }
      return uusia
    }

    function poista(id: string) {
      const i = henkilot.value.findIndex((h) => h.id === id)
      if (i >= 0) henkilot.value.splice(i, 1)
    }

    /** Tyhjentää koko rosterin. Kutsujan on varmistettava tämä käyttäjältä. */
    function tyhjenna() {
      henkilot.value = []
    }

    return {
      henkilot,
      maara,
      jarjestetyt,
      henkilo,
      etsiNimella,
      tallenna,
      tallennaMonta,
      poista,
      tyhjenna,
    }
  },
  {
    persist: {
      pick: ['henkilot'],
      serializer: {
        serialize: JSON.stringify,
        /**
         * Kelvottomat rivit pudotetaan luennassa. Rosteri on uudelleen kirjattavissa,
         * joten sen kohdalla ei ole samaa syytä kieltäytyä lukemisesta kuin kisan
         * kohdalla — mutta sotkuinen rivi ei silti saa päätyä listaan, josta sitä
         * täpättäisiin kisaan.
         */
        deserialize: (raaka: string) => {
          try {
            const jasennetty: unknown = JSON.parse(raaka)
            const pesa = (jasennetty as { henkilot?: unknown } | null)?.henkilot
            return { henkilot: puhdistaRosteri(pesa) }
          } catch {
            return {}
          }
        },
      },
    },
  },
)

/** Rosterin tallennusavain localStoragessa. Sama kuin storen tunnus. */
export const ROSTERI_AVAIN = 'rosteri'
