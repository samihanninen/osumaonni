import { test, expect } from '@playwright/test'
import { avaaKisalla, avaaTyhjana, siirry } from './apurit'

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

/**
 * Rosteri: sama porukka seuraavaan kisaan ilman uudelleen syöttämistä.
 *
 * Tämä on koko ominaisuuden syy. Pienessä yhdistyksessä samat ihmiset ampuvat kisan
 * toisensa jälkeen, mutta kisa on kertakäyttöinen — ilman rosteria nimet, yhdistykset
 * ja lajit naputellaan joka kerta uudelleen. Testi kulkee koko kierroksen: kilpailijat
 * rosteriin, kisa nollille, ja sama porukka takaisin täppäämällä.
 */
test('rosterista saa saman porukan seuraavaan kisaan', async ({ page }) => {
  await avaaTyhjana(page, '/#/kilpailijat')

  for (const [etunimi, sukunimi] of [
    ['Sanna', 'Hakala'],
    ['Pertti', 'Virtanen'],
  ]) {
    await page.locator('#etunimi').fill(etunimi!)
    await page.locator('#sukunimi').fill(sukunimi!)
    await page.locator('#yhdistys').fill('Nupures')
    await page.getByRole('button', { name: 'Lisää kilpailija' }).click()
  }
  await expect(page.getByText('2 kilpailijaa')).toBeVisible()

  await page.getByRole('button', { name: /Tallenna kisan kilpailijat rosteriin/ }).click()
  await expect(page.getByText('Rosteriin tallennettiin 2 uutta henkilöä')).toBeVisible()

  // Kisa nollille: rosteri jää, koska se on lista joka kestää kisan yli.
  await siirry(page, '/#/kisatiedot')
  await page.getByRole('button', { name: 'Aloita uusi kisa', exact: true }).click()
  await page.getByRole('button', { name: 'Kyllä, poista kisan tiedot' }).click()
  await expect(page.getByText(/Rosterin 2 henkilöä jäivät laitteelle/)).toBeVisible()

  await siirry(page, '/#/kilpailijat')
  await expect(page.getByText('Ei vielä kilpailijoita')).toBeVisible()
  await expect(page.getByText('2 henkilöä')).toBeVisible()

  // Täppäys tuo kilpailijan kaikkine lajeineen: 2 × RA1–RA4.
  await page.getByRole('button', { name: /Lisää kaikki kisaan/ }).click()
  await expect(page.getByText('2 kilpailijaa')).toBeVisible()
  await expect(page.locator('li .laji select')).toHaveCount(8)

  // Rosteri säilyy myös uudelleenlatauksen yli — se on laitteen muistissa.
  await page.reload()
  await expect(page.getByText('2 henkilöä')).toBeVisible()
})

/*
 * Rosterin poistaminen on henkilötietojen poistamista, joten se tehdään samasta
 * paikasta kuin kisan poistaminen — eikä se saa viedä kisaa mukanaan.
 */
test('rosterin voi tyhjentää kisatiedoista kisaa koskematta', async ({ page }) => {
  await avaaTyhjana(page, '/#/kilpailijat')

  await page.locator('#sukunimi').fill('Hakala')
  await page.locator('#yhdistys').fill('Nupures')
  await page.getByRole('button', { name: 'Lisää kilpailija' }).click()
  await page.getByRole('button', { name: /Tallenna kisan kilpailijat rosteriin/ }).click()

  await siirry(page, '/#/kisatiedot')
  await page.getByRole('button', { name: 'Tyhjennä rosteri', exact: true }).click()
  await expect(page.getByText(/Poistetaanko rosterin 1 henkilöä/)).toBeVisible()
  await page.getByRole('button', { name: 'Kyllä, tyhjennä rosteri' }).click()
  await expect(page.getByText('Rosteri tyhjennetty')).toBeVisible()

  await siirry(page, '/#/kilpailijat')
  await expect(page.getByText('1 kilpailijaa')).toBeVisible()
  // Rosteriosio on taitettuna, koska kisassa on jo kilpailijoita. Otsikko kertoo tilan.
  await page.locator('summary.otsikko').click()
  await expect(page.getByText('Rosteri on tyhjä')).toBeVisible()
})

/*
 * Rosteriin pääsi ennen vain lisäyshetkellä tai koko kisa kerralla. Listalla jo oleva
 * yksittäinen kilpailija jäi väliin: hänet olisi pitänyt poistaa ja kirjata uudelleen.
 */
test('listalla olevan kilpailijan voi täpätä rosteriin jälkikäteen', async ({ page }) => {
  await avaaTyhjana(page, '/#/kilpailijat')

  await page.locator('#etunimi').fill('Sanna')
  await page.locator('#sukunimi').fill('Hakala')
  await page.locator('#yhdistys').fill('Nupures')
  await page.getByRole('button', { name: 'Lisää kilpailija' }).click()
  await expect(page.getByText('1 kilpailijaa')).toBeVisible()

  const rasti = page.getByRole('checkbox', { name: 'Sanna Hakala rosterissa' })
  await expect(rasti).not.toBeChecked()
  await rasti.check()

  // Rosteri on laitteen muistissa, joten se säilyy myös uudelleenlatauksen yli.
  await page.reload()
  await expect(page.getByText('1 henkilöä')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Sanna Hakala rosterissa' })).toBeChecked()

  // Rastin poisto vie rosterista, mutta kilpailija jää kisaan tuloksineen.
  await page.getByRole('checkbox', { name: 'Sanna Hakala rosterissa' }).uncheck()
  await expect(page.getByText('1 kilpailijaa')).toBeVisible()
  await page.locator('summary.otsikko').click()
  await expect(page.getByText('Rosteri on tyhjä')).toBeVisible()
})
