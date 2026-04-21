import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/components/page-translator.js'

const endpoint = import.meta.env.VITE_TRANSLATE_ENDPOINT

const describeIntegration = endpoint ? describe : describe.skip

describe('PageTranslatorElement listener wiring (browser)', () => {
  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' }
  ]

  beforeEach(() => {
    localStorage.clear()
  })

  it('sends one POST per select change after several in-place property updates on a connected element', async () => {
    const mockPath = '/__page_translator_listener_test__'
    const mockEndpoint = `${window.location.origin}${mockPath}`

    const originalFetch = globalThis.fetch.bind(globalThis)

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.url

      if (url !== mockEndpoint) return originalFetch(input, init)

      const parsed = JSON.parse(String(init?.body || '{}'))
      const texts = Array.isArray(parsed.texts) ? parsed.texts : []

      return Response.json({
        translatedTexts: texts.map(text => `(${text})`)
      })
    })

    const content = document.createElement('div')

    content.innerHTML = '<p>Hello</p>'

    document.body.appendChild(content)

    const element = document.createElement('page-translator')

    document.body.appendChild(element)

    try {
      element.endpoint = mockEndpoint
      element.languages = languages
      element.sourceLanguage = 'en'
      element.root = content

      const select = element.shadowRoot?.querySelector('select')

      expect(select).toBeTruthy()

      select.value = 'es'
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }))

      await vi.waitFor(
        () => {
          expect(content.textContent).toContain('(Hello)')
        },
        { timeout: 5000, interval: 50 }
      )

      const postToMock = fetchSpy.mock.calls.filter(call => {
        const url = typeof call[0] === 'string' ? call[0] : call[0].url

        const method = (call[1]?.method ?? (call[0] instanceof Request ? call[0].method : 'GET')).toUpperCase()

        return url === mockEndpoint && method === 'POST'
      })

      expect(postToMock.length).toBe(1)
    } finally {
      fetchSpy.mockRestore()
      element.remove()
      content.remove()
    }
  })

  it('defaults translateHTML to true and forwards html format for rich text', async () => {
    const mockPath = '/__page_translator_html_default_test__'
    const mockEndpoint = `${window.location.origin}${mockPath}`
    const requestBodies = []

    const originalFetch = globalThis.fetch.bind(globalThis)

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.url

      if (url !== mockEndpoint) return originalFetch(input, init)

      const parsed = JSON.parse(String(init?.body || '{}'))
      const texts = Array.isArray(parsed.texts) ? parsed.texts : []

      requestBodies.push(parsed)

      return Response.json({
        translatedTexts:
          parsed.format === 'html'
            ? texts.map(text => `<span data-rich-translation="yes">${text}</span>`)
            : texts.map(text => `(${text})`)
      })
    })

    const content = document.createElement('div')

    content.innerHTML = '<p data-rich>Try <strong>Japanese</strong> next</p>'

    document.body.appendChild(content)

    const element = document.createElement('page-translator')

    document.body.appendChild(element)

    try {
      element.endpoint = mockEndpoint
      element.languages = languages
      element.sourceLanguage = 'en'
      element.root = content

      const select = element.shadowRoot?.querySelector('select')

      expect(select).toBeTruthy()

      select.value = 'es'
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }))

      await vi.waitFor(
        () => {
          expect(content.querySelector('[data-rich]')?.innerHTML).toContain('data-rich-translation="yes"')
        },
        { timeout: 5000, interval: 50 }
      )

      expect(requestBodies).toEqual([
        {
          texts: ['Try <strong>Japanese</strong> next'],
          targetLanguage: 'es',
          format: 'html'
        }
      ])
    } finally {
      fetchSpy.mockRestore()
      element.remove()
      content.remove()
    }
  })
})

describeIntegration('PageTranslatorElement against Cloud Run (integration, browser)', () => {
  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' }
  ]

  beforeEach(() => {
    localStorage.clear()
  })

  it('renders shadow DOM with a select and language options', () => {
    const element = document.createElement('page-translator')

    element.endpoint = endpoint
    element.languages = languages

    document.body.appendChild(element)

    try {
      const select = element.shadowRoot?.querySelector('select')

      expect(select).toBeTruthy()

      const options = Array.from(select.querySelectorAll('option'))

      expect(options.map(option => option.value)).toEqual(['en', 'es'])
    } finally {
      element.remove()
    }
  })

  it('changes root text when the user selects another language', async () => {
    const content = document.createElement('div')

    content.innerHTML = '<p>Good morning</p>'

    document.body.appendChild(content)

    const element = document.createElement('page-translator')

    element.endpoint = endpoint
    element.languages = languages
    element.root = content

    document.body.appendChild(element)

    try {
      const select = element.shadowRoot?.querySelector('select')

      select.value = 'es'
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }))

      await vi.waitFor(
        () => {
          expect(content.textContent).not.toBe('Good morning')
        },
        { timeout: 30_000, interval: 100 }
      )
    } finally {
      element.remove()
      content.remove()
    }
  })

  it('toggles attribution visibility when language differs from source', async () => {
    const content = document.createElement('div')

    content.innerHTML = '<p>Hello</p>'

    document.body.appendChild(content)

    const element = document.createElement('page-translator')

    element.endpoint = endpoint
    element.languages = languages
    element.root = content
    element.sourceLanguage = 'en'

    document.body.appendChild(element)

    try {
      const select = element.shadowRoot?.querySelector('select')
      const attribution = element.shadowRoot?.querySelector('[data-attribution]')

      select.value = 'es'
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }))

      await vi.waitFor(
        () => {
          expect(attribution?.hasAttribute('data-visible')).toBe(true)
        },
        { timeout: 30_000, interval: 100 }
      )

      select.value = 'en'
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }))

      await vi.waitFor(
        () => {
          expect(attribution?.hasAttribute('data-visible')).toBe(false)
        },
        { timeout: 30_000, interval: 100 }
      )
    } finally {
      element.remove()
      content.remove()
    }
  })

  it('can be removed from the document after translation without throwing', async () => {
    const content = document.createElement('div')

    content.innerHTML = '<p>Alpha marker</p>'

    document.body.appendChild(content)

    const element = document.createElement('page-translator')

    element.endpoint = endpoint
    element.languages = languages
    element.root = content

    document.body.appendChild(element)

    try {
      const select = element.shadowRoot?.querySelector('select')

      select.value = 'es'
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }))

      await vi.waitFor(
        () => {
          expect(content.textContent).not.toBe('Alpha marker')
        },
        { timeout: 30_000, interval: 100 }
      )

      expect(() => element.remove()).not.toThrow()
    } finally {
      content.remove()
    }
  })
})
