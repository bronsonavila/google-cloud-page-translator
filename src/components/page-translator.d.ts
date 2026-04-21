import type { PageTranslatorLanguageOption } from '../core/client.js'

export class PageTranslatorElement extends HTMLElement {
  endpoint: string
  languages: PageTranslatorLanguageOption[] | null
  /** Root element to translate (default: `document.body`). */
  root: Element | Document
  sourceLanguage: string
}
