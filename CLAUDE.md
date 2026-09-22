# Ohjeita tässä repossa työskentelyyn

## Muutoksen viimeistely

Ennen versionumeron nostoa **ohjeet tarkistetaan aina.** Muutos ei ole valmis silloin kun
koodi toimii, vaan silloin kun se on myös kerrottu käyttäjälle. Kolme paikkaa:

- `README.md` — mitä sovellus tekee ja miksi
- `KILPAILUOHJE.md` — kilpailupäivän ohje
- **sovelluksen sisäinen ohje** — ei erillinen tiedosto: `src/core/ohje.ts` jäsentää
  `KILPAILUOHJE.md`:n käännösaikana, joten se päivittyy samalla. Jäsennin tuntee vain
  ohjeessa käytetyn Markdownin osajoukon, ja `src/core/__tests__/ohje.spec.ts` lukee
  oikean tiedoston — uusi merkintätapa vaatii siis myös jäsentimen päivityksen.

Tarkistus tehdään lopuksi kerran, ei jokaisen välikommitin yhteydessä.

## QR-vienti ja tuonti testataan aina

Jos siirto ei toimi, **kisa sekoaa** — eikä vika näy ennen kuin radalla ollaan kesken
kisan yhdistämässä kahden laitteen tuloksia. Siksi jokainen muutos, joka koskee kisan
rakennetta (lajit, sarjat, aseluokat, osallistumiset, tulokset), testataan myös siirron
läpi:

- `src/io/siirto.ts` — mitä pakettiin menee (`rakennaOsapaketti`, `rakennaTayspaketti`)
- `src/core/yhdistaminen.ts` — mitä vastaanottaja saa (`yhdista`)
- testit: `src/io/__tests__/siirto.spec.ts`, `src/core/__tests__/yhdistaminen.spec.ts`

Kaksi asiaa tarkistetaan erikseen: että uusi tieto **kulkee** paketissa, ja että
**vanhemmalta versiolta tuleva paketti ilman sitä** ei jätä kisaa epämääräiseen tilaan.
Sama koskee Excel-kierrosta (`src/io/__tests__/xlsx.spec.ts`).

## Molemmat kisamuodot

Kisa on joko `resul` tai `mukautettu`, ja ero on juuri se mistä lajit, sarjat ja
aseluokat tulevat. Jos koodi lukee niitä, **testi ajetaan molemmilla muodoilla.**

Kiinteä `LAJI_KOODIT`- tai `LUOKAT`-vakio siellä missä pitäisi lukea `kisanLajit`-,
`kisanSarjat`- tai `kisanLuokat`-saumaa on tämän koodikannan tavallisin vika: se näyttää
oikealta eikä kaadu mihinkään, vaan näyttää mukautetussa kisassa väärää dataa. Vakio on
oikea lähde vain `tyyppi === 'resul'` -ehdon takana.
