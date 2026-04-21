import { describe, expect, it, vi } from 'vitest'
import { createPageTranslator } from '../../src/core/client.js'

describe('createPageTranslator translation markup (browser)', () => {
  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' }
  ]

  function createTransport() {
    return vi.fn(async texts => texts.map(text => `(${text})`))
  }

  it('sets machine-translation lang markup and restores the original lang on source reset', async () => {
    const root = document.createElement('div')
    const transport = createTransport()

    root.setAttribute('lang', 'en')
    root.innerHTML = '<p>Hello</p>'

    const translator = createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en'
    })

    await translator.setLanguage('es')

    expect(root.getAttribute('lang')).toBe('es-x-mtfrom-en')

    await translator.setLanguage('en')

    expect(root.getAttribute('lang')).toBe('en')

    translator.destroy()
  })

  it('removes temporary lang markup when the root had no original lang attribute', async () => {
    const root = document.createElement('div')
    const transport = createTransport()

    root.innerHTML = '<p>Hello</p>'

    const translator = createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en'
    })

    await translator.setLanguage('es')

    expect(root.getAttribute('lang')).toBe('es-x-mtfrom-en')

    translator.restoreOriginals()

    expect(root.hasAttribute('lang')).toBe(false)

    translator.destroy()
  })

  it('does not add lang markup when markTranslations is disabled', async () => {
    const root = document.createElement('div')
    const transport = createTransport()

    root.innerHTML = '<p>Hello</p>'

    const translator = createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en',
      markTranslations: false
    })

    await translator.setLanguage('es')

    expect(root.hasAttribute('lang')).toBe(false)

    translator.destroy()
  })
})
