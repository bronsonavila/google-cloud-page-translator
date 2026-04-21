import { createPageTranslator } from '../core/client.js'

const DEFAULT_ATTRIBUTION_HREF = 'https://translate.google.com'
const DEFAULT_ATTRIBUTION_TEXT = 'Translated by Google'
const DEFAULT_LABEL = 'Language:'

function asString(value) {
  return typeof value === 'string' ? value : ''
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseLanguages(value) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)

      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  return null
}

/**
 * Drop-in `<page-translator>` UI: shadow DOM language selector wired to {@link createPageTranslator}.
 *
 * Attributes: `endpoint` (POST URL), `languages` (JSON array of `{ value, label }`), optional `label`, optional `source-language`, optional `translate-html`.
 * Properties: `endpoint`, `languages`, `root` (translation root, default `document.body`), `sourceLanguage`, `translateHTML`.
 */
export class PageTranslatorElement extends HTMLElement {
  static get observedAttributes() {
    return ['endpoint', 'label', 'languages', 'source-language', 'translate-html']
  }

  #translator = null
  #root = null
  #endpoint = ''
  #languages = null
  #label = DEFAULT_LABEL
  #sourceLanguage = null
  #translateHTML = false
  #selectChangeAbort = null

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.#root = this.#root || document.body
    this.#endpoint = this.#endpoint || asString(this.getAttribute('endpoint'))
    this.#languages = this.#languages || parseLanguages(this.getAttribute('languages')) || []
    this.#label = this.#label || asString(this.getAttribute('label')) || DEFAULT_LABEL

    if (this.#sourceLanguage == null) {
      this.#sourceLanguage = asString(this.getAttribute('source-language')) || 'en'
    }

    this.#translateHTML = this.#translateHTML || this.hasAttribute('translate-html')

    this.#render()
    this.#ensureTranslator()
  }

  disconnectedCallback() {
    this.#selectChangeAbort?.abort()
    this.#selectChangeAbort = null

    this.#translator?.destroy()
    this.#translator = null
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return

    if (name === 'endpoint') {
      this.#endpoint = asString(newValue)

      this.#restartTranslator()

      return
    }

    if (name === 'label') {
      this.#label = asString(newValue) || DEFAULT_LABEL

      this.#render()

      return
    }

    if (name === 'languages') {
      this.#languages = parseLanguages(newValue) || []

      this.#render()
      this.#restartTranslator()

      return
    }

    if (name === 'source-language') {
      this.#sourceLanguage = asString(newValue) || 'en'

      this.#restartTranslator()

      return
    }

    if (name === 'translate-html') {
      this.#translateHTML = newValue !== null

      this.#restartTranslator()
    }
  }

  get endpoint() {
    return this.#endpoint
  }

  set endpoint(value) {
    this.setAttribute('endpoint', value)
  }

  get languages() {
    return this.#languages
  }

  set languages(value) {
    this.#languages = parseLanguages(value) || []

    this.setAttribute('languages', JSON.stringify(this.#languages))
  }

  get root() {
    return this.#root
  }

  set root(value) {
    this.#root = value || document.body

    this.#restartTranslator()
  }

  get sourceLanguage() {
    return this.#sourceLanguage ?? (asString(this.getAttribute('source-language')) || 'en')
  }

  set sourceLanguage(value) {
    const next = asString(value) || 'en'

    this.#sourceLanguage = next

    this.setAttribute('source-language', next)
  }

  get translateHTML() {
    return this.#translateHTML
  }

  set translateHTML(value) {
    this.#translateHTML = Boolean(value)

    this.toggleAttribute('translate-html', this.#translateHTML)
  }

  #restartTranslator() {
    this.#translator?.destroy()
    this.#translator = null

    // Rebuild only when attached so property updates are safe before connection.
    if (this.isConnected) this.#ensureTranslator()
  }

  #setAttributionVisible(visible) {
    const attribution = this.shadowRoot?.querySelector('[data-attribution]')

    if (!attribution) return

    attribution.toggleAttribute('data-visible', visible)
  }

  #getSelect() {
    return this.shadowRoot?.querySelector('select')
  }

  #ensureTranslator() {
    if (this.#translator) return
    if (!this.#endpoint) return

    // Default transport contract expected by createPageTranslator.
    const transport = async (texts, targetLanguage, options) => {
      const response = await fetch(this.#endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, targetLanguage, format: options?.format || 'text' })
      })

      if (!response.ok) {
        throw new Error(`Translation request failed: ${response.status}`)
      }

      const data = await response.json()

      return data.translatedTexts
    }

    this.#translator = createPageTranslator({
      root: this.#root,
      transport,
      languages: this.#languages,
      sourceLanguage: this.sourceLanguage,
      translateHTML: this.#translateHTML
    })

    const select = this.#getSelect()

    if (select) {
      this.#selectChangeAbort?.abort()
      this.#selectChangeAbort = new AbortController()
      const { signal } = this.#selectChangeAbort

      select.value = this.#translator.getLanguage()

      this.#setAttributionVisible(select.value !== this.sourceLanguage)

      select.addEventListener(
        'change',
        async event => {
          const language = event.target.value

          // Awaiting here keeps attribution visibility in sync with the applied language.
          await this.#translator?.setLanguage(language)

          this.#setAttributionVisible(language !== this.sourceLanguage)
        },
        { signal }
      )
    }
  }

  #render() {
    if (!this.shadowRoot) return

    const options = (this.#languages || [])
      .map(lang => {
        const value = asString(lang?.value)
        const label = asString(lang?.label) || value

        return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
      })
      .join('')

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-family: var(--pt-label-font, system-ui, sans-serif);
          font-size: var(--pt-label-size, 1rem);
          color: var(--pt-label-color, currentColor);
        }

        label {
          color: var(--pt-label-color, currentColor);
        }

        select {
          font: inherit;
          color: var(--pt-select-color, currentColor);
          border: var(--pt-select-border, 1px solid currentColor);
          background: var(--pt-select-bg, transparent);
          border-radius: var(--pt-select-radius, 4px);
          padding: var(--pt-select-padding, 0.15rem 0.25rem);
        }

        a {
          margin-left: 0.5rem;
          font-size: var(--pt-attribution-size, 0.75rem);
          color: var(--pt-attribution-color, inherit);
          text-decoration: var(--pt-attribution-decoration, none);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        a[data-visible] {
          opacity: var(--pt-attribution-opacity, 0.6);
          visibility: visible;
          pointer-events: auto;
        }
      </style>

      <label part="label">${escapeHtml(this.#label || DEFAULT_LABEL)}</label>

      <select part="select" aria-label="${escapeHtml(this.#label || DEFAULT_LABEL)}">
        ${options}
      </select>

      <a
        part="attribution"
        data-attribution
        href="${DEFAULT_ATTRIBUTION_HREF}"
        target="_blank"
        rel="noopener noreferrer"
      >${DEFAULT_ATTRIBUTION_TEXT}</a>
    `
  }
}

if (!customElements.get('page-translator')) {
  customElements.define('page-translator', PageTranslatorElement)
}
