import { test, expect, type Page } from '@playwright/test'

/**
 * Mukautettu kisa selaimessa.
 *
 * Kisa perustetaan käyttöliittymän kautta eikä valmiiksi tallennetusta tilasta: juuri
 * lomakkeiden kautta kulkevat viat eivät näy yksikkötesteissä. Sarjaton kilpailija ja
 * kahteen eri asiaan viittaava "Lisää sarja" -painike löytyivät kumpikin vasta tästä
 * polusta.
 */

/** Perustaa mukautetun kisan: yksi oma sarja ja kolmen asennon laji. */
async function perustaKolmenAsennonKisa(page: Page) {
  await page.goto('/#/kisatiedot')
  await page.getByRole('button', { name: 'Mukautettu kisa' }).click()

  await page.getByLabel('Uuden sarjan nimi').fill('Veteraanit')
  await page.getByRole('button', { name: 'Lisää sarja' }).click()

  await page.getByRole('button', { name: 'Lisää laji' }).click()
  await page.getByLabel('Lyhenne').fill('3-as')
  await page.getByLabel('Lajin nimi').fill('Kolme asentoa')

  const lisaaKilpasarja = page.getByRole('button', { name: 'Lisää kilpasarja' })
  await lisaaKilpasarja.click()
  await lisaaKilpasarja.click()

  const sarjat = [
    { nimi: 'Makuu', laukauksia: '3' },
    { nimi: 'Polvi', laukauksia: '2' },
    { nimi: 'Pysty', laukauksia: '1' },
  ]
  for (const [i, sarja] of sarjat.entries()) {
    const nimi = page.getByLabel(`Kolme asentoa: sarjan ${i + 1} nimi`)
    await nimi.fill(sarja.nimi)
    await nimi.blur()
    const maara = page.getByLabel(`Kolme asentoa: sarjan ${i + 1} laukausmäärä`)
    await maara.fill(sarja.laukauksia)
    // change-tapahtuma syntyy vasta kohdistuksen poistuessa, kuten selaimessa aina.
    await maara.blur()
  }
}

async function lisaaKilpailija(page: Page) {
  await page.goto('/#/kilpailijat')
  await page.getByLabel('Etunimi').first().fill('Sanna')
  await page.getByLabel('Sukunimi').first().fill('Hakala')
  await page.getByLabel('Yhdistys / ryhmä').fill('Nupures')
  await page.getByRole('button', { name: 'Lisää kilpailija' }).click()
  // Rastitus liittää kilpailijan kisan ainoaan lajiin.
  await page.getByRole('checkbox').last().check()
}

/** Kirjaa kaikki kuusi laukausta kosketusnäppäimistöllä. */
async function kirjaaLaukaukset(page: Page) {
  await page.getByRole('link', { name: 'Syötä tulokset' }).click()
  // Työpöydällä oletus on taulukkosyöttö; kosketusnäppäimistö on puhelimen polku.
  await page.locator('summary.tapa-otsikko').click()
  await page.getByRole('button', { name: 'Näppäimistö', exact: true }).click()
  for (const arvo of ['10', '9', '8', '7', '6', '5']) {
    await page
      .locator('.nappain', { hasText: new RegExp(`^${arvo}$`) })
      .first()
      .click()
  }
}

test.describe('mukautettu kisa', () => {
  test('lajin kilpasarjat voivat olla eri mittaisia ja nimettyjä', async ({ page }) => {
    await perustaKolmenAsennonKisa(page)

    await expect(page.getByText('3 kilpasarjaa, 6 laukausta')).toBeVisible()
    // Suurin tulos summalajissa: kuusi laukausta × 10.
    await expect(page.getByText('Suurin tulos 60')).toBeVisible()
  })

  /*
   * Kilpasarjan lisääminen ja sarjan lisääminen ovat eri asioita. Painikkeet olivat
   * kertaalleen samannimisiä, mikä on tietomallin termistön vastaista ja sekoittaisi
   * kirjaajan juuri kisaa perustettaessa.
   */
  test('sarja ja kilpasarja ovat käyttöliittymässä eri asioita', async ({ page }) => {
    await perustaKolmenAsennonKisa(page)

    await expect(page.getByRole('button', { name: 'Lisää sarja' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Lisää kilpasarja' })).toHaveCount(1)
  })

  /*
   * Sarjaton kilpailija ei näkyisi yhdessäkään sarjakohtaisessa tuloslistassa, joten
   * lomakkeen kautta lisätyn kilpailijan on aina päädyttävä johonkin sarjaan.
   */
  test('lomakkeelta lisätty kilpailija saa aina sarjan', async ({ page }) => {
    await perustaKolmenAsennonKisa(page)
    await lisaaKilpailija(page)

    // Sarja luetaan kilpailijasivun valitsimesta: tyhjä arvo oli juuri se vika.
    const valitsin = page.locator('select').filter({ hasText: 'Yleinen' }).first()
    await expect(valitsin).toHaveValue('Yleinen')
  })

  test('laukaukset kirjautuvat oikeisiin kilpasarjoihin ja tulos lasketaan summana', async ({
    page,
  }) => {
    await perustaKolmenAsennonKisa(page)
    await lisaaKilpailija(page)

    await kirjaaLaukaukset(page)
    await expect(page.getByText('3 + 2 + 1 laukausta')).toBeVisible()

    // 10+9+8 / 7+6 / 5 = 45 summana, ei parhaana kilpasarjana (27).
    await expect(page.locator('.luku-arvo').first()).toHaveText('45')

    await page.getByRole('link', { name: 'Sijoitukset' }).first().click()
    const rivi = page.locator('tbody tr').first()
    await expect(rivi).toContainText('45')
  })

  test('sarjaotsikot näkyvät tuloslistassa kilpasarjojen niminä', async ({ page }) => {
    await perustaKolmenAsennonKisa(page)
    await lisaaKilpailija(page)

    await kirjaaLaukaukset(page)
    await page.getByRole('link', { name: 'Sijoitukset' }).first().click()

    for (const nimi of ['MAKUU', 'POLVI', 'PYSTY']) {
      await expect(page.locator('thead')).toContainText(nimi, { ignoreCase: true })
    }
  })

  /* Sarja on mukautetussa kisassa kilpailuluokka, joka ei välttämättä liity ikään. */
  test('sarjasuodatin käyttää kisan omia sarjoja', async ({ page }) => {
    await perustaKolmenAsennonKisa(page)
    await lisaaKilpailija(page)

    await kirjaaLaukaukset(page)
    await page.getByRole('link', { name: 'Sijoitukset' }).first().click()

    await expect(page.getByRole('button', { name: 'Yleinen', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Veteraanit', exact: true })).toBeVisible()
    await expect(page.getByText('Ikäsarja')).toHaveCount(0)
  })
})
