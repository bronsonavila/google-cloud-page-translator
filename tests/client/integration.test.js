import { describe, expect, it } from 'vitest'
import { createPageTranslator } from '../../src/core/client.js'

const endpoint = import.meta.env.VITE_TRANSLATE_ENDPOINT

const describeIntegration = endpoint ? describe : describe.skip

function memoryStorage() {
  const map = new Map()

  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    removeItem(key) {
      map.delete(key)
    }
  }
}

describeIntegration('createPageTranslator against Cloud Run (integration)', () => {
  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' }
  ]

  it('translates DOM text via the live endpoint and restores originals', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>Good morning</p>'

    let transportCalls = 0

    const transport = async (texts, targetLanguage) => {
      transportCalls++

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, targetLanguage, format: 'text' })
      })

      if (!response.ok) {
        throw new Error(`Translation request failed: ${response.status}`)
      }

      const data = await response.json()

      return data.translatedTexts
    }

    const translator = createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en'
    })

    await translator.setLanguage('es')

    expect(transportCalls).toBeGreaterThan(0)
    expect(root.textContent).not.toBe('Good morning')
    expect(translator.getLanguage()).toBe('es')

    translator.restoreOriginals()

    expect(root.textContent).toBe('Good morning')
    expect(translator.getLanguage()).toBe('en')

    translator.destroy()
  })

  it('does not call transport again for the same strings when cache is warm', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>Cache line</p>'

    const storage = memoryStorage()
    let transportCalls = 0

    const transport = async (texts, targetLanguage) => {
      transportCalls++

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, targetLanguage, format: 'text' })
      })

      if (!response.ok) {
        throw new Error(`Translation request failed: ${response.status}`)
      }

      const data = await response.json()

      return data.translatedTexts
    }

    const translator = createPageTranslator({
      root,
      transport,
      storage,
      observeMutations: false,
      languages,
      sourceLanguage: 'en',
      cacheVersion: 91
    })

    await translator.setLanguage('es')

    const callsAfterFirstSpanish = transportCalls

    await translator.setLanguage('en')
    await translator.setLanguage('es')

    expect(transportCalls).toBe(callsAfterFirstSpanish)

    translator.destroy()
  })
})
