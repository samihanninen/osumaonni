import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { avaaKisalla, napautaMonta, siirry } from './apurit'

/**
 * Vienti ja tuonti oikeassa selaimessa.
 *
 * Tämä on sovelluksen tärkein turvaverkko: jos selaimen muisti tyhjenee, viety tiedosto
 * on ainoa jäljelle jäävä kopio. Kierros ajetaan siksi läpi aidosti — tiedosto ladataan
 * levylle ja luetaan takaisin sisään.
 */

const AMPUJAT = [
  { etunimi: 'Aada', sukunimi: 'Ahonen', yhdistys: 'KaRes' },
  { etunimi: 'Sanna', sukunimi: 'Hakala', yhdistys: 'Nupures' },
]

test('vienti lataa Excel-tiedoston', async ({ page }) => {
  await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

  // Kirjataan tuloksia, jotta tiedostossa on jotain.
  await napautaMonta(page, '9', 10)

  await siirry(page, '/#/vienti')
  const lataus = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Lataa tiedosto' }).click()
  const tiedosto = await lataus

  expect(tiedosto.suggestedFilename()).toMatch(/^selaintestikisa-\d{4}-\d{2}-\d{2}\.xlsx$/)

  const polku = await tiedosto.path()
  const tavut = await readFile(polku)
  // xlsx on zip-paketti, joten se alkaa PK-tunnisteella.
  expect(tavut.subarray(0, 2).toString('latin1')).toBe('PK')
  expect(tavut.byteLength).toBeGreaterThan(5000)
})

test('viennin jälkeen muistutus katoaa', async ({ page }) => {
  // Vanha vienti → muistutus näkyvissä.
  await avaaKisalla(page, AMPUJAT, {
    polku: '/#/vienti',
    viimeinenVienti: new Date(Date.now() - 3 * 3600_000).toISOString(),
  })
  await expect(page.locator('.varoitus')).toBeVisible()

  const lataus = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Lataa tiedosto' }).click()
  await lataus

  await expect(page.locator('.varoitus')).toHaveCount(0)
  // Kohdistetaan ilmoituslaatikkoon: mailto-ohjeteksti sisältää myös sanan "ladattu".
  await expect(page.locator('.huomio.ilmoitus')).toContainText('ladattu')
})

/**
 * Aseta Web Share -tuki päälle tai pois.
 *
 * Tuki matkitaan tarkoituksella sen sijaan, että kysyttäisiin selaimelta. Aiemmin testi
 * ohitti itsensä, jos selain ei tukenut jakamista — CI:n selaimissa tuki puuttuu, joten
 * jakopainiketta ei koskaan testattu missään ajossa. Painikkeen teksti ehti sen turvin
 * muuttua ilman että yksikään testi huomasi. Nyt molemmat haarat ajetaan joka selaimella.
 *
 * Kutsu tämä ennen sivun avaamista, koska skripti ajetaan sivun omaa koodia ennen.
 */
async function asetaJakotuki(page: import('@playwright/test').Page, tuettu: boolean) {
  await page.addInitScript((paalle) => {
    const jaot: string[][] = []
    ;(window as unknown as { __jaot: string[][] }).__jaot = jaot

    const maarita = (nimi: string, arvo: unknown) =>
      Object.defineProperty(navigator, nimi, { value: arvo, configurable: true, writable: true })

    if (!paalle) {
      maarita('share', undefined)
      maarita('canShare', undefined)
      return
    }
    maarita('share', (data: ShareData) => {
      jaot.push((data.files ?? []).map((t) => t.name))
      return Promise.resolve()
    })
    maarita('canShare', () => true)
  }, tuettu)
}

// Kaksi erillistä testiä, koska sovellus tarjoaa eri polun tuen mukaan. Jokin niistä on
// aina tarjolla — muuten tulosten lähettäminen jäisi käyttäjän keksimisen varaan.

test('jakotuen kanssa jakopainike antaa tiedoston laitteen jakovalikkoon', async ({ page }) => {
  await asetaJakotuki(page, true)
  await avaaKisalla(page, AMPUJAT, { polku: '/#/vienti' })

  await expect(page.getByText(/oman jakovalikon/)).toBeVisible()
  await page.getByRole('button', { name: 'Jaa Excel-tiedosto' }).click()

  // Olennaista on, että jaettavaksi menee valmis .xlsx eikä tyhjä kutsu.
  await expect(page.locator('.huomio.ilmoitus')).toContainText('Tiedosto jaettu')
  const jaot = await page.evaluate(() => (window as unknown as { __jaot: string[][] }).__jaot)
  expect(jaot).toHaveLength(1)
  expect(jaot[0]?.[0]).toMatch(/^selaintestikisa-\d{4}-\d{2}-\d{2}\.xlsx$/)
})

test('ilman jakotukea tarjotaan sähköpostiluonnos', async ({ page }) => {
  await asetaJakotuki(page, false)
  await avaaKisalla(page, AMPUJAT, { polku: '/#/vienti' })

  await expect(page.getByRole('button', { name: 'Jaa Excel-tiedosto' })).toHaveCount(0)
  const sahkoposti = page.getByText('Lähettäminen sähköpostilla')
  await expect(sahkoposti).toBeVisible()
  await sahkoposti.click()
  await expect(page.getByRole('button', { name: 'Avaa sähköpostiluonnos' })).toBeVisible()
  // Rajoite on kerrottava, jottei käyttäjä oleta liitteen ilmestyvän itsestään.
  await expect(page.getByText(/ei voi sisältää liitettä/)).toBeVisible()
})

test('kierros: vie, tyhjennä muisti, tuo takaisin', async ({ page }) => {
  await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'nappaimisto' })

  // Kirjataan tunnistettava tulos: 10 × napakymppi = 100.
  await napautaMonta(page, '★', 10)
  await expect(page.locator('.sarja').first().locator('.sarja-summa strong')).toHaveText('100')

  await siirry(page, '/#/vienti')
  const lataus = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Lataa tiedosto' }).click()
  const polku = await (await lataus).path()

  /*
   * Simuloidaan pahin tapaus: selaimen sivustotiedot tyhjenevät kokonaan. Juuri tätä
   * varten vienti on olemassa.
   */
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  // Vientisivu kertoo tyhjästä tilasta: vienti ei aktivoidu ilman kilpailijoita.
  await expect(page.getByText('Lisää ensin kilpailijoita')).toBeVisible()
  await siirry(page, '/#/kilpailijat')
  await expect(page.getByText('Ei vielä kilpailijoita')).toBeVisible()

  // Tuodaan tiedosto takaisin.
  await siirry(page, '/#/vienti')
  await page.locator('input[type="file"]').setInputFiles(polku)

  // Esikatselu kertoo mitä ollaan tuomassa, ennen kuin mitään korvataan.
  await expect(page.getByText('Tarkista ennen tuontia')).toBeVisible()
  await expect(page.getByText('Selaintestikisa')).toBeVisible()

  await page.getByRole('button', { name: 'Korvaa tulokset' }).click()
  await expect(page.getByText(/Tulokset tuotu: 2 kilpailijaa/)).toBeVisible()

  // Tulos on palautunut sellaisenaan.
  await siirry(page, '/#/tulokset/RA1')
  const rivi = page.locator('tbody tr').first()
  await expect(rivi).toContainText('Ahonen')
  await expect(rivi.locator('.tulos')).toContainText('100')
})

test('käsin korjattu laukaus menee tuonnissa läpi', async ({ page }) => {
  await avaaKisalla(page, AMPUJAT, { polku: '/#/syota/RA1', syottotapa: 'taulukko' })

  const ruudut = page.locator('.ruutu')
  await ruudut.first().click()
  for (let i = 0; i < 10; i++) await page.keyboard.press('5')

  await siirry(page, '/#/vienti')
  const lataus = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Lataa tiedosto' }).click()
  const polku = await (await lataus).path()

  /*
   * Muokataan tiedostoa kuten järjestäjä tekisi Excelissä. Muokkaus tehdään Nodessa,
   * jossa ExcelJS on käytettävissä — selainkontekstissa paljasta moduulinimeä ei voi
   * ratkaista.
   */
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await readFile(polku))
  const ws = wb.getWorksheet('Tuloskortti RA1')!
  // Ahonen on rivi 4; ensimmäinen laukaussarake on 7 (RA1: 6 perussaraketta).
  for (let i = 0; i < 10; i++) ws.getCell(4, 7 + i).value = 10
  const muokatut = await wb.xlsx.writeBuffer()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'korjattu.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(muokatut as ArrayBuffer),
  })

  await page.getByRole('button', { name: 'Korvaa tulokset' }).click()

  // Korjaus näkyy: 10 × 10 = 100 aiemman 50:n sijaan.
  await siirry(page, '/#/tulokset/RA1')
  const rivi = page.locator('tbody tr').first()
  await expect(rivi).toContainText('Ahonen')
  await expect(rivi.locator('.tulos')).toContainText('100')
})

test('kelvoton tiedosto antaa selkeän virheen eikä hukkaa tuloksia', async ({ page }) => {
  await avaaKisalla(page, AMPUJAT, { polku: '/#/vienti' })

  await page.locator('input[type="file"]').setInputFiles({
    name: 'vaara.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('en ole xlsx-tiedosto'),
  })

  await expect(page.locator('.huomio--virhe')).toBeVisible()
  // Nykyiset tulokset ovat edelleen tallessa.
  await expect(page.getByText('Kilpailijoita')).toBeVisible()
  await siirry(page, '/#/kilpailijat')
  await expect(page.getByText('2 kilpailijaa')).toBeVisible()
})
