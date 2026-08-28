# 🎯 OsumaOnni — Reserviläisammunnan tuloskortti

Selaimessa toimiva tuloskortti- ja tuloslaskentasovellus reserviläisammuntaan.
Kaikki tiedot pysyvät **vain omalla laitteellasi** — sovelluksessa ei ole taustapalvelinta.

**➡️ Sovellus: https://samihanninen.github.io/osumaonni/**

**📖 Kilpailupäivän ohje: [KILPAILUOHJE.md](KILPAILUOHJE.md)** — lyhyt muistilista siitä
mitä radalla tehdään. Sama ohje löytyy sovelluksen sisältä *Ohje*-välilehdeltä, jolloin
se on luettavissa myös ilman verkkoyhteyttä. Tämä README on tausta-aineistoa; kisapäivänä
riittää tuo yksi sivu.

Osoite on kokonaan pienellä. GitHub Pages tarjoilee polun kirjainkoolle tarkasti,
joten `/OsumaOnni/` ei toimi — pelkkä pieni kirjoitusasu on helpompi sanella radalla.

Sovellus on selainversio Nummi-Pusulan Reserviläiset ry:n Excel-tuloskortista.
Excel-versio vaatii Excel 2021:n tai Microsoft 365:n (`SORTBY`, `FILTER`, `SEQUENCE`),
sen kilpailijamäärän kasvattaminen vaatii käsityötä, eikä 43 sarakkeen taulukko ole
käytettävissä puhelimella ampumaradalla. Tämä versio korjaa nämä kolme asiaa.

---

## Ominaisuudet

- **Neljä lajia RESUL:n virallisten sääntöjen mukaisesti** (versiot 1.6 / 2025):

  | Laji | Ase | Kilpasarjat | Tulos | Etäisyys | Asento |
  |---|---|---|---|---|---|
  | **RA1** | itselataava kivääri, 5,45–8,00 mm | 2 × 10 ls | parempi sarja | 150 m | makuu |
  | **RA2** | itselataava kivääri, 5,45–8,00 mm | 3 × 6 ls | sarjojen summa | 150 m | makuu |
  | **RA3** | itselataava pistooli, väh. 9,00 mm | 2 × 10 ls | parempi sarja | 25 m | seisten |
  | **RA4** | itselataava pistooli, väh. 9,00 mm | 2 × 10 ls (tuplat) | parempi sarja | 25 m | seisten |

- **Mukautettu kisa** — kolmen asennon kisa, oma kilpailu tai mikä tahansa harjoitus:
  määrittele lajit, kilpasarjat ja sarjat itse. RESUL-lajit pysyvät koskemattomina
  (ks. [Mukautettu kisa](#mukautettu-kisa))
- **Vakio- ja avoin luokka** erikseen — avoimessa luokassa optiikka on sallittu, joten
  tulokset lasketaan ja järjestetään luokittain erikseen
- **Ikäsarjat H ja H50**
- **Napakymppi** (`*`) ja **ohilaukaus** (`-`) — napakymppi on 10 pistettä ja kirjautuu
  napalaskuriin tasatulosten ratkaisemista varten
- **Sijoitukset virallisen tasatulossäännön mukaan** — iskemien määrä, sitten napakympit,
  kympit, ysit jne.; parempi-sarja-lajeissa tarvittaessa myös huonompi sarja. Sijoilla 9→
  tasatulokset jaetaan sukunimen mukaisessa aakkosjärjestyksessä
- **Sääntörikkeet** −2 pistettä kerrallaan; turvallisuusrike mitätöi tuloksen
- **Yhdistys- ja joukkuekilpailu** — lajikohtainen ja yhteistulos, parhaiden 3 kilpailijan
  summa (joukkueen koko sääntöjen mukaan 3 ampujaa)
- **Sarjarakenne on muokattavissa** — säännöt muuttuvat, joten laukausmäärät ja sarjojen
  määrä ovat asetuksia, ei koodia
- **Yksi kilpailijalista** — nimi ja yhdistys kirjataan kertaalleen, lajit valitaan rastittamalla
- **Ei kilpailijarajaa** — Excel-version 50 kilpailijan katto poistuu
- **Iso kosketusnäppäimistö kaikilla laitteilla** — myös tietokoneella, koska numeroiden
  näppäileminen on hitaampaa kuin painikkeiden napauttaminen eikä kannettavissa yleensä
  ole numeronäppäimistöä. Excelin tapainen taulukko on valittavissa syöttönäkymästä, ja
  se on ylivoimainen tulosten jälkikäteiseen korjaamiseen
- **Tulokset voi tyhjentää erikseen** — kilpailijat ja lajivalinnat säilyvät, joten sama
  lista voidaan ampua uudelleen ilman uudelleensyöttöä
- **Monta kirjaajaa** — useampi henkilö voi kirjata tuloksia omalla laitteellaan ja tulokset yhdistetään yhdelle laitteelle
- **Offline** — asennettavissa kotivalikkoon ja toimii ilman verkkoyhteyttä
- **Kilpailupäivän ohje sovelluksen sisällä** — kisapäivän muistilista luettavissa myös
  radalla, jossa verkkoyhteyttä ei ole
- **Tallennus ei ylikirjoitu huomaamatta** — sovellus lukee laitteelle tallennetun kisan
  vain, jos se tunnistaa tallennuksen rakenteen; tuntematonta ei avata eikä kirjoiteta yli
- **Vienti ja tuonti Excel-tiedostona** — tulokset saa ulos ja takaisin sisään

---

## Käyttöohje

1. **Kisatiedot** — valitse ensin kisan muoto: **RESUL** (RA1–RA4 virallisin säännöin) vai
   **mukautettu kisa**, jossa määrittelet lajit itse. Kirjaa sitten kisan nimi, järjestäjä,
   paikka, päivämäärä ja vastuuhenkilöt. Mukautetussa kisassa määrittele myös lajit,
   kilpasarjat ja sarjat — ks. [Mukautettu kisa](#mukautettu-kisa).
2. **Kilpailijat** — lisää kilpailijat: nimi, yhdistys ja lajit joihin hän osallistuu.
   Yhdistyksen nimi ehdotetaan aiemmin syötetyistä, joten kirjoitusasu pysyy samana.
3. **Syöttö** — valitse laji ja syötä laukaukset. Sarjan summa, navat ja kilpailutulos
   päivittyvät heti. Merkitse napakymppi `*`:llä ja huti `-`:llä.
4. **Sijoitukset** — henkilökohtaiset tulokset järjestyksessä, tasatulokset napojen mukaan.
5. **Yhdistykset** — yhdistyskilpailun tilanne lajeittain ja yhteistuloksena.
6. **Vienti** — lataa tai jaa tulokset Excel-tiedostona. **Tee tämä kisan aikana säännöllisesti.**

Kisapäivää varten on erillinen tiivis muistilista: [KILPAILUOHJE.md](KILPAILUOHJE.md).
Se on luettavissa myös sovelluksen *Ohje*-välilehdeltä ilman verkkoyhteyttä.

---

## Mukautettu kisa

Kaikki kisat eivät ole RESUL-kisoja. Kolmen asennon ammunta, kahden kierroksen harjoitus
tai yhdistyksen oma kilpailu eivät mahdu RA1–RA4:n rakenteeseen, joten ne ammutaan
**mukautettuna kisana**: lajit, kilpasarjat ja sarjat määritellään itse.

Muoto valitaan *Kisatiedot*-sivulta. **Kisa on aina yhtä muotoa** — RESUL tai mukautettu,
ei molempia. Sekamuotoinen kisa tekisi kokonaiskilpailusta tulkinnanvaraisen, eikä
virallisen kisan tulos saa riippua siitä, mitä muuta samaan kisaan on lisätty.

| | RESUL-kisa | Mukautettu kisa |
|---|---|---|
| Lajit | RA1–RA4, ei lisättävissä | määrittelet itse |
| Kilpasarjat | sääntöjen mukaan | määrä, pituus ja nimi vapaasti |
| Tulossääntö | sääntöjen mukaan lajeittain | kilpasarjojen summa tai paras kilpasarja |
| Sarjat | H ja H50 sääntöjen mukaan | nimeät itse, ei tarvitse liittyä ikään |
| Tasatulos lajissa | virallinen tasatulossääntö | sama sääntö |
| Tasatulos kokonaiskilpailussa | parempi RA2:n tulos | jaettu sija, järjestys sukunimen mukaan |

### Kilpasarjat ovat sarjoja vain nimeltä

Mukautetun lajin kilpasarja voi olla ampuma-asento, kierros tai mikä tahansa erä. Anna
sille nimi, niin kirjaaja tietää mitä ampuu — nimi näkyy tuloskortissa, tuloslistassa ja
Excelissä. Kilpasarjat voivat olla **eri mittaisia**, joten kolmen asennon kisa jossa
pystyasennosta ammutaan vähemmän on aivan tavallinen tapaus.

Kolmen asennon kisa määritellään näin:

| Kilpasarja | Nimi | Laukauksia |
|---|---|---|
| 1. | Makuu | 10 |
| 2. | Polvi | 10 |
| 3. | Pysty | 10 |

…ja tulossäännöksi *kaikkien kilpasarjojen summa*. Kahden kierroksen kisassa
kilpasarjoja on kaksi ja tulossääntönä *paras kilpasarja*.

### Sarjat eli kilpailuluokat

Sarja on kilpailuluokka: *Yleinen*, *Veteraanit*, *Aloittelijat* — mitä kisa vaatii.
Sijoitukset voidaan laskea sarjan sisällä, joten **sarjajako ratkaisee kenet palkitaan.**

Sarjan poistaminen siirtää sen kilpailijat toiseen sarjaan eikä jätä ketään sarjattomaksi:
sarjaton kilpailija ei näkyisi missään sarjakohtaisessa tuloslistassa.

### Mikä ei muutu

Laskenta on sama. Napakymppi on 10 pistettä ja kirjautuu napalaskuriin, ohilaukaus ei ole
iskemä, sääntörike vähentää 2 pistettä ja turvallisuusrike mitätöi tuloksen. Myös
tasatulossääntö lajin sisällä on sama kuin RESUL-kisassa — se toimii millä tahansa
0–10-lajilla.

### Mitä säännöt eivät sano

Kokonaiskilpailun tasatuloksen ratkaisee RESUL-säännöissä parempi RA2:n tulos.
Mukautetussa kisassa ei ole RA2:ta eikä muuta sääntöjen nimeämää ratkaisijalajia, joten
tasatulos jää jaetuksi ja järjestys ratkeaa sukunimen mukaan.

Ratkaisijalajia ei arvata — esimerkiksi kisan ensimmäistä tai pisintä lajia — koska se
päättäisi sijoituksia perusteella, jota kilpailijoille ei ole kerrottu eikä
kilpailukutsussa mainittu. Jos kisassa tarvitaan tietty ratkaisijalaji, se on sovittava
etukäteen ja ratkaistava käsin.

### Excel-vienti

Toimii kuten RESUL-kisassa: jokainen laji saa oman tuloskorttinsa aitoine kaavoineen.
Välilehtien nimet tulevat lajin lyhenteestä, mutta Excelin sivunimi on enintään 31
merkkiä eikä siinä saa olla merkkejä `: \ / ? * [ ]`, joten nimi siistitään
automaattisesti. Samannimiset lajit erotetaan numerolla.

Tuonti ei etsi välilehteä nimen perusteella vaan tiedostoon kirjatun lajitunnisteen
mukaan, joten siistitty tai numeroitu nimi ei sekoita tuloksia.

---

## Tietosuoja ja tietojen säilyminen

Sovellus tallentaa tiedot **ainoastaan käyttämäsi laitteen selaimen localStorage-muistiin.**
Mitään ei lähetetä minnekään: ei taustapalvelinta, ei tilastointia, ei evästeitä
seurantaan. Tiedot eivät siirry laitteiden välillä.

⚠️ **Tämä tarkoittaa myös sen, että tiedot katoavat**, jos tyhjennät selaimen
sivustotiedot, käytät yksityistä selausikkunaa tai poistat sovelluksen. Selain voi
myös itse poistaa tietoja tilan säästämiseksi.

**Vie tulokset tiedostoon säännöllisesti kisan aikana.** Sovellus muistuttaa tästä
automaattisesti: jos vientiä ei ole tehty lainkaan tai siitä on yli 30 minuuttia, sivun
ylälaidassa näkyy huomautus.

### Varmuuskopiointi laitteen ulkopuolelle

Viety Excel-tiedosto on ainoa kopio tuloksista, ja jos se jää vain kirjaavan laitteen
muistiin, laitteen rikkoutuminen, katoaminen tai varastaminen vie tulokset mukanaan.
Jos haluat olla varma että tulokset ovat tallessa myös silloin, tee näin muutaman kerran
kisan aikana:

1. **Lataa tulokset Excel-tiedostona** *Vienti*-sivulta.
2. **Varmista että tiedosto on todella siirtynyt laitteen ulkopuolelle** — että puhelimen
   pilvivarmuuskopiointi (iCloud, Google Drive, OneDrive) on ehtinyt kopioida sen, tai
   lähetä tiedosto itsellesi sähköpostilla tai viestillä.
3. **Tarkista se toiselta laitteelta.** Vasta kun tiedosto aukeaa muualta kuin
   kirjaavasta puhelimesta, se on oikeasti varmuuskopio.

⚠️ Puhelimen *Lataukset*-kansiossa oleva tiedosto **ei ole varmuuskopio** — se katoaa
laitteen mukana. Pilvipalvelun synkronointi voi myös viivästyä tai olla pois päältä
ampumaradalla, jossa verkkoyhteys on heikko; siksi siirtyminen kannattaa tarkistaa
eikä olettaa. Jos verkkoa ei ole lainkaan, siirrä tiedosto toiselle laitteelle
AirDropilla tai Nearby Sharella — tai lähetä koko kisa QR-koodina, jolloin tulokset ovat
kahdella laitteella — ja lataa tiedosto pilveen heti kun verkko löytyy.

ℹ️ Huomaa että pilveen viety tiedosto sisältää kilpailijoiden nimet ja yhdistykset eli
henkilötietoja. Se on tietoinen poikkeus sovelluksen periaatteeseen, jonka mukaan tiedot
eivät poistu laitteelta: valitset tulosten säilymisen tietojen paikallisuuden sijaan.
Poista tiedosto pilvestä, kun tuloksia ei enää tarvita.

*The exported Excel file is the only copy of the results. If it never leaves the device
that recorded them, a broken, lost or stolen phone takes the results with it. If you want
to be certain the results are safe regardless, do this a few times during the competition:
**(1)** download the results as an Excel file from the Vienti (Export) page; **(2)** make
sure the file has actually left the device — that the phone's cloud backup (iCloud, Google
Drive, OneDrive) has had time to copy it, or send it to yourself by email or message;
**(3)** verify it from another device — a file is only really a backup once it opens
somewhere other than the recording phone. A file sitting in the phone's Downloads folder
is **not** a backup; it disappears with the device. Cloud sync may also be delayed or
switched off at a shooting range with poor connectivity, so check that it transferred
rather than assuming it did. With no network at all, move the file to another device via
AirDrop or Nearby Share — or send the whole competition as a QR code, which puts the
results on two devices — and upload the file to the cloud once you have a connection. Note
that a file uploaded to the cloud contains competitors' names and clubs, i.e. personal
data; this is a deliberate exception to the app's local-only principle — you are choosing
durability over locality. Delete the file from the cloud once the results are no longer
needed.*

### Jos tallennettua kisaa ei voi avata

Sovellus lukee laitteelle tallennetun kisan vain silloin, kun se tunnistaa tallennuksen
rakenteen. Jos rakenne on tuntematon, kisaa **ei avata eikä sitä kirjoiteta yli**:
sovellus aloittaa tyhjästä kisasta, ottaa vanhan tallennuksen talteen ja kertoo
tilanteesta sivun ylälaidassa.

Tavallisin syy on peruttu päivitys. Verkkosivusta on aina vain yksi julkaistu versio
kerrallaan, joten virheellisen version peruminen tarkoittaa edellisen version
julkaisemista uudelleen — ja silloin vanhempi sovellus kohtaa laitteella tallennuksen,
jonka uudempi versio on kirjoittanut.

Näin tilanteessa toimitaan:

1. **Älä kirjaa tuloksia tyhjään kisaan** — tulokset menisivät eri kisaan kuin aiemmat.
2. **Älä tyhjennä selaimen sivustotietoja.** Talteen otettu tallennus on laitteen
   muistissa, ja tyhjentäminen poistaisi senkin.
3. **Kerro asiasta järjestäjälle** ja kirjaa sillä välin toisella laitteella.

Kisa avautuu itsestään, kun laitteessa on taas vähintään yhtä uusi versio kuin se, jolla
tulokset kirjattiin. Yksittäinen käyttäjä ei voi valita versiota itse, joten korjaus
tehdään julkaisemalla oikea versio uudelleen.

ℹ️ Talteen otettu tallennus ei ole korvike tiedostovientiä — se on viimeinen turvaverkko
sitä tilannetta varten, että tulokset olisivat muuten hävinneet huomaamatta. Vie tulokset
Excel-tiedostoon niin kuin ennenkin.

### Kisan päättäminen ja tietojen poistaminen

Tiedot poistetaan **Kisatiedot**-sivun alaosasta. Vaihtoehtoja on kolme:

- **Tyhjennä tulokset** — poistaa kirjatut laukaukset, rangaistukset ja hylkäykset, mutta
  säilyttää kilpailijat ja lajivalinnat. Käytä tätä, kun sama lista ammutaan uudelleen:
  harjoituskierros, seuraava erä tai koeajo ennen kisan alkua.
- **Aloita uusi kisa** — poistaa kilpailijat ja tulokset, mutta säilyttää laitteen
  asetukset. Tämä on tavallinen valinta, kun sama laite jatkaa seuraavaan kisaan.
- **Poista kaikki tiedot tältä laitteelta** — poistaa lisäksi laitteen nimen ja
  tunnisteen. Käytä tätä, kun laite ei jää sinulle, esimerkiksi lainatussa puhelimessa.

Kaksi jälkimmäistä poistavat myös mahdolliset talteen otetut tallennukset (ks. *Jos
tallennettua kisaa ei voi avata* yllä), koska niissäkin on kilpailijoiden nimiä.

Kaikki vaativat erillisen vahvistuksen ja kertovat mitä ollaan poistamassa: tulosten
tyhjennys näyttää kirjattujen laukausten määrän. Sovellus kertoo ennen poistoa, onko
tuloksia viety tiedostoon. Poistoa ei voi peruuttaa, joten **vie tulokset ensin** — viety
Excel-tiedosto on tämän jälkeen ainoa kopio. Varmista ennen poistoa myös, että tiedosto
on siirtynyt laitteen ulkopuolelle (ks. *Varmuuskopiointi laitteen ulkopuolelle* yllä).

Kilpailijoiden nimet ja yhdistykset ovat henkilötietoja, joten niitä ei kannata jättää
laitteelle kisan jälkeen pidemmäksi aikaa kuin on tarpeen.

### Asentaminen laitteeseen

Sovellus kannattaa asentaa kotivalikkoon (*Lisää Koti-valikkoon* / *Asenna sovellus*):

- se toimii silloin **kokonaan ilman verkkoyhteyttä** — myös tulosten vienti Exceliin
- selain karsii tallennettuja tietoja epätodennäköisemmin kuin tavallisessa välilehdessä
- sovellus avautuu omana ikkunanaan ilman selaimen osoitepalkkia

**Androidilla asennus voi antaa Play Protect -varoituksen** — puhelin väittää sovellusta
vaaralliseksi tai kertoo puuttuvista turvaominaisuuksista. Valitse *Lisätiedot* →
*Asenna kuitenkin*. Varoitus on odotettu: selain rakentaa sovelluksesta laitekohtaisen
paketin, joka asennetaan Play-kaupan ulkopuolelta, ja Play Protect varoittaa jokaisesta
paketista jota se ei ennestään tunne. Varoituksen saisi pois vain julkaisemalla
sovelluksen Play-kaupassa, mikä toisi mukanaan toisen jakelukanavan ylläpidettäväksi.

### Päivittäminen — älä kesken kisan

Päivitykset eivät asennu itsestään: uudesta versiosta tulee ilmoitus, ja päivityksen
ajankohdan valitset itse. Kirjatut tulokset säilyvät päivityksessä.

⚠️ **Jos ilmoitus "Uusi versio saatavilla" ilmestyy kesken kilpailun, paina
"Myöhemmin".** Päivitä vasta kun kisa on ohi ja tulokset on viety tiedostoon.

Syy on yksinkertainen: uutta versiota ei ole koeteltu juuri sinun kisassasi, ja radalla
ei yleensä ole yhteyttä eikä aikaa selvittää yllätyksiä. Sovellus toimii moitteetta myös
päivittämättä, joten *Myöhemmin* ei maksa mitään. Ilmoitus tulee uudelleen seuraavalla
avauskerralla.

Sovellus etsii uutta versiota kerran tunnissa sekä aina, kun palaat sovellukseen
taustalta. Ilman verkkoyhteyttä se ei kysele mitään, joten radalla tarkistus ei kuluta
akkua eikä häiritse. Uuden version huomaaminen voi silti kestää hetken: jos haluat
päivittää heti, sulje sovellus kokonaan ja avaa se uudelleen.

Jos päivitys osoittautuu virheelliseksi, se perutaan keskitetysti julkaisemalla edellinen
versio uudelleen — yksittäinen käyttäjä ei voi palata vanhaan versioon itse, koska
verkkosivusta on aina vain yksi julkaistu versio kerrallaan. Peruminen palauttaa
sovelluksen, **mutta ei laitteelle jo kirjoitettuja tietoja**. Jos laitteella on tallennus
uudemmalta versiolta, sovellus jättää sen koskematta ja kertoo siitä — ks. *Jos
tallennettua kisaa ei voi avata* yllä.

**Kaikissa kisan laitteissa on syytä olla sama versio.** Tulosten yhdistäminen QR-koodilla
tarkistaa siirtomuodon version, ja eri versiot voivat kieltäytyä lukemasta toistensa
koodeja. Päivittäkää siis kaikki laitteet yhdessä — ennen kisaa, ei kesken sen.

> ⚠️ **Versio 1.3.0 vaatii päivityksen kaikkiin laitteisiin.** Mukautettu kisa muutti sekä
> tallennusmuotoa että QR-siirtomuotoa, joten 1.2-laite ja 1.3-laite **eivät** vaihda
> tuloksia keskenään: koodin lukeminen epäonnistuu selkeällä virheilmoituksella.
>
> Tämä koskee myös RESUL-kisaa, vaikka sen toiminta ei muutu. Päivitä siis kaikki kisan
> laitteet ennen kisapäivää, älä yhtä kerrallaan.
>
> Aiemmilla versioilla kirjatut kisat avautuvat päivityksen jälkeen normaalisti —
> päivityssuunta on turvallinen. Vain toiseen suuntaan (1.3-laitteen tallennus tai koodi
> 1.2-laitteeseen) ei ole yhteensopivuutta, ja silloin vanhempi sovellus kieltäytyy
> lukemasta eikä sekoita tuloksia.
>
> Excel-tiedostot ovat poikkeus: RESUL-kisan tiedosto avautuu myös 1.2-laitteessa.
> Mukautetun kisan tiedostosta se ei löydä tuloskortteja ja kertoo sen.

> **Jos asensit sovelluksen ennen osoitteen muuttumista pieniksi kirjaimiksi:** poista vanha
> kuvake kotivalikosta ja asenna sovellus uudelleen yllä olevasta osoitteesta. Vanha
> asennus jää muuten pyörittämään vanhaa versiota, koska se ei enää löydä päivityksiä.
> **Kirjatut tulokset säilyvät**: ne on sidottu verkkotunnukseen `samihanninen.github.io`,
> ei osoitteen polkuun, joten uusi asennus näkee samat tulokset.

---

## Tulosten vienti ja tuonti

Vienti tuottaa `.xlsx`-tiedoston, joka noudattaa alkuperäisen Excel-tuloskortin
välilehtirakennetta:

| Välilehti | Sisältö | Muokattavissa |
|---|---|---|
| `Tuloskortti <laji>` | Kilpailijat ja laukaukset | ✅ **Kyllä — aidot Excel-kaavat.** Kun korjaat laukauksen, sarjan summa, navat ja kilpailutulos laskeutuvat uudelleen kuten Excel-versiossa |
| `Kisatiedot` | Kisan perustiedot ja asetukset | ✅ Kyllä |
| `Sijoitukset <laji>` | Sijoitukset | ℹ️ Tilannekuva — päivittyy kun tiedosto tuodaan takaisin sovellukseen |
| `Yhdistys …` | Yhdistyskilpailu | ℹ️ Tilannekuva — kuten yllä |
| `_meta` | Versiotiedot ja lajien rakenne | Ei |

RESUL-kisassa lajin tilalla on `RA1`–`RA4`. Mukautetussa kisassa nimi tulee lajin
lyhenteestä, ja se siistitään Excelin sivunimirajoitusten mukaiseksi (enintään 31
merkkiä, ei merkkejä `: \ / ? * [ ]`).

Tuonti lukee **vain** `Tuloskortti`-välilehtien kilpailijat ja laukaukset ja laskee kaiken
muun uudelleen. Näin järjestäjän käsin tekemät korjaukset siirtyvät sovellukseen
sellaisenaan, eikä vanhentunut sijoitusvälilehti voi sotkea tuloksia. Oikea välilehti
tunnistetaan `_meta`:aan kirjatusta lajitunnisteesta, ei nimestä — nimi voi olla
siistiytynyt eikä siihen siksi voi luottaa.

**Näin virheen korjaaminen onnistuu myös jälkikäteen**, vaikka selaimen muisti olisi
tyhjentynyt: avaa viety tiedosto Excelissä, korjaa laukaus ja tuo tiedosto takaisin.

### Tulosten lähettäminen

- **Puhelimella** — *Jaa*-painike antaa tiedoston puhelimen jakovalikkoon, josta se
  lähtee sähköpostin liitteenä esimerkiksi Gmailissa tai Outlookissa.
- **Tietokoneella** — tiedosto ladataan ja sovellus voi avata valmiin sähköpostiluonnoksen.

> ℹ️ **Liitetiedostoa ei voi lisätä automaattisesti tietokoneella.** `mailto:`-linkit
> eivät tue liitteitä missään selaimessa, joten työpöydällä tiedosto pitää liittää
> sähköpostiin itse. Puhelimen jakovalikko sen sijaan hoitaa liitteen suoraan.

---

## Monta kirjaajaa samassa kisassa

Kun tuloksia kirjaa useampi henkilö samaan aikaan eri laitteilla, tulokset yhdistetään
lopuksi yhdelle laitteelle — ja sieltä yhteen Excel-tiedostoon.

### Näin se toimii

1. **Päälaite luo kisan** — kisatiedot ja kilpailijalista syötetään kertaalleen.
2. **Kilpailijalista jaetaan** kirjaajien laitteille (linkkinä, QR-koodina tai tiedostona).
3. **Jokaiselle kirjaajalle oma osuus** — esimerkiksi laji (RA1 yhdelle, RA2 toiselle) tai
   oma kojeryhmä. Kun osuudet eivät mene päällekkäin, yhdistäminen on ristiriidatonta.
4. **Kirjaajat syöttävät tulokset** omilla laitteillaan, myös ilman verkkoyhteyttä.
5. **Tulokset yhdistetään päälaitteelle** — päälaite lukee kirjaajien osatulokset ja
   yhdistää ne. Lopuksi vienti Exceliin sisältää kaikkien kirjaamat tulokset.

### Yhdistämistavat

| Tapa | Miten | Sopii |
|---|---|---|
| **Linkki** | Kirjaaja saa jakolinkin ja lähettää sen esim. WhatsAppilla; päälaite avaa linkin | Helpoin — ei kameraa eikä tiedostoja |
| **QR-koodi** | Kirjaaja näyttää koodin, päälaite lukee sen kameralla | **Toimii täysin ilman verkkoyhteyttä** — paras ampumaradalla |
| **Tiedosto** | Pieni tiedosto AirDropilla, Nearby Sharella tai sähköpostilla | Varmin, ei kokorajaa |

### Koko kisa vai vain tulokset?

Ero on siinä, **mitä vastaanottajalle tapahtuu**.

| | Koko kisa | Vain tulokset |
|---|---|---|
| Sisältö | Kilpailijat, asetukset ja tulokset | Pelkät laukaukset |
| Vastaanottajan tiedot | **Korvataan kokonaan** | **Säilyvät**, tulokset yhdistetään niihin |
| Käyttötarkoitus | Kisan antaminen seuraavalle kirjaajalle | Usean kirjaajan tulosten kokoaminen |

> ⚠️ **Aloita aina lähettämällä koko kisa.** Jokainen laite arpoo käynnistyessään oman
> kisatunnuksensa. Jos molemmille laitteille perustetaan kisa erikseen, ne ovat
> sovelluksen silmissä eri kisoja eivätkä pelkät tulokset osaa kohdistua oikeisiin
> kilpailijoihin. Kun koko kisa on kertaalleen lähetetty, molemmilla on sama kisa ja
> tulosten yhdistäminen toimii kumpaankin suuntaan.

**Vuorottelu** — kirjaaminen siirtyy laitteelta toiselle. Lähetä *koko kisa*, jolloin
vastaanottaja jatkaa siitä mihin jäit. Luovuttava laite kannattaa merkitä luovutetuksi:
sen syöttö lukittuu, jottei sama kisa jatku kahdella laitteella eri suuntiin.

**Rinnakkainen kirjaaminen** — useampi kirjaa yhtä aikaa. Lähetä ensin *koko kisa*
kaikille laitteille, ja sen jälkeen *vain tulokset* takaisin päälaitteelle. Kun
jokaisella on oma osuutensa (esimerkiksi eri laji), ristiriitoja ei synny lainkaan.

Jos kisat on jo vahingossa perustettu erikseen, tulokset voi silti yhdistää: sovellus
tarjoaa *Yhdistä silti* -vaihtoehdon, jolloin kilpailijat tunnistetaan nimen ja
yhdistyksen perusteella. Eri tavalla kirjoitetut nimet päätyvät silloin eri
kilpailijoiksi, joten tulos kannattaa tarkistaa.

### Ristiriidat

Yhdistäminen ei koskaan ylikirjoita tuloksia huomaamatta. Jos kaksi laitetta on
kirjannut saman kilpailijan saman sarjan eri tuloksin, sovellus näyttää ne rinnakkain
pistemäärineen ja kysyy kumpi jää voimaan — mitään ei korvata ennen vahvistusta.
Tyhjän päälle kirjoitetaan aina huomautuksetta, ja saman tuloksen yhdistäminen
uudelleen ei muuta mitään: saman koodin voi lukea kahdesti turvallisesti.

Tuomarin merkinnät (sääntörikkeet ja hylkäys) säilyvät ankarampana: niiden katoaminen
yhdistämisessä olisi pahempi virhe kuin se, että merkintä on molemmilla laitteilla.

### QR-koodien koko

Koodit pidetään tarkoituksella pieninä. QR:n suurin versio vetäisi noin 4300 merkkiä
yhteen koodiin, mutta se on 177×177 moduulia — puhelimen ruudulla moduuli on silloin pari
pikseliä, eikä toinen puhelin saa siitä tarkennusta. Siksi tiedot jaetaan noin tuhannen
merkin paloihin, jotka kamera lukee käytännössä heti.

Käytännössä koko kisa vie:

| Kilpailijoita | QR-koodeja (koko kisa) | QR-koodeja (vain tulokset) |
|---|---|---|
| 10 | 2 | 1 |
| 20 | 2 | 2 |
| 40 | 4 | 3 |

Osat voi lukea missä järjestyksessä tahansa, ja sovellus kertoo mitä vielä puuttuu.

Mukautetussa kisassa koko kisa vie hieman enemmän, koska lajien nimet ja kilpasarjojen
rakenne kulkevat mukana — RESUL-lajit ovat samat joka laitteessa eikä niitä tarvitse
lähettää. Ero on yksi koodi tai kaksi; pelkkien tulosten koko ei muutu.

> 🔒 **Tietosuojahuomio:** QR-koodi on ainoa tapa, jossa tiedot eivät poistu paikalta.
> Linkki ja tiedosto kulkevat sen sovelluksen kautta, jolla ne lähetät (esim. WhatsApp).
> Omaa palvelinta ei ole missään tavassa.

---

## Teknologiat

| Osa-alue | Valinta | Miksi |
|---|---|---|
| Käyttöliittymä | [Vue 3](https://vuejs.org/) + TypeScript | Selkeä komponenttijako näppäimistön ja taulukon välillä |
| Käännöstyökalu | [Vite](https://vite.dev/) | Nopea kehitys, `base`-polku GitHub Pagesille |
| Tila | [Pinia](https://pinia.vuejs.org/) + [pinia-plugin-persistedstate](https://prazdevs.github.io/pinia-plugin-persistedstate/) | localStorage-tallennus valmiina; luennan versiointi on omaa koodia (`src/core/skeema.ts`), koska tulosten säilyminen ei ole kirjaston päätettävissä |
| Reititys | [Vue Router](https://router.vuejs.org/) (hash-tila) | Toimii GitHub Pagesilla ilman uudelleenohjauskiertoteitä |
| Offline | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | Asennettava sovellus, toimii ilman verkkoa |
| Excel-tiedostot | [ExcelJS](https://github.com/exceljs/exceljs) | Ainoa selainkirjasto joka **kirjoittaa** monivälilehtisen tiedoston kaavoineen ja **lukee** sen takaisin |
| QR-koodit | [qrcode](https://github.com/soldair/node-qrcode) + [jsQR](https://github.com/cozmo/jsQR) | Koodien luonti ja luku; jsQR varalla iOS-Safarissa, josta puuttuu `BarcodeDetector` |
| Pakkaus | [pako](https://github.com/nodeca/pako) | Suurten osatulosten tiivistäminen QR-koodiin |
| Yksikkötestit | [Vitest](https://vitest.dev/) | Laskennan vastaavuus alkuperäiseen Exceliin |
| Selaintestit | [Playwright](https://playwright.dev/) | Ajaa myös WebKitiä, joten näppäimistö on testattavissa iPhone-näkymässä |
| Laatu | [ESLint](https://eslint.org/) (flat config) + [Prettier](https://prettier.io/) | — |
| Julkaisu | GitHub Actions → GitHub Pages | Julkaisu tapahtuu CI:ssä, ei kehityskoneelta |

ExcelJS on kokoluokkaa 900 kB, joten se ladataan vasta kun tuloksia viedään tai
tuodaan (`await import('exceljs')`). Sovelluksen käynnistyminen ei siitä hidastu.

### Laskennan vastaavuus

Kaikki pisteytyslogiikka on tiedostoissa `src/core/` puhtaana TypeScriptinä ilman
riippuvuutta käyttöliittymäkirjastoon. Testit vertaavat laskentaa alkuperäisen
Excel-tiedoston tunnettuihin arvoihin, joten tulokset vastaavat Excel-versiota.

---

## Kehitys

Vaatii Node.js:n (versio tiedostossa `.nvmrc`).

```bash
npm install         # asenna riippuvuudet
npm run dev         # kehityspalvelin
npm run test:unit   # yksikkötestit (laskennan vastaavuus)
npm run test:e2e    # selaintestit (Chromium + WebKit + iPhone-näkymä)
npm run lint        # tarkistus
npm run type-check  # TypeScript
npm run build       # tuotantoversio hakemistoon dist/
npm run preview     # esikatsele tuotantoversiota
npm run kuvakkeet   # luo sovelluskuvakkeet uudelleen
npm run kuosi       # luo taustakuosin uudelleen
```

Kuvitus piirretään ohjelmallisesti, ei tuoda valmiina tiedostoina:

- `scripts/luo-kuvakkeet.mjs` — sovelluskuvake on ampumataulu eli sisäkkäisiä renkaita,
  joten se syntyy pikseleittäin ilman kuvankäsittelykirjastoa.
- `scripts/luo-kuosi.mjs` — M05-tyylinen pikselikuosi taustalle. Kuvio lasketaan ympäri
  kiertyvästä kohinasta, joten se toistuu saumattomasti.

Näin kaikki kuvitus on toistettavissa ja omaa jälkeä, eikä projektiin tarvitse tuoda
tiedostoja, joiden alkuperää tai lisenssiä ei voi tarkistaa.

### Ulkoasu ja luettavuus

Värit on otettu M05-maastopuvun sävyistä, mutta taustakuosi pidetään hyvin haaleana
(vaaleassa teemassa 13 %). Tuloksia kirjataan ulkona kirkkaassa valossa, joten kontrasti
menee tyylin edelle: tummimmankin kuosilaikun päällä leipätekstin kontrasti on noin 11:1
eli selvästi yli WCAG AAA -rajan. Jos käyttöjärjestelmässä on valittu suurempi kontrasti
(`prefers-contrast: more`), taustakuviot piilotetaan kokonaan.

Julkaisu tapahtuu automaattisesti, kun muutokset viedään `main`-haaraan.

---

## Kiitokset / Credits

### 👤 Sovelluksen tekijä

Tämän selainsovelluksen on suunnitellut ja toteuttanut **Sami Hänninen**
([@samihanninen](https://github.com/samihanninen)), Nummi-Pusulan Reserviläiset ry.
Sama tekijä on laatinut myös alkuperäisen Excel-tuloskortin, johon laskenta perustuu.

*This browser application was designed and built by **Sami Hänninen**, who also authored
the original Excel scorecard the calculations are based on.*

### 💡 sra-koe — Matti Pöllä

Idea toteuttaa tuloslaskenta paikallisesti toimivana selainsovelluksena GitHub
Pagesissa tuli **Matti Pöllän** ([@mpolla](https://github.com/mpolla)) projektista
[**sra-koe**](https://github.com/mpolla/sra-koe) — SRA-ampumakokeen pisteytyssovellus,
joka osoitti että tämä lähestymistapa toimii: ei palvelinta, tiedot vain omalla
laitteella, ja silti käyttökelpoinen ampumaradan olosuhteissa. Kiitos ideasta ja
esimerkistä! 🙏

**Huom:** sra-koe-projektissa ei ole lisenssitiedostoa, joten siihen pätevät
tekijänoikeuden oletusehdot (kaikki oikeudet pidätetään). Tähän projektiin **ei ole
kopioitu koodia** sra-koe-projektista. Kiitos koskee ideaa ja lähestymistapaa —
toteutus on kirjoitettu itsenäisesti.

---

The idea of building the scoring as a local-first browser app hosted on GitHub Pages
came from **Matti Pöllä**'s ([@mpolla](https://github.com/mpolla))
[**sra-koe**](https://github.com/mpolla/sra-koe) — a scoring app for the SRA shooting
test, which demonstrated that the approach works: no server, data stays on the
device, and still usable in real range conditions. Thank you for the idea and the
example! 🙏

**Note:** sra-koe has no license file and is therefore all-rights-reserved by
default. **No code has been copied** from it into this project. The credit is for the
idea and approach — the implementation here was written independently.

### 📋 Alkuperäinen Excel-tuloskortti

Sovellus perustuu Nummi-Pusulan Reserviläiset ry:n Excel-tuloskorttiin.
Tekijä: Sami Hänninen.

---

## Lisenssi

[![CC BY-SA 4.0](https://img.shields.io/badge/Lisenssi-CC%20BY--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-sa/4.0/deed.fi)

Creative Commons **Nimeä-JaaSamoin 4.0 Kansainvälinen** (CC BY-SA 4.0) — sama lisenssi
kuin alkuperäisessä Excel-tuloskortissa, jonka pohjalta tämä on tehty.

**Saat vapaasti:**
- ✔ **Jakaa** — kopioida ja levittää sovellusta missä tahansa välineessä tai muodossa
- ✔ **Muokata** — muuntaa, muokata ja rakentaa tämän pohjalle mihin tahansa tarkoitukseen

**Ehdoilla:**
- ▶ **Nimeä tekijä** — mainitse Sami Hänninen / Nummi-Pusulan Reserviläiset ry alkuperäisenä tekijänä
- ▶ **JaaSamoin** — jos muokkaat tai jaat tätä, käytä samaa CC BY-SA 4.0 -lisenssiä

Lisenssin täydet ehdot suomeksi: https://creativecommons.org/licenses/by-sa/4.0/deed.fi

© Sami Hänninen / Nummi-Pusulan Reserviläiset ry

---

## Palaute

Palaute ja parannusideat: [GitHub Issues](https://github.com/samihanninen/osumaonni/issues)
