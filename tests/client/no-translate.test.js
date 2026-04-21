import { describe, expect, it, vi } from 'vitest'
import { createPageTranslator } from '../../src/core/client.js'

describe('createPageTranslator built-in no-translate zones (browser)', () => {
  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' }
  ]

  it('does not send text inside translate="no" or .notranslate, and still translates siblings', async () => {
    const root = document.createElement('div')

    root.innerHTML = `
      <p><span translate="no">Alpha secret</span></p>
      <p><span class="notranslate">Beta secret</span></p>
      <p>Gamma public</p>
      <p>Delta public</p>
    `

    const received = []

    const transport = vi.fn(async texts => {
      received.push(...texts)

      return texts.map(text => `(${text})`)
    })

    const translator = createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en'
    })

    await translator.setLanguage('es')

    expect(received).toEqual(['Gamma public', 'Delta public'])
    expect(received.some(text => text.includes('Alpha'))).toBe(false)
    expect(received.some(text => text.includes('Beta'))).toBe(false)

    expect(root.textContent).toContain('Alpha secret')
    expect(root.textContent).toContain('Beta secret')
    expect(root.textContent).toContain('(Gamma public)')
    expect(root.textContent).toContain('(Delta public)')

    translator.destroy()
  })

  it('does not translate placeholder or submit value inside translate="no"', async () => {
    const root = document.createElement('div')

    root.innerHTML = `
      <div translate="no">
        <input type="text" placeholder="Keep placeholder" />
        <input type="submit" value="Keep value" />
      </div>
      <p>Outside line</p>
    `

    const received = []

    const transport = vi.fn(async texts => {
      received.push(...texts)

      return texts.map(text => `(${text})`)
    })

    const translator = createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en'
    })

    await translator.setLanguage('es')

    const placeholder = root.querySelector('input[type="text"]')
    const submit = root.querySelector('input[type="submit"]')

    expect(received).toEqual(['Outside line'])
    expect(placeholder.getAttribute('placeholder')).toBe('Keep placeholder')
    expect(submit.getAttribute('value')).toBe('Keep value')
    expect(root.textContent).toContain('(Outside line)')

    translator.destroy()
  })
})
