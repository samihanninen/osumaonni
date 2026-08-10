import { describe, it, expect } from 'vitest'
import { VERSIO } from '../versio'
import paketti from '../../../package.json' with { type: 'json' }

/*
 * Versionumero korvataan käännösaikana. Jos `define` hajoaa tai nimi kirjoitetaan
 * väärin, sovellus ei kaadu — se näyttäisi vain tyhjää tai kirjaimellisesti
 * `__SOVELLUS_VERSIO__` alalaidassaan. Vika huomattaisiin siis vasta radalla, siinä
 * tilanteessa jota varten numero ylipäätään on. Näiden testien on tarkoitus paljastaa
 * se rakennusvaiheessa.
 */
describe('sovelluksen versio', () => {
  it('on korvattu käännösaikana, ei jäänyt paikanvaraajaksi', () => {
    expect(VERSIO).not.toBe('')
    expect(VERSIO).not.toContain('SOVELLUS_VERSIO')
  })

  it('vastaa package.jsonin versiota', () => {
    expect(VERSIO).toBe(paketti.version)
  })

  it('on muodoltaan versionumero', () => {
    expect(VERSIO).toMatch(/^\d+\.\d+\.\d+/)
  })
})
