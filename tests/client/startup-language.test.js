import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageTranslator } from '../../src/core/client.js'

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

describe('createPageTranslator saved-language startup (browser)', () => {
  const languages = [
    { value: 'en', label: 'English' },
    { value: 'ja', label: 'Japanese' },
    { value: 'es', label: 'Spanish' }
  ]

  beforeEach(() => {
    localStorage.clear()
  })

  it('waits for DOM quiet before auto-applying saved language so switching back to source restores English', async () => {
    const storage = memoryStorage()
    const debounceMs = 40
    const cacheVersion = 90210

    storage.setItem('preferredLanguage', 'ja')

    storage.setItem(
      `translations_ja`,
      JSON.stringify({
        version: cacheVersion,
        createdAt: Date.now(),
        map: { 'text:Hello': 'JA-HELLO' }
      })
    )

    const root = document.createElement('div')

    root.innerHTML = '<p>Hello</p>'

    document.body.appendChild(root)

    const transport = vi.fn(async texts => texts.map(() => 'SHOULD-NOT-NEED'))

    try {
      const translator = createPageTranslator({
        root,
        transport,
        storage,
        languages,
        sourceLanguage: 'en',
        observeMutations: true,
        observerDebounceMs: debounceMs,
        storagePrefix: 'translations_',
        preferenceKey: 'preferredLanguage',
        cacheVersion
      })

      await new Promise(resolve => {
        queueMicrotask(resolve)
      })

      root.appendChild(document.createElement('span'))

      await vi.waitFor(
        () => {
          expect(root.textContent).toContain('JA-HELLO')
        },
        { timeout: 5000, interval: 20 }
      )

      expect(transport).not.toHaveBeenCalled()

      await translator.setLanguage('en')

      expect(root.querySelector('p')?.textContent).toBe('Hello')

      translator.destroy()
    } finally {
      root.remove()
    }
  })

  it('after deferred saved Japanese, switching to another non-source language still translates', async () => {
    const storage = memoryStorage()
    const debounceMs = 40
    const cacheVersion = 90211

    storage.setItem('preferredLanguage', 'ja')

    storage.setItem(
      `translations_ja`,
      JSON.stringify({
        version: cacheVersion,
        createdAt: Date.now(),
        map: { 'text:Hello': 'JA-HELLO' }
      })
    )

    const root = document.createElement('div')

    root.innerHTML = '<p>Hello</p>'

    document.body.appendChild(root)

    const transport = vi.fn(async (texts, targetLanguage) => {
      if (targetLanguage === 'es') {
        return texts.map(text => `ES:${text}`)
      }

      return texts.map(() => 'OTHER')
    })

    try {
      const translator = createPageTranslator({
        root,
        transport,
        storage,
        languages,
        sourceLanguage: 'en',
        observeMutations: true,
        observerDebounceMs: debounceMs,
        storagePrefix: 'translations_',
        preferenceKey: 'preferredLanguage',
        cacheVersion
      })

      await vi.waitFor(
        () => {
          expect(root.textContent).toContain('JA-HELLO')
        },
        { timeout: 5000, interval: 20 }
      )

      await translator.setLanguage('es')

      await vi.waitFor(
        () => {
          expect(root.querySelector('p')?.textContent).toContain('ES:')
        },
        { timeout: 5000, interval: 20 }
      )

      expect(transport).toHaveBeenCalled()

      translator.destroy()
    } finally {
      root.remove()
    }
  })
})
