export interface PageTranslatorLanguageOption {
  value: string
  label?: string
}

export interface PageTranslatorTransportOptions {
  format?: 'text' | 'html'
}

export interface CreatePageTranslatorOptions {
  root?: Element | Document | null
  transport: (
    texts: string[],
    targetLanguage: string,
    options?: PageTranslatorTransportOptions
  ) => Promise<string[]>
  storage?: Storage | null
  languages?: PageTranslatorLanguageOption[]
  shouldTranslateNode?: (node: Text) => boolean
  shouldTranslateAttribute?: (element: Element, attributeName: string) => boolean
  observeMutations?: boolean
  chunkSize?: number
  storagePrefix?: string
  preferenceKey?: string
  observerDebounceMs?: number
  /** Language code for the untranslated page content. Switching back to this restores originals. */
  sourceLanguage?: string
  /** Apply Google machine-translation lang markup to the translation root. */
  markTranslations?: boolean
  /** Translate eligible rich-text containers as HTML instead of plain text fragments (default: true). */
  translateHTML?: boolean
  /** Bump to invalidate all cached translations for all users. */
  cacheVersion?: number
  cacheExpirationMs?: number
}

export interface PageTranslator {
  setLanguage: (language: string) => Promise<void>
  getLanguage: () => string
  restoreOriginals: () => void
  destroy: () => void
}

export function createPageTranslator(options?: CreatePageTranslatorOptions): PageTranslator
