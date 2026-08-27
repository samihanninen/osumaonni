import { test, expect } from '@playwright/test'
import { avaaKisalla, avaaTyhjana, napautaMonta, siirry } from './apurit'

/** Kilpailijoiden hallinta ja tuloslistat oikeassa selaimessa. */

test.describe('kilpailijat', () => {
  test('kilpailijan lisääminen käyttöliittymästä', async ({ page }) => {
    await avaaTyhjana(page, '/#/kilpailijat')

    await expect(page.getByText('Ei vielä kilpailijoita')).toBeVisible()

    await page.locator('#etunimi').fill('Sanna')
    await page.locator('#sukunimi').fill('Hakala')
    await page.locator('#yhdistys').fill('Nupures')
    await page.getByRole('button', { name: 'Lisää kilpailija' }).click()

    await expect(page.getByText('1 kilpailijaa')).toBeVisible()
    // Yhdistys jää seuraavaa varten, nimet tyhjenevät.
    await expect(page.locator('#yhdistys')).toHaveValue('Nupures')
    await expect(page.locator('#sukunimi')).toHaveValue('')
  })

  test('sukunimi vaaditaan', async ({ page }) => {
    await avaaTyhjana(page, '/#/kilpailijat')

    await page.locator('#etunimi').fill('Pelkkä')
    await page.getByRole('button', { name: 'Lisää kilpailija' }).click()

    await expect(page.getByText('Sukunimi on pakollinen')).toBeVisible()
    await expect(page.getByText('Ei vielä kilpailijoita')).toBeVisible()
  })

  test('lajivalinta ja aseluokka', async ({ page }) => {
    await avaaTyhjana(page, '/#/kilpailijat')

    await page.locator('#sukunimi').fill('Testaaja')
    await page.getByRole('button', { name: 'Lisää kilpailija' }).click()

    // Aseluokkavalitsin ilmestyy vasta, kun laji on valittu.
    await expect(page.locator('.laji select')).toHaveCount(0)
    await page.locator('.laji input[type="checkbox"]').first().check()
    await expect(page.locator('.laji select')).toHaveCount(1)

    await page.locator('.laji select').selectOption('avoin')
    await page.reload()
    await expect(page.locator('.laji select')).toHaveValue('avoin')
  })

  test('poisto vaatii vahvistuksen', async ({ page }) => {
    await avaaKisalla(page, [{ etunimi: 'A', sukunimi: 'Poistettava', yhdistys: 'X' }], {
      polku: '/#/kilpailijat',
    })

    // exact: true on olennainen — "Poista" osuisi muuten myös "Kyllä, poista" -nappiin.
    await page.getByRole('button', { name: 'Poista', exact: true }).click()
    await expect(page.getByText('Poistetaanko myös kirjatut tulokset?')).toBeVisible()
    await expect(page.getByText('1 kilpailijaa')).toBeVisible()

    await page.getByRole('button', { name: 'Kyllä, poista', exact: true }).click()
    await expect(page.getByText('Ei vielä kilpailijoita')).toBeVisible()
  })
})

test.describe('sijoitukset', () => {
  /*
   * Nämä testit kirjaavat useita kilpailijoita käyttöliittymän kautta, eli kymmeniä
   * napautuksia ja sivunvaihtoja. WebKit on selvästi hitaampi per vuorovaikutus, joten
   * oletusaika ei riitä. Kyse ei ole odottamisesta vaan aidosta työmäärästä.
   */
  test.describe.configure({ timeout: 90_000 })

  const AMPUJAT = [
    { etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes', ikasarja: 'H50' as const },
    { etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' },
    {
      etunimi: 'Otto',
      sukunimi: 'Optiikka',
      yhdistys: 'Nupures',
      lajit: { RA1: { luokka: 'avoin' as const } },
    },
  ]

  /**
   * Kirjaa yhden kilpailijan ensimmäisen sarjan samalla arvolla.
   *
   * Valinnan jälkeen odotetaan, että laskuri on päivittynyt. Ilman odotusta ensimmäiset
   * napautukset voivat osua vielä edelliseen kilpailijaan, mikä tekee testistä satunnaisen.
   */
  async function kirjaa(page: import('@playwright/test').Page, indeksi: number, arvo: string) {
    await siirry(page, '/#/syota/RA1')
    await page.locator('#kilpailijavalinta').selectOption(String(indeksi))
    await expect(page.locator('.laskuri')).toContainText(`${indeksi + 1} /`)

    await napautaMonta(page, arvo, 10)
    // Varmistetaan, että kaikki kymmenen laukausta ehtivät tallentua.
    await expect(page.locator('#kilpailijavalinta')).toContainText('10/20')
  }

  test('järjestää tuloksen mukaan ja erottelee aseluokat', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    await kirjaa(page, 0, '7') // Ahonen, vakio → 70
    await kirjaa(page, 1, '9') // Hakala, vakio → 90
    await kirjaa(page, 2, '10') // Optiikka, avoin → 100

    await siirry(page, '/#/tulokset/RA1')

    // Vakioluokka: Hakala ensin, Ahonen toisena. Avoimen luokan ampuja ei näy.
    const rivit = page.locator('tbody tr')
    await expect(rivit).toHaveCount(2)
    await expect(rivit.nth(0)).toContainText('Hakala')
    await expect(rivit.nth(1)).toContainText('Ahonen')
    await expect(page.locator('tbody')).not.toContainText('Optiikka')

    // Avoin luokka omana listanaan.
    await page.getByRole('button', { name: /^Avoin/ }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody')).toContainText('Optiikka')
  })

  test('ikäsarjarajaus laskee sijat rajauksen sisällä', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    await kirjaa(page, 0, '7') // Ahonen H50 → 70
    await kirjaa(page, 1, '9') // Hakala H → 90

    await siirry(page, '/#/tulokset/RA1')
    // Kaikki: Ahonen on toinen.
    await expect(page.locator('tbody tr').nth(1)).toContainText('Ahonen')

    await page.getByRole('button', { name: 'H50', exact: true }).click()
    const rivit = page.locator('tbody tr')
    await expect(rivit).toHaveCount(1)
    // Rajauksen sisällä hän on ensimmäinen.
    await expect(rivit.first().locator('.sija')).toHaveText('1')
    await expect(page.getByText(/laskettu ikäsarjan H50 sisällä/)).toBeVisible()
  })

  test('napakymppi ratkaisee tasatuloksen', async ({ page }) => {
    await avaaKisalla(page, AMPUJAT.slice(0, 2), {
      polku: '/#/syota/RA1',
      syottotapa: 'nappaimisto',
    })

    // Ahonen: 10 × kymppi = 100 ilman napoja.
    await kirjaa(page, 0, '10')
    // Hakala: 10 × napakymppi = 100 mutta kymmenen napaa.
    await kirjaa(page, 1, '★')

    await siirry(page, '/#/tulokset/RA1')
    const rivit = page.locator('tbody tr')
    await expect(rivit.nth(0)).toContainText('Hakala')
    await expect(rivit.nth(0).locator('.napa')).toHaveText('10')
    await expect(rivit.nth(1)).toContainText('Ahonen')
  })
})

test.describe('yhdistyskilpailu', () => {
  // Viisi kilpailijaa × 10 napautusta: sama syy kuin sijoituksissa.
  test.describe.configure({ timeout: 120_000 })

  test('laskee parhaiden kolmen summan', async ({ page }) => {
    const ampujat = [
      { etunimi: 'A', sukunimi: 'Aaa', yhdistys: 'Nupures' },
      { etunimi: 'B', sukunimi: 'Bbb', yhdistys: 'Nupures' },
      { etunimi: 'C', sukunimi: 'Ccc', yhdistys: 'Nupures' },
      { etunimi: 'D', sukunimi: 'Ddd', yhdistys: 'Nupures' },
      { etunimi: 'E', sukunimi: 'Eee', yhdistys: 'KaRes' },
    ]
    await avaaKisalla(page, ampujat, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

    // Neljä ampujaa Nupureksesta: 100, 90, 80, 70 → parhaat kolme = 270.
    for (const [indeksi, arvo] of [
      [0, '10'],
      [1, '9'],
      [2, '8'],
      [3, '7'],
      [4, '6'],
    ] as [number, string][]) {
      await siirry(page, '/#/syota/RA1')
      await page.locator('#kilpailijavalinta').selectOption(String(indeksi))
      await expect(page.locator('.laskuri')).toContainText(`${indeksi + 1} /`)
      await napautaMonta(page, arvo, 10)
      await expect(page.locator('#kilpailijavalinta')).toContainText('10/20')
    }

    await siirry(page, '/#/yhdistykset')

    // Yhteistuloksen kärjessä Nupures 270 pisteellä (100 + 90 + 80, ei neljättä).
    const karki = page.locator('tbody tr').first()
    await expect(karki).toContainText('Nupures')
    await expect(karki.locator('.yhteensa')).toHaveText('270')

    // KaRes jää vajaaksi joukkueeksi yhdellä ampujalla.
    await expect(page.getByText('vajaa').first()).toBeVisible()
  })
})

test.describe('löydettävyys', () => {
  /*
   * Nämä testit navigoivat VAIN käyttöliittymän kautta, eivät koskaan suoraan
   * osoitteella. Muut testit menevät suoraan /#/syota/RA1:een, joten ne eivät paljasta
   * sitä, jos näkymään ei pääse mistään linkistä.
   */
  const AMPUJA = [{ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' }]

  test('tulosten syöttöön pääsee valikosta', async ({ page }) => {
    await avaaKisalla(page, AMPUJA)
    await page.locator('.valikko a', { hasText: 'Syötä tulokset' }).click()
    await expect(page.getByRole('heading', { name: 'Tulosten syöttö' })).toBeVisible()
  })

  test('tulosten syöttöön pääsee etusivulta', async ({ page }) => {
    await avaaKisalla(page, AMPUJA)
    await page.locator('.osio', { hasText: 'Syötä tulokset' }).click()
    await expect(page.getByRole('heading', { name: 'Tulosten syöttö' })).toBeVisible()
  })

  test('jokaiseen näkymään pääsee valikosta', async ({ page }) => {
    await avaaKisalla(page, AMPUJA)

    for (const [linkki, otsikko] of [
      ['Syötä tulokset', 'Tulosten syöttö'],
      ['Sijoitukset', 'Sijoitukset'],
      ['Kilpailijat', 'Kilpailijat'],
      ['Yhdistykset', 'Yhdistys- ja kokonaiskilpailu'],
      ['Yhdistä', 'Yhdistä tulokset'],
      ['Vienti', 'Vienti ja tuonti'],
      ['Kisatiedot', 'Kisatiedot'],
      ['Ohje', 'Kilpailupäivän ohje'],
    ] as [string, string][]) {
      await page.locator('.valikko a', { hasText: new RegExp(`^${linkki}$`) }).click()
      await expect(page.getByRole('heading', { name: otsikko, level: 1 })).toBeVisible()
    }
  })

  test('valikko palaa siihen lajiin, jota oltiin kirjaamassa', async ({ page }) => {
    await avaaKisalla(page, [{ ...AMPUJA[0]!, lajit: { RA1: {}, RA3: {} } }])

    await page.locator('.valikko a', { hasText: 'Syötä tulokset' }).click()
    // Vaihdetaan laji RA3:een ja poistutaan välillä muualle.
    await page.locator('.lajinappi', { hasText: 'RA3' }).click()
    await expect(page).toHaveURL(/syota\/RA3/)

    await page.locator('.valikko a', { hasText: 'Kilpailijat' }).click()
    await page.locator('.valikko a', { hasText: 'Syötä tulokset' }).click()

    // Palataan RA3:een eikä oletuslajiin.
    await expect(page).toHaveURL(/syota\/RA3/)
  })
})

test.describe('perustoiminnot', () => {
  test('etusivu kertoo paikallisesta tallennuksesta', async ({ page }) => {
    await avaaTyhjana(page)
    await expect(page.getByText('Tiedot tallentuvat vain tähän laitteeseen')).toBeVisible()
  })

  /*
   * Versionumero korvataan käännösaikana, joten tämä testataan nimenomaan valmiista
   * buildista: yksikkötesti ei paljastaisi, jos `define` toimisi vain kehityksessä.
   * Ilman numeroa laitteiden versioita ei voi verrata silloin kun QR-siirto ei toimi.
   */
  test('versionumero näkyy sivun alalaidassa', async ({ page }) => {
    await avaaTyhjana(page)
    const alapalkki = page.locator('.alapalkki')
    await expect(alapalkki).toContainText(/v\d+\.\d+\.\d+/)
    await expect(alapalkki).not.toContainText('SOVELLUS_VERSIO')
  })

  test('tuntematon osoite näyttää virhesivun', async ({ page }) => {
    await avaaTyhjana(page, '/#/ei-ole-olemassa')
    await expect(page.getByRole('heading', { name: 'Sivua ei löytynyt' })).toBeVisible()
    await expect(page.getByText('Kirjatut tulokset ovat tallessa')).toBeVisible()
  })

  test('kisatiedot tallentuvat', async ({ page }) => {
    await avaaTyhjana(page, '/#/kisatiedot')
    await page.locator('#nimi').fill('Kesäkisa 2026')
    await page.reload()
    await expect(page.locator('#nimi')).toHaveValue('Kesäkisa 2026')
  })

  test('kisan tiedot voi poistaa kisan päätyttyä', async ({ page }) => {
    await avaaKisalla(page, [{ etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' }], {
      polku: '/#/kilpailijat',
    })
    await expect(page.getByText('1 kilpailijaa')).toBeVisible()

    await siirry(page, '/#/kisatiedot')
    await page.getByRole('button', { name: 'Aloita uusi kisa', exact: true }).click()

    // Ensimmäinen napautus vain kysyy; tietoja ei ole vielä poistettu.
    await expect(page.getByText(/Poistetaanko 1 kilpailijan tiedot/)).toBeVisible()
    await page.getByRole('button', { name: 'Kyllä, poista kisan tiedot' }).click()
    await expect(page.getByText('Kisan tiedot poistettu')).toBeVisible()

    // Tiedot ovat oikeasti poissa, myös uudelleenlatauksen jälkeen.
    await siirry(page, '/#/kilpailijat')
    await expect(page.getByText('Ei vielä kilpailijoita')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Ei vielä kilpailijoita')).toBeVisible()
  })

  test('sivu ei vieri vaakasuunnassa kapeallakaan näytöllä', async ({ page }) => {
    // Leveä rakennetaulukko saa vierittää omassa kehyksessään, mutta ei koko sivua:
    // ylivuotava sisältö peittäisi alapuoliset painikkeet.
    await avaaKisalla(page, [{ etunimi: 'A', sukunimi: 'B', yhdistys: 'C' }], {
      polku: '/#/kisatiedot',
    })

    const vaakavieritys = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(vaakavieritys).toBe(false)
  })

  test('lajien rakenne vastaa sääntöjä', async ({ page }) => {
    await avaaTyhjana(page, '/#/kisatiedot')
    const rivit = page.locator('tbody tr')
    // RA1: 2 × 10, maksimi 100.
    await expect(rivit.nth(0)).toContainText('20 ls')
    await expect(rivit.nth(0)).toContainText('100')
    // RA2: 3 × 6, maksimi 180.
    await expect(rivit.nth(1)).toContainText('18 ls')
    await expect(rivit.nth(1)).toContainText('180')
  })
})
