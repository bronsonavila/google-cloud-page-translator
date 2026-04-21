import { describe, expect, it, vi } from 'vitest'
import { createPageTranslator } from '../../src/core/client.js'

describe('createPageTranslator whitespace preservation (browser)', () => {
  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' }
  ]

  function createWhitespaceStrippingTransport() {
    return vi.fn(async texts => texts.map(text => text.trim().toUpperCase()))
  }

  function createTranslator(root, transport) {
    return createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en'
    })
  }

  it('preserves spaces around bold text split into separate text nodes', async () => {
    const root = document.createElement('div')
    const transport = createWhitespaceStrippingTransport()

    root.innerHTML = '<p>Try <strong>Japanese</strong> or <strong>Spanish</strong> next</p>'

    const translator = createTranslator(root, transport)

    await translator.setLanguage('es')

    expect(root.textContent).toBe('TRY JAPANESE OR SPANISH NEXT')

    translator.destroy()
  })

  it('preserves spaces around links split into separate text nodes', async () => {
    const root = document.createElement('div')
    const transport = createWhitespaceStrippingTransport()

    root.innerHTML = '<p>Read the <a href="#">docs</a> for details</p>'

    const translator = createTranslator(root, transport)

    await translator.setLanguage('es')

    expect(root.textContent).toBe('READ THE DOCS FOR DETAILS')

    translator.destroy()
  })

  it('preserves gaps across mixed inline elements and punctuation', async () => {
    const root = document.createElement('div')
    const transport = createWhitespaceStrippingTransport()

    root.innerHTML = '<p>Use <strong>bold</strong>, <em>italic</em>, and <a href="#">links</a> together</p>'

    const translator = createTranslator(root, transport)

    await translator.setLanguage('es')

    expect(root.textContent).toBe('USE BOLD, ITALIC, AND LINKS TOGETHER')

    translator.destroy()
  })

  it('does not inject extra spaces when the original text node has none', async () => {
    const root = document.createElement('div')
    const transport = createWhitespaceStrippingTransport()

    root.innerHTML = '<p>Hello</p>'

    const translator = createTranslator(root, transport)

    await translator.setLanguage('es')

    expect(root.textContent).toBe('HELLO')

    translator.destroy()
  })

  it('keeps the same output when translating the same inline content twice', async () => {
    const root = document.createElement('div')
    const transport = createWhitespaceStrippingTransport()

    root.innerHTML = '<p>Try <strong>Japanese</strong> or <a href="#">Spanish</a> next</p>'

    const translator = createTranslator(root, transport)

    await translator.setLanguage('es')

    const firstPass = root.innerHTML

    await translator.setLanguage('es')

    expect(root.innerHTML).toBe(firstPass)
    expect(root.textContent).toBe('TRY JAPANESE OR SPANISH NEXT')

    translator.destroy()
  })
})
