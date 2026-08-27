import { test, expect } from '@playwright/test'
import { avaaKisalla, napauta, napautaMonta } from './apurit'

/**
 * Tulosten syöttö oikeissa selaimissa.
 *
 * Syöttötapa pakotetaan sovelluksen omalla asetuksella, jolloin sekä kosketusnäppäimistö
 * että taulukko testataan kaikilla projekteilla — myös WebKitillä, josta puuttuu
 * BarcodeDetector ja jonka numeronäppäimistössä ei ole `*`-näppäintä.
 */

const AMPUJAT = [
  { etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes' },
  { etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' },
]

test.describe('kosketusnäppäimistö', () => {
  test('laukausten kirjaaminen ja summan päivittyminen', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    // Laukausruudut eivät ole tekstikenttiä, joten laitteen näppäimistö ei avaudu.
    await expect(page.locator('.ruutu')).toHaveCount(20)
    await expect(page.locator('.ruutu input')).toHaveCount(0)

    await napauta(page, '9')
    await napauta(page, '10')
    await napauta(page, '★')

    // 9 + 10 + 10 = 29, joista yksi napakymppi.
    const sarja = page.locator('.sarja').first()
    await expect(sarja.locator('.sarja-summa strong')).toHaveText('29')
    await expect(sarja.locator('.navat')).toContainText('1')
  })

  test('täyden sarjan jälkeen syöttö jatkuu seuraavaan kilpasarjaan', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    await napautaMonta(page, '8', 10)
    await napauta(page, '5')

    const sarjat = page.locator('.sarja')
    await expect(sarjat.nth(0).locator('.sarja-summa strong')).toHaveText('80')
    await expect(sarjat.nth(1).locator('.sarja-summa strong')).toHaveText('5')
  })

  test('väärän laukauksen korjaus napauttamalla ruutua', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    await napauta(page, '9')
    await napauta(page, '1') // väärä
    await napauta(page, '7')

    const ruudut = page.locator('.ruutu')
    await expect(ruudut.nth(1)).toHaveText('1')

    await ruudut.nth(1).click()
    await napauta(page, '10')

    await expect(ruudut.nth(1)).toHaveText('10')
    await expect(ruudut.nth(2)).toHaveText('7')
    await expect(page.locator('.sarja').first().locator('.sarja-summa strong')).toHaveText('26')
  })

  test('peruutus tyhjentää viimeisen laukauksen', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    await napauta(page, '7')
    await napauta(page, '9')
    await page.locator('.nappain', { hasText: '⌫' }).click()

    const ruudut = page.locator('.ruutu')
    await expect(ruudut.nth(0)).toHaveText('7')
    await expect(ruudut.nth(1)).toHaveText('·')
  })

  test('kilpailijasta toiseen ja suoraan valitsimella', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    await expect(page.locator('.nimi')).toHaveText('Aada Ahonen')
    await expect(page.locator('.laskuri')).toHaveText('1 / 2')

    await page.locator('.nappain', { hasText: 'Seuraava' }).click()
    await expect(page.locator('.nimi')).toHaveText('Sanna Hakala')
    await expect(page.locator('.laskuri')).toHaveText('2 / 2')

    await page.locator('#kilpailijavalinta').selectOption('0')
    await expect(page.locator('.nimi')).toHaveText('Aada Ahonen')
  })

  test('valitsin näyttää kirjaamisen edistymisen', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    await expect(page.locator('#kilpailijavalinta')).toContainText('tyhjä')
    await napauta(page, '9')
    await expect(page.locator('#kilpailijavalinta')).toContainText('1/20')
  })

  test('RA2 näyttää kolme kuuden laukauksen sarjaa', async ({ page }) => {
    await avaaKisalla(page, [{ ...AMPUJAT[0]!, lajit: { RA2: {} } }], {
      polku: '/#/syota/RA2',
      syottotapa: 'nappaimisto',
    })

    await expect(page.locator('.ruutu')).toHaveCount(18)
    await expect(page.locator('.sarja')).toHaveCount(3)
    await expect(page.getByText('sarjojen summa')).toBeVisible()
  })

  test('tulokset säilyvät sivun uudelleenlatauksessa', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    await napauta(page, '10')
    await napauta(page, '10')
    await expect(page.locator('.sarja').first().locator('.sarja-summa strong')).toHaveText('20')

    await page.reload()

    // localStorage on ainoa tallennuspaikka, joten tämä on olennainen takuu.
    await expect(page.locator('.sarja').first().locator('.sarja-summa strong')).toHaveText('20')
    await expect(page.locator('.ruutu').nth(0)).toHaveText('10')
  })
})

test.describe('taulukkosyöttö', () => {
  test('näppäimistösyöttö ja kympin muodostaminen', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'taulukko' })

    await expect(page.locator('table.tuloskortti')).toBeVisible()

    const ruudut = page.locator('.ruutu')
    await ruudut.first().click()
    await page.keyboard.press('9')
    // Ykkönen jää odottamaan nollaa, joka täydentää sen kympiksi.
    await page.keyboard.press('1')
    await page.keyboard.press('0')
    await page.keyboard.press('7')

    await expect(ruudut.nth(0)).toHaveValue('9')
    await expect(ruudut.nth(1)).toHaveValue('10')
    await expect(ruudut.nth(2)).toHaveValue('7')
  })

  test('"1 5" ei hukkaa ykköstä', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'taulukko' })

    const ruudut = page.locator('.ruutu')
    await ruudut.first().click()
    await page.keyboard.press('1')
    await page.keyboard.press('5')

    await expect(ruudut.nth(0)).toHaveValue('1')
    await expect(ruudut.nth(1)).toHaveValue('5')
  })

  test('nuolinäppäimet siirtävät ruudusta toiseen', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'taulukko' })

    const ruudut = page.locator('.ruutu')
    await ruudut.first().click()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('8')

    await expect(ruudut.nth(0)).toHaveValue('')
    await expect(ruudut.nth(1)).toHaveValue('8')
  })

  test('napakymppi ja ohilaukaus näppäimistöltä', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'taulukko' })

    const ruudut = page.locator('.ruutu')
    await ruudut.first().click()
    await page.keyboard.press('*')
    await page.keyboard.press('-')

    await expect(ruudut.nth(0)).toHaveValue('*')
    await expect(ruudut.nth(1)).toHaveValue('-')
  })

  test('rangaistus vähentää tuloksen', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'taulukko' })

    const ruudut = page.locator('.ruutu')
    await ruudut.first().click()
    for (let i = 0; i < 10; i++) await page.keyboard.press('*')

    const rivi = page.locator('table.tuloskortti tbody tr').first()
    await expect(rivi.locator('.tulossolu')).toHaveText('100')

    await page.locator('.rikesolu').first().fill('2')
    await page.locator('.rikesolu').first().blur()
    await expect(rivi.locator('.tulossolu')).toHaveText('96')
  })
})

test.describe('syöttötavan automaattinen valinta', () => {
  /** Onko laitteessa hiiri tai ohjauslevy eli käytännössä oikea näppäimistö? */
  async function tarkkaOsoitin(page: import('@playwright/test').Page) {
    return page.evaluate(() => window.matchMedia('(min-width: 768px) and (pointer: fine)').matches)
  }

  // Kaksi erillistä testiä yhden ehtolauseen sijaan: näin ohitetut tapaukset näkyvät
  // raportissa sen sijaan, että väittämät jäisivät huomaamatta suorittamatta.

  test('tarkalla osoittimella näytetään taulukko', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'auto' })
    test.skip(!(await tarkkaOsoitin(page)), 'Koskee vain hiirtä tai ohjauslevyä')

    await expect(page.locator('table.tuloskortti')).toBeVisible()
  })

  test('kosketuslaitteella näytetään näppäimistö eikä tekstikenttiä', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'auto' })
    test.skip(await tarkkaOsoitin(page), 'Koskee vain kosketuslaitteita')

    await expect(page.locator('.nappaimisto')).toBeVisible()
    await expect(page.locator('table.tuloskortti')).toHaveCount(0)
    // Laitteen omaa näppäimistöä ei avata, koska iOS:n numeronäppäimistöstä puuttuu `*`.
    await expect(page.locator('.ruutu input')).toHaveCount(0)
  })

  test('valinnan voi ohittaa käsin', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'taulukko' })
    await expect(page.locator('table.tuloskortti')).toBeVisible()

    // Syöttötapa on taitettuna, jotta pystytila jää kilpailijakortille.
    await page.locator('.tapavalinta summary').click()
    await page.getByRole('button', { name: 'Näppäimistö' }).click()
    await expect(page.locator('table.tuloskortti')).toHaveCount(0)
    await expect(page.locator('.nappaimisto')).toBeVisible()
  })
})

test.describe('mahtuminen kapealle näytölle', () => {
  /*
   * Kapea puhelin on tämän sovelluksen tyypillisin näyttö. Sekä näppäimistön että
   * QR-koodin on mahduttava siihen: aiemmin siirtymäpainikkeet veivät kaksi riviä ja
   * työnsivät kilpailijan nimen ruudun ulkopuolelle, ja QR-koodi valui reunojen yli.
   */
  test.use({ viewport: { width: 360, height: 660 } })

  test('kilpailijan nimi näkyy näppäimistön kanssa', async ({ page }) => {
    await avaaKisalla(
      page,
      [
        { etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' },
        { etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes' },
      ],
      { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' },
    )

    await expect(page.locator('.nimi')).toBeInViewport()
    // Siirtymäpainikkeet mahtuvat samalle riville.
    const edellinen = await page.getByRole('button', { name: 'Edellinen kilpailija' }).boundingBox()
    const seuraava = await page.getByRole('button', { name: 'Seuraava kilpailija' }).boundingBox()
    expect(edellinen).not.toBeNull()
    expect(seuraava).not.toBeNull()
    expect(Math.abs((edellinen?.y ?? 0) - (seuraava?.y ?? 0))).toBeLessThan(4)
  })

  test('QR-koodi mahtuu ruudulle', async ({ page }) => {
    await avaaKisalla(page, [{ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' }], {
      polku: '/#/yhdista',
    })

    await page.getByRole('button', { name: 'Luo siirtokoodi' }).click()
    const kangas = page.locator('canvas')
    await expect(kangas).toBeVisible()

    const laatikko = await kangas.boundingBox()
    expect(laatikko).not.toBeNull()
    // Ei ulos vasemmasta reunasta eikä oikeasta.
    expect(laatikko!.x).toBeGreaterThanOrEqual(0)
    expect(laatikko!.x + laatikko!.width).toBeLessThanOrEqual(360)

    // Eikä koko sivu saa vieriä vaakasuunnassa.
    const vaaka = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(vaaka).toBe(false)
  })
})
