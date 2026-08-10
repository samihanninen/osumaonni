import { test, expect } from '@playwright/test'
import { avaaKisalla } from './apurit'

/*
 * Lajivalinta kapealla näytöllä.
 *
 * Lajiruudut olivat rivissä, joka rivittyi sisällön mukaan. Aseluokkavalitsin ilmestyy
 * vasta kun laji rastitetaan, ja se leventää kohdan noin kaksinkertaiseksi: neljä lajia
 * mahtui puhelimessa yhdelle riville rastittamattomina, mutta jo yksi rasti pakotti ne
 * kahdelle ja kolme rastia neljälle. Osio siis kasvoi ja kutistui rastien mukaan, lajit
 * hyppäsivät riviltä toiselle, ja kaikki sen alapuolella liikkui mukana — myös juuri se
 * ruutu, jota käyttäjä oli seuraavaksi napauttamassa.
 *
 * Kilpailijat kirjataan usein kiireessä listalta, joten väärän ruudun osuminen on
 * todellinen virhe eikä vain kauneusvirhe.
 */

const KILPAILIJAT = [
  { etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes', lajit: {} },
  { etunimi: 'Sami', sukunimi: 'Hänninen', yhdistys: 'Nupures', lajit: {} },
]

test.describe('lajivalinta kapealla näytöllä', () => {
  test.use({ viewport: { width: 360, height: 660 } })

  test('rastittaminen ei muuta lajiosion korkeutta', async ({ page }) => {
    await avaaKisalla(page, KILPAILIJAT, { polku: '/#/kilpailijat' })

    const eka = page.locator('.lista .rivi').first()
    const lajit = eka.locator('.lajit')
    const ruudut = eka.locator('.laji input[type="checkbox"]')

    const korkeus = async () => (await lajit.boundingBox())!.height
    const alku = await korkeus()

    /*
     * Valitsimien lukumäärää odotetaan ennen mittausta. Vue päivittää DOMin vasta
     * seuraavalla tikillä, joten heti napautuksen jälkeen mitattaisiin asettelua joka
     * ei ole vielä asettunut — testi kaatuisi satunnaisesti kuormituksesta riippuen.
     * `toHaveCount` odottaa automaattisesti, joten mittaus osuu valmiiseen tilaan.
     */
    const valitsimet = eka.locator('.laji select')

    for (let i = 0; i < 4; i++) {
      await ruudut.nth(i).check()
      await expect(valitsimet).toHaveCount(i + 1)
      expect(Math.abs((await korkeus()) - alku)).toBeLessThan(1)
    }
    for (let i = 0; i < 4; i++) {
      await ruudut.nth(i).uncheck()
      await expect(valitsimet).toHaveCount(3 - i)
      expect(Math.abs((await korkeus()) - alku)).toBeLessThan(1)
    }
  })

  test('rastittaminen ei siirrä lajiruutuja eikä alempia kilpailijoita', async ({ page }) => {
    await avaaKisalla(page, KILPAILIJAT, { polku: '/#/kilpailijat' })

    const eka = page.locator('.lista .rivi').first()
    const ruudut = eka.locator('.laji input[type="checkbox"]')

    // `page.evaluate` ei odota kuten lokaattorit, joten kortit on odotettava erikseen.
    await expect(page.locator('.lista .rivi')).toHaveCount(2)

    /*
     * Sijainnit mitataan ensimmäisen kortin yläreunaan nähden, ei sivun tai
     * näkymäikkunan.
     *
     * Absoluuttinen mittaus antaisi vääriä hälytyksiä kahdesta syystä. Napautus
     * vierittää sivua, ja tuotantoversiossa service worker herää hetken kuluttua
     * latauksesta, jolloin "toimii ilman verkkoyhteyttä" -ilmoitus ilmestyy sisällön
     * yläpuolelle ja työntää kaiken alaspäin. Kumpikaan ei liity lajivalintaan, mutta
     * molemmat siirtävät ruutuja: CI:ssä juuri jälkimmäinen kaatoi tämän testin
     * 80 pikselillä. Kortin sisäiset etäisyydet muuttuvat vain jos asettelu
     * todella asettuu uudelleen.
     */
    const paikat = () =>
      page.evaluate(() => {
        const kortit = document.querySelectorAll('.lista .rivi')
        const ylareuna = kortit[0]!.getBoundingClientRect().y
        return {
          ruudut: [...kortit[0]!.querySelectorAll('.laji input[type="checkbox"]')].map(
            (e) => e.getBoundingClientRect().y - ylareuna,
          ),
          toinen: kortit[1]!.getBoundingClientRect().y - ylareuna,
        }
      })

    const alku = await paikat()

    // RA2 rastitetaan keskeltä: jos rivitys muuttuu, naapurit liikkuvat sen ympäriltä.
    await ruudut.nth(1).check()
    await expect(eka.locator('.laji select')).toHaveCount(1)
    const jalkeen = await paikat()

    for (const [i, y] of jalkeen.ruudut.entries()) {
      expect(Math.abs(y - alku.ruudut[i]!)).toBeLessThan(1)
    }
    expect(Math.abs(jalkeen.toinen - alku.toinen)).toBeLessThan(1)
  })

  test('lajit mahtuvat myös kapeimmalle puhelimelle rastitettuina', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 660 })
    await avaaKisalla(page, KILPAILIJAT, { polku: '/#/kilpailijat' })

    const eka = page.locator('.lista .rivi').first()
    const ruudut = eka.locator('.laji input[type="checkbox"]')
    for (let i = 0; i < 4; i++) await ruudut.nth(i).check()

    const vieri = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(vieri).toBeLessThanOrEqual(0)
  })
})
