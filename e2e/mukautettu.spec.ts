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
  // Lomake liittää kilpailijan kisan kaikkiin lajeihin, tässä siis siihen ainoaan.
  await expect(page.locator('li .laji input[type="checkbox"]')).toBeChecked()
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

  /*
   * Aseluokka oli pitkään kiinteä Vakio/Avoin, vaikka lajit ja sarjat olivat jo
   * mukautettavissa. Mukautetussa kisassa luokan ei tarvitse liittyä aseeseen lainkaan.
   *
   * Testi kulkee koko ketjun: luokka nimetään kisatiedoissa, valitaan kilpailijalistalla
   * ja näkyy sijoituksissa — jokainen kohta lukee luokat eri paikasta, joten ne voivat
   * eriytyä toisistaan huomaamatta.
   */
  test('omat aseluokat kulkevat kisatiedoista kilpailijalistalle ja sijoituksiin', async ({
    page,
  }) => {
    await perustaKolmenAsennonKisa(page)

    // Sääntöjen luokat pois ja omat tilalle.
    await page.getByLabel('Uuden luokan nimi').fill('Kivääri')
    await page.getByRole('button', { name: 'Lisää luokka' }).click()
    const avoin = page.getByLabel('Luokan nimi: Avoin')
    await avoin.fill('Optiikka')
    // change-tapahtuma syntyy vasta kohdistuksen poistuessa, kuten selaimessa aina.
    await avoin.blur()
    await expect(page.getByLabel('Luokan nimi: Optiikka')).toBeVisible()

    await lisaaKilpailija(page)

    // Kilpailijalistan lajikohtainen valitsin tarjoaa kisan omat luokat.
    const luokkavalitsin = page.getByLabel('3-as: aseluokka')
    await expect(luokkavalitsin.locator('option')).toHaveText(['Vakio', 'Optiikka', 'Kivääri'])
    await luokkavalitsin.selectOption('Kivääri')

    await kirjaaLaukaukset(page)

    await page.getByRole('link', { name: 'Sijoitukset' }).first().click()
    // Luokkanapit seuraavat kisan listaa, ja ampuja löytyy valitsemastaan luokasta.
    await page.getByRole('button', { name: /^Kivääri/ }).click()
    await expect(page.locator('tbody tr').first()).toContainText('Hakala')

    await page.getByRole('button', { name: /^Vakio/ }).click()
    await expect(page.getByText('Hakala')).toBeHidden()
  })

  /*
   * Poistettu luokka ei saa jättää ketään luokkaan jota ei ole: sellainen osallistuminen
   * katoaisi kaikista luokkakohtaisista sijoituksista huomaamatta.
   */
  test('luokan poisto siirtää osallistumiset jäljelle jäävään luokkaan', async ({ page }) => {
    await perustaKolmenAsennonKisa(page)
    await lisaaKilpailija(page)

    await page.goto('/#/kilpailijat')
    await page.getByLabel('3-as: aseluokka').selectOption('Avoin')

    await page.goto('/#/kisatiedot')
    // Poistetaan Avoin, jossa kilpailija on — varmistus kertoo siirtyvien määrän.
    const avoimenRivi = page
      .locator('li.luokka')
      .filter({ has: page.getByLabel('Luokan nimi: Avoin') })
    await avoimenRivi.getByRole('button', { name: 'Poista' }).click()
    await expect(page.getByText(/1 osallistumista siirtyvät/)).toBeVisible()
    await page.getByRole('button', { name: 'Kyllä, poista' }).click()

    await page.goto('/#/kilpailijat')
    // Ainoa jäljellä oleva luokka on nyt valittuna.
    await expect(page.getByLabel('3-as: aseluokka')).toHaveValue('Vakio')
  })

  /*
   * Vienti- ja Yhdistä-sivut listasivat lajit kiinteästä RA1–RA4:stä kisan omien lajien
   * sijaan. Mukautetussa kisassa se tarkoitti neljää nollariviä lajeista joita kisassa ei
   * ole — ja kisan todellinen laji puuttui listalta kokonaan.
   */
  test('vienti- ja yhdistämissivu listaavat kisan omat lajit', async ({ page }) => {
    await perustaKolmenAsennonKisa(page)
    await lisaaKilpailija(page)

    await page.goto('/#/vienti')
    const yhteenveto = page.locator('dl.tiedot').first()
    await expect(yhteenveto).toContainText('3-as')
    await expect(yhteenveto).toContainText('Kilpailijoita')
    for (const resulLaji of ['RA1', 'RA2', 'RA3', 'RA4']) {
      await expect(yhteenveto).not.toContainText(resulLaji)
    }

    await page.goto('/#/yhdista')
    const rajaus = page.locator('fieldset.lajit')
    await expect(rajaus).toContainText('3-as')
    await expect(rajaus).not.toContainText('RA1')
  })
})
