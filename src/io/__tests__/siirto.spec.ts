import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  PalojenKeraaja,
  QR_MERKKIRAJA,
  SiirtoVirhe,
  base32Koodaa,
  base32Pura,
  koodaaPaketti,
  laukauksetMerkeiksi,
  merkitLaukauksiksi,
  paketoi,
  paloittele,
  pura,
  puraPaketti,
  rakennaOsapaketti,
  rakennaTayspaketti,
  tulkitsePala,
} from '../siirto'
import { useKisaStore } from '@/stores/kisa'
import type { Laukaus } from '@/types/kisa'

/** QR-koodin alfanumeerinen merkistö. Kaikki siirtokoodit on mahduttava tähän. */
const QR_ALFANUMEERINEN = /^[0-9A-Z $%*+\-./:]*$/

const TUNNISTEET = {
  laiteId: 'laite-1',
  laiteNimi: 'Koje 1',
  versio: 5,
  aika: '2026-06-15T10:00:00.000Z',
}

describe('laukausten merkkiesitys', () => {
  it('koodaa kaikki laukaustyypit yhdellä merkillä', () => {
    const laukaukset: Laukaus[] = ['*', 10, 9, 1, '-', 0, null]
    const merkit = laukauksetMerkeiksi(laukaukset)
    expect(merkit).toBe('XA91HH.')
    expect(merkit).toHaveLength(laukaukset.length)
  })

  it('purkaa takaisin alkuperäisiksi arvoiksi', () => {
    expect(merkitLaukauksiksi('XA91H.')).toEqual(['*', 10, 9, 1, '-', null])
  })

  it('nolla ja miinus ovat sama ohilaukaus', () => {
    expect(laukauksetMerkeiksi([0])).toBe(laukauksetMerkeiksi(['-']))
    expect(merkitLaukauksiksi('H')).toEqual(['-'])
  })

  it('merkit kuuluvat QR:n alfanumeeriseen joukkoon', () => {
    expect(laukauksetMerkeiksi(['*', 10, 5, '-', null])).toMatch(QR_ALFANUMEERINEN)
  })

  it('kierros säilyttää täyden sarjan', () => {
    const sarja: Laukaus[] = ['*', 2, '*', 10, 9, 8, '-', 7, 6, 5]
    expect(merkitLaukauksiksi(laukauksetMerkeiksi(sarja))).toEqual(sarja)
  })
})

describe('base32', () => {
  it('koodaa ja purkaa tavut', () => {
    const tavut = Uint8Array.from([0, 1, 2, 250, 255, 128, 64])
    expect(base32Pura(base32Koodaa(tavut))).toEqual(tavut)
  })

  it('tuottaa vain QR:lle kelpaavia merkkejä', () => {
    const tavut = Uint8Array.from({ length: 200 }, (_, i) => (i * 7) % 256)
    const koodattu = base32Koodaa(tavut)
    expect(koodattu).toMatch(QR_ALFANUMEERINEN)
    // Täytemerkkiä ei käytetä, koska '=' ei kuulu alfanumeeriseen joukkoon.
    expect(koodattu).not.toContain('=')
  })

  it('sietää roskamerkkejä purkaessa', () => {
    const tavut = Uint8Array.from([1, 2, 3])
    const koodattu = base32Koodaa(tavut)
    expect(base32Pura(`${koodattu}\n `)).toEqual(tavut)
  })

  it('tyhjä syöte antaa tyhjän tuloksen', () => {
    expect(base32Koodaa(new Uint8Array(0))).toBe('')
    expect(base32Pura('')).toEqual(new Uint8Array(0))
  })
})

describe('paketin koodaus', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function teeKisa(kilpailijoita: number) {
    const store = useKisaStore()
    store.kisa.kisatiedot.nimi = 'Testikisa'
    for (let i = 0; i < kilpailijoita; i++) {
      const k = store.lisaaKilpailija({
        etunimi: `Etu${i}`,
        sukunimi: `Sukunimi${i}`,
        yhdistys: i % 2 === 0 ? 'Nupures' : 'KaRes',
      })
      store.lisaaOsallistuminen(k.id, 'RA1')
      for (let s = 0; s < 2; s++) {
        for (let j = 0; j < 10; j++) store.asetaLaukaus(k.id, 'RA1', s, j, ((i + j) % 10) + 1)
      }
    }
    return store.kisa
  }

  it('kierros säilyttää osittaisen paketin', () => {
    const kisa = teeKisa(3)
    const paketti = rakennaOsapaketti(kisa, TUNNISTEET)
    const purettu = puraPaketti(koodaaPaketti(paketti))

    expect(purettu.tyyppi).toBe('osa')
    expect(purettu.kisaId).toBe(kisa.kisaId)
    expect(purettu.versio).toBe(5)
    expect(purettu.laiteNimi).toBe('Koje 1')
    expect(purettu.rivit).toHaveLength(3)
    expect(purettu.rivit?.[0]?.sarjat).toHaveLength(2)
  })

  it('kierros säilyttää täyden paketin', () => {
    const kisa = teeKisa(2)
    const purettu = puraPaketti(koodaaPaketti(rakennaTayspaketti(kisa, TUNNISTEET)))

    expect(purettu.tyyppi).toBe('taysi')
    expect(purettu.kilpailijat).toHaveLength(2)
    expect(purettu.kisatiedot?.nimi).toBe('Testikisa')
    // Rakenteista siirtyy vain se, mikä voi poiketa oletuksesta.
    expect(purettu.rakenteet?.RA2).toEqual({
      kilpasarjoja: 3,
      laukauksiaSarjassa: 6,
      tulosSaanto: 'summa',
    })
  })

  it('täysi paketti ei toista lajien vakiotekstejä eikä nimiä tulosriveillä', () => {
    const kisa = teeKisa(3)
    const paketti = rakennaTayspaketti(kisa, TUNNISTEET)
    const json = JSON.stringify(paketti)

    // Lajien kuvaustekstit ovat vastaanottajalla valmiina, joten niitä ei lähetetä.
    expect(json).not.toContain('Kivääriammunta')
    expect(json).not.toContain('itselataava')
    // Nimet ovat kilpailijalistassa, eivät jokaisella tulosrivillä.
    expect(paketti.rivit?.[0]?.sukunimi).toBeUndefined()
    expect(paketti.kilpailijat?.[0]?.sukunimi).toBeTruthy()
  })

  it('täysi paketti on selvästi pienempi kuin koko kisan naiivi sarjallistus', () => {
    const kisa = teeKisa(40)
    const paketti = rakennaTayspaketti(kisa, TUNNISTEET)
    const koodattu = koodaaPaketti(paketti)

    // Vertailukohta: koko kisaolio sellaisenaan pakattuna, kuten aiemmin tehtiin.
    const naiivi = koodaaPaketti({ ...paketti, kisa } as unknown as typeof paketti)

    // Vähintään neljännes pois, kun vakiotekstit ja toistetut nimet jätetään lähettämättä.
    expect(koodattu.length).toBeLessThan(naiivi.length * 0.75)

    // Ja ennen kaikkea: muutama luettava koodi yhden lukukelvottoman sijaan.
    expect(paketoi(paketti).length).toBeLessThanOrEqual(4)
  })

  it('jokainen pala pysyy luettavan kokoisena', () => {
    const kisa = teeKisa(40)
    for (const pala of paketoi(rakennaTayspaketti(kisa, TUNNISTEET))) {
      // Yli 1000 merkkiä tarkoittaisi jo hankalasti luettavaa koodia.
      expect(pala.length).toBeLessThanOrEqual(QR_MERKKIRAJA)
    }
  })

  it('koodattu paketti kelpaa QR:n alfanumeeriseen tilaan', () => {
    const kisa = teeKisa(5)
    expect(koodaaPaketti(rakennaOsapaketti(kisa, TUNNISTEET))).toMatch(QR_ALFANUMEERINEN)
  })

  it('50 kilpailijan osatulos jaetaan luettaviin paloihin', () => {
    const kisa = teeKisa(50)
    const palat = paketoi(rakennaOsapaketti(kisa, TUNNISTEET))
    // Mieluummin muutama pieni koodi kuin yksi, jota kamera ei saa luettua.
    expect(palat.length).toBeLessThanOrEqual(4)
    for (const pala of palat) expect(pala.length).toBeLessThanOrEqual(QR_MERKKIRAJA)
  })

  it('pakkaus pienentää hyötykuormaa selvästi', () => {
    const kisa = teeKisa(30)
    const paketti = rakennaOsapaketti(kisa, TUNNISTEET)
    const raaka = JSON.stringify(paketti).length
    const koodattu = koodaaPaketti(paketti).length
    // Laukaukset toistuvat paljon, joten pakkauksen pitäisi voittaa reilusti.
    expect(koodattu).toBeLessThan(raaka)
  })

  it('rajaus lajin mukaan pienentää pakettia', () => {
    const store = useKisaStore()
    const k = store.lisaaKilpailija({ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' })
    store.lisaaOsallistuminen(k.id, 'RA1')
    store.lisaaOsallistuminen(k.id, 'RA2')

    const kaikki = rakennaOsapaketti(store.kisa, TUNNISTEET)
    const vain1 = rakennaOsapaketti(store.kisa, TUNNISTEET, { lajit: ['RA1'] })

    expect(kaikki.rivit).toHaveLength(2)
    expect(vain1.rivit).toHaveLength(1)
    expect(vain1.rivit?.[0]?.laji).toBe('RA1')
  })

  it('rajaus kilpailijan mukaan toimii', () => {
    const kisa = teeKisa(3)
    const kohde = kisa.kilpailijat[1]!
    const paketti = rakennaOsapaketti(kisa, TUNNISTEET, { kilpailijaIdt: [kohde.id] })
    expect(paketti.rivit).toHaveLength(1)
    expect(paketti.rivit?.[0]?.id).toBe(kohde.id)
  })

  it('roskadata hylätään selkeällä virheellä', () => {
    expect(() => puraPaketti('EI OLE KELVOLLINEN')).toThrow(SiirtoVirhe)
  })

  it('uudempi muotoversio hylätään', () => {
    const kisa = teeKisa(1)
    const paketti = rakennaOsapaketti(kisa, TUNNISTEET)
    const tulevaisuudesta = koodaaPaketti({ ...paketti, v: 99 })
    expect(() => puraPaketti(tulevaisuudesta)).toThrow(/uudemmalla sovellusversiolla/)
  })
})

describe('paloittelu', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('pieni paketti mahtuu yhteen palaan', () => {
    const palat = paloittele('AAAA')
    expect(palat).toHaveLength(1)
    expect(palat[0]).toMatch(/^OO1\./)
  })

  it('suuri paketti jaetaan numeroituihin paloihin', () => {
    const iso = 'A'.repeat(1000)
    const palat = paloittele(iso, 200)
    expect(palat.length).toBeGreaterThan(1)

    palat.forEach((pala, i) => {
      const tulkittu = tulkitsePala(pala)
      expect(tulkittu.jarjestys).toBe(i + 1)
      expect(tulkittu.maara).toBe(palat.length)
      expect(pala.length).toBeLessThanOrEqual(200)
    })
  })

  it('palat kuuluvat QR:n alfanumeeriseen joukkoon', () => {
    for (const pala of paloittele('ABCDEFGH'.repeat(50), 100)) {
      expect(pala).toMatch(QR_ALFANUMEERINEN)
    }
  })

  it('kaikkien palojen data yhdistyy alkuperäiseksi', () => {
    const alkuperainen = 'ABCDEFGHIJKLMNOP'.repeat(40)
    const palat = paloittele(alkuperainen, 120)
    const yhdistetty = palat.map((p) => tulkitsePala(p).data).join('')
    expect(yhdistetty).toBe(alkuperainen)
  })

  it('vieras koodi tunnistetaan', () => {
    expect(() => tulkitsePala('https://example.com')).toThrow(/ei ole OsumaOnnin/)
  })

  it('rikkinäinen otsikko hylätään', () => {
    expect(() => tulkitsePala('OO1.ABCD.x.2.DATA')).toThrow(SiirtoVirhe)
    expect(() => tulkitsePala('OO1.ABCD.5.2.DATA')).toThrow(/osanumero/)
  })
})

describe('palojen kerääminen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function isoPaketti() {
    const store = useKisaStore()
    for (let i = 0; i < 20; i++) {
      const k = store.lisaaKilpailija({
        etunimi: `Pitkähköetunimi${i}`,
        sukunimi: `Pitkähkösukunimi${i}`,
        yhdistys: `Yhdistys${i}`,
      })
      store.lisaaOsallistuminen(k.id, 'RA1')
      for (let j = 0; j < 10; j++) store.asetaLaukaus(k.id, 'RA1', 0, j, (i % 9) + 1)
    }
    return rakennaOsapaketti(store.kisa, TUNNISTEET)
  }

  it('kerää palat ja purkaa paketin', () => {
    const paketti = isoPaketti()
    const palat = paketoi(paketti, 150)
    expect(palat.length).toBeGreaterThan(1)

    const keraaja = new PalojenKeraaja()
    let tila = { valmis: false, luettu: 0, maara: 0, uusi: false }
    for (const pala of palat) tila = keraaja.lisaa(pala)

    expect(tila.valmis).toBe(true)
    expect(keraaja.pura().kisaId).toBe(paketti.kisaId)
  })

  it('kertoo mitä osia vielä puuttuu', () => {
    const palat = paketoi(isoPaketti(), 150)
    const keraaja = new PalojenKeraaja()
    keraaja.lisaa(palat[0]!)

    expect(keraaja.valmis()).toBe(false)
    expect(keraaja.puuttuvat()).toEqual(Array.from({ length: palat.length - 1 }, (_, i) => i + 2))
    expect(() => keraaja.pura()).toThrow(/Kaikkia osia ei ole luettu/)
  })

  it('saman palan lukeminen uudelleen ei haittaa', () => {
    const palat = paketoi(isoPaketti(), 150)
    const keraaja = new PalojenKeraaja()

    keraaja.lisaa(palat[0]!)
    const toinen = keraaja.lisaa(palat[0]!)
    expect(toinen.uusi).toBe(false)
    expect(toinen.luettu).toBe(1)
  })

  it('palat voi lukea missä järjestyksessä tahansa', () => {
    const paketti = isoPaketti()
    const palat = paketoi(paketti, 150)
    const keraaja = new PalojenKeraaja()
    for (const pala of [...palat].reverse()) keraaja.lisaa(pala)
    expect(keraaja.pura().kisaId).toBe(paketti.kisaId)
  })

  it('toisen lähetyksen pala aloittaa keräyksen alusta', () => {
    const eka = paketoi(isoPaketti(), 150)
    setActivePinia(createPinia())
    const toka = paketoi(isoPaketti(), 150)

    const keraaja = new PalojenKeraaja()
    keraaja.lisaa(eka[0]!)
    const tila = keraaja.lisaa(toka[0]!)

    // Eri lähetyksen paloja ei saa sekoittaa keskenään.
    expect(tila.luettu).toBe(1)
  })

  it('pura-apuri hoitaa koko ketjun', () => {
    const paketti = isoPaketti()
    expect(pura(paketoi(paketti, 150)).kisaId).toBe(paketti.kisaId)
  })
})
