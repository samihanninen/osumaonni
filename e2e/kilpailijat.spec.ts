import { test, expect } from '@playwright/test'
import { avaaKisalla } from './apurit'

/**
 * Kilpailijalistan muokkaus selaimessa.
 *
 * Lista järjestetään sukunimen mukaan ja nimikentät tallentavat joka painalluksella.
 * Yhdessä ne siirsivät riviä kesken sanan, jolloin kohdistus lähti kentästä eikä nimeä
 * voinut kirjoittaa loppuun. Tämä testi kirjoittaa oikeilla näppäinpainalluksilla, koska
 * juuri kohdistuksen säilyminen on se mitä mitataan.
 */
test('sukunimen voi kirjoittaa loppuun ilman että kohdistus karkaa', async ({ page }) => {
  await avaaKisalla(page, [{ etunimi: 'Pertti', sukunimi: 'Hak', yhdistys: 'Nupures' }], {
    polku: '/#/kilpailijat',
  })

  // Lisätään toinen kilpailija, jonka sukunimi kirjoitetaan vasta listassa.
  await page.getByLabel('Etunimi').first().fill('Sanna')
  await page.getByLabel('Sukunimi').first().fill('X')
  await page.getByRole('button', { name: 'Lisää kilpailija' }).click()

  const sannaKentta = page
    .locator('input[id^="suku-"]')
    .filter({ hasNot: page.locator('x') })
    .last()
  await sannaKentta.click()
  await sannaKentta.press('Control+a')
  await sannaKentta.press('Backspace')

  // Kirjoitetaan kirjain kerrallaan kuten oikea käyttäjä.
  await page.keyboard.type('Hakala', { delay: 20 })

  // Kohdistus on yhä samassa kentässä ja koko nimi meni perille.
  await expect(sannaKentta).toBeFocused()
  await expect(sannaKentta).toHaveValue('Hakala')
})
