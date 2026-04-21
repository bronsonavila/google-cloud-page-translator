import { describe, expect, it, vi } from 'vitest'
import { createPageTranslator } from '../../src/core/client.js'

describe('createPageTranslator HTML translation (browser)', () => {
  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' }
  ]

  function createTransport(received) {
    return vi.fn(async (texts, _targetLanguage, options) => {
      const format = options?.format || 'text'

      received.push({
        format,
        texts: [...texts]
      })

      if (format === 'html') {
        return texts.map(text => `<span data-rich-translation="yes">${text}</span>`)
      }

      return texts.map(text => `(${text})`)
    })
  }

  it('sends rich text blocks as HTML and leaves plain strings on the text path', async () => {
    const root = document.createElement('div')
    const received = []
    const transport = createTransport(received)

    root.innerHTML = `
      <p data-rich>Try <strong>Tagalog</strong> or <a href="#">Spanish</a> next</p>
      <p data-plain>Plain line</p>
      <input type="text" placeholder="Type name" />
      <input type="submit" value="Submit order" />
    `

    const translator = createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en',
      translateHTML: true
    })

    await translator.setLanguage('es')

    expect(received).toEqual([
      {
        format: 'text',
        texts: ['Plain line', 'Type name', 'Submit order']
      },
      {
        format: 'html',
        texts: ['Try <strong>Tagalog</strong> or <a href="#">Spanish</a> next']
      }
    ])

    expect(received.flatMap(call => call.texts)).not.toContain('Try ')
    expect(received.flatMap(call => call.texts)).not.toContain('Spanish')

    expect(root.querySelector('[data-rich]').innerHTML).toBe(
      '<span data-rich-translation="yes">Try <strong>Tagalog</strong> or <a href="#">Spanish</a> next</span>'
    )
    expect(root.querySelector('[data-plain]').textContent).toBe('(Plain line)')
    expect(root.querySelector('input[type="text"]').getAttribute('placeholder')).toBe('(Type name)')
    expect(root.querySelector('input[type="submit"]').getAttribute('value')).toBe('(Submit order)')

    translator.restoreOriginals()

    expect(root.querySelector('[data-rich]').innerHTML).toBe(
      'Try <strong>Tagalog</strong> or <a href="#">Spanish</a> next'
    )
    expect(root.querySelector('[data-plain]').textContent).toBe('Plain line')
    expect(root.querySelector('input[type="text"]').getAttribute('placeholder')).toBe('Type name')
    expect(root.querySelector('input[type="submit"]').getAttribute('value')).toBe('Submit order')

    translator.destroy()
  })

  it('excludes no-translate subtrees from rich text collection', async () => {
    const root = document.createElement('div')
    const received = []
    const transport = createTransport(received)

    root.innerHTML = `
      <div translate="no">
        <p>Keep <strong>this</strong> line</p>
      </div>
      <p class="notranslate">Also <strong>keep</strong> this line</p>
      <p data-rich>Translate <strong>this</strong> line</p>
    `

    const translator = createPageTranslator({
      root,
      transport,
      storage: null,
      observeMutations: false,
      languages,
      sourceLanguage: 'en',
      translateHTML: true
    })

    await translator.setLanguage('es')

    const htmlCalls = received.filter(call => call.format === 'html').flatMap(call => call.texts)

    expect(htmlCalls).toEqual(['Translate <strong>this</strong> line'])
    expect(root.textContent).toContain('Keep this line')
    expect(root.textContent).toContain('Also keep this line')
    expect(root.querySelector('[data-rich]').innerHTML).toContain('data-rich-translation="yes"')

    translator.destroy()
  })
})
