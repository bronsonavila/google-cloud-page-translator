// --- Utility helpers

function hasTranslatableContent(text) {
  return /[\p{L}\p{N}]/u.test(text || '')
}

function isInsideNoTranslate(element) {
  return Boolean(element.closest('[translate="no"], .notranslate'))
}

function preserveWhitespace(original, translated) {
  let result = translated

  const leadingWhitespace = original.match(/^\s+/)?.[0] || ''
  const trailingWhitespace = original.match(/\s+$/)?.[0] || ''

  if (leadingWhitespace) {
    result = leadingWhitespace + result.replace(/^\s+/, '')
  }

  if (trailingWhitespace) {
    result = result.replace(/\s+$/, '') + trailingWhitespace
  }

  return result
}

function chunkArray(array, size) {
  const chunks = []

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }

  return chunks
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object'
}

const INLINE_ELEMENT_TAG_NAMES = new Set([
  'A',
  'ABBR',
  'B',
  'BDI',
  'BDO',
  'BR',
  'CITE',
  'CODE',
  'DFN',
  'EM',
  'I',
  'KBD',
  'MARK',
  'Q',
  'RP',
  'RT',
  'RUBY',
  'S',
  'SAMP',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'TIME',
  'U',
  'VAR',
  'WBR'
])

function getLangTarget(root) {
  if (!root) return null

  if (root.nodeType === Node.DOCUMENT_NODE) {
    return root.documentElement || null
  }

  return root.nodeType === Node.ELEMENT_NODE ? root : null
}

function restoreLangAttribute(target, original) {
  if (!target) return

  if (original.hadAttribute) {
    target.setAttribute('lang', original.value)

    return
  }

  target.removeAttribute('lang')
}

function isRichTextCovered(node, richTextElements) {
  if (!richTextElements?.size) return false

  let current = node

  while (current) {
    if (richTextElements.has(current)) return true
    current = current.parentElement
  }

  return false
}

function getElementCandidates(root) {
  const descendants = Array.from(root.querySelectorAll('*'))

  if (root.nodeType === Node.ELEMENT_NODE) {
    return [root, ...descendants]
  }

  return descendants
}

function hasRichTextDirectTextChild(element) {
  return Array.from(element.childNodes).some(node => {
    return (
      node.nodeType === Node.TEXT_NODE &&
      typeof node.nodeValue === 'string' &&
      node.nodeValue.trim() &&
      hasTranslatableContent(node.nodeValue)
    )
  })
}

function hasInlineElementChild(element) {
  return Array.from(element.children).some(child => INLINE_ELEMENT_TAG_NAMES.has(child.tagName))
}

function getRichTextElements(root, shouldTranslateNode) {
  return getElementCandidates(root).filter(element => {
    if (INLINE_ELEMENT_TAG_NAMES.has(element.tagName)) return false

    if (element.closest('script, style, noscript')) return false

    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION'].includes(element.tagName)) {
      return false
    }

    if (isInsideNoTranslate(element)) return false

    if (element.querySelector('[translate="no"], .notranslate')) return false

    if (!hasInlineElementChild(element) || !hasRichTextDirectTextChild(element)) return false

    const textNodes = Array.from(element.childNodes).filter(node => {
      return (
        node.nodeType === Node.TEXT_NODE &&
        typeof node.nodeValue === 'string' &&
        node.nodeValue.trim() &&
        hasTranslatableContent(node.nodeValue)
      )
    })

    if (typeof shouldTranslateNode === 'function' && textNodes.some(node => !shouldTranslateNode(node))) {
      return false
    }

    return true
  })
}

// --- Storage cache

function isStorageLike(storage) {
  return (
    storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function'
  )
}

function getDefaultStorage() {
  try {
    if (typeof window !== 'undefined' && isStorageLike(window.localStorage)) {
      return window.localStorage
    }
  } catch {
    // ignore
  }

  return null
}

function loadStringMap({ storage, storagePrefix, language, cacheVersion, cacheExpirationMs }) {
  if (!storage) return {}

  const key = storagePrefix + language

  try {
    const raw = storage.getItem(key)

    if (!raw) return {}

    const parsed = JSON.parse(raw)

    if (
      !isObject(parsed) ||
      parsed.version !== cacheVersion ||
      typeof parsed.createdAt !== 'number' ||
      !isObject(parsed.map)
    ) {
      storage.removeItem(key)

      return {}
    }

    if (Date.now() - parsed.createdAt > cacheExpirationMs) {
      storage.removeItem(key)

      return {}
    }

    return parsed.map
  } catch {
    try {
      storage.removeItem(key)
    } catch {
      // ignore
    }

    return {}
  }
}

function saveStringMap({ storage, storagePrefix, language, cacheVersion, map }) {
  if (!storage) return

  const key = storagePrefix + language

  try {
    let createdAt = Date.now()

    try {
      const existing = storage.getItem(key)

      if (existing) {
        const parsed = JSON.parse(existing)

        if (isObject(parsed) && parsed.version === cacheVersion && typeof parsed.createdAt === 'number') {
          createdAt = parsed.createdAt
        }
      }
    } catch {
      // ignore
    }

    storage.setItem(key, JSON.stringify({ version: cacheVersion, createdAt, map }))
  } catch {
    // ignore
  }
}

// --- DOM scraping

function getTextNodes(root, shouldTranslateNode, richTextElements) {
  const nodes = []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      const value = node.nodeValue

      if (!value?.trim() || !hasTranslatableContent(value)) return NodeFilter.FILTER_REJECT

      const parent = node.parentElement

      if (!parent) return NodeFilter.FILTER_REJECT

      if (parent.closest('script, style, noscript')) return NodeFilter.FILTER_REJECT

      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION'].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT
      }

      if (isInsideNoTranslate(parent)) return NodeFilter.FILTER_REJECT

      if (isRichTextCovered(parent, richTextElements)) return NodeFilter.FILTER_REJECT

      if (typeof shouldTranslateNode === 'function') {
        return shouldTranslateNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      }

      return NodeFilter.FILTER_ACCEPT
    }
  })

  while (walker.nextNode()) nodes.push(walker.currentNode)

  return nodes
}

function getPlaceholderElements(root, shouldTranslateAttribute) {
  const elements = Array.from(root.querySelectorAll('input[placeholder], textarea[placeholder]'))

  return elements.filter(element => {
    const value = element.getAttribute('placeholder')

    if (!hasTranslatableContent(value)) return false

    if (isInsideNoTranslate(element)) return false

    if (typeof shouldTranslateAttribute !== 'function') return true

    return shouldTranslateAttribute(element, 'placeholder')
  })
}

function getValueElements(root, shouldTranslateAttribute) {
  const elements = Array.from(
    root.querySelectorAll('input[type="submit"][value], input[type="button"][value], input[type="reset"][value]')
  )

  return elements.filter(element => {
    const value = element.getAttribute('value')

    if (!hasTranslatableContent(value)) return false

    if (isInsideNoTranslate(element)) return false

    if (typeof shouldTranslateAttribute !== 'function') return true

    return shouldTranslateAttribute(element, 'value')
  })
}

/**
 * Create a headless page translator that snapshots text nodes and selected attributes,
 * batches strings through your transport, caches results, and optionally observes DOM mutations.
 *
 * By default, text nodes and translatable attributes under an ancestor with `translate="no"` or
 * class `notranslate` are skipped, matching Google Cloud Translation HTML guidance.
 *
 * @param {object} [options]
 * @param {ParentNode} [options.root] Root subtree to translate (default: `document.body` when `document` exists).
 * @param {(texts: string[], targetLanguage: string, options?: { format?: 'text' | 'html' }) => Promise<string[]>} options.transport Required batch translator; must return an array of the same length as `texts`.
 * @param {Storage | null} [options.storage] Persistence for per-language string maps and the preferred language (default: `localStorage` in browsers when available).
 * @param {{ value: string, label?: string }[]} [options.languages] When set, `setLanguage` ignores unknown codes.
 * @param {(node: Text) => boolean} [options.shouldTranslateNode] Filter for text nodes discovered under `root`.
 * @param {(element: Element, attributeName: string) => boolean} [options.shouldTranslateAttribute] Filter for `placeholder` and submit `value` attributes.
 * @param {boolean} [options.observeMutations] When true (default), re-run translation after debounced DOM changes while not on the source language.
 * @param {number} [options.chunkSize] Maximum strings per `transport` call (default: 128).
 * @param {string} [options.storagePrefix] Prefix for cache keys in `storage` (default: `translations_`).
 * @param {string} [options.preferenceKey] Key for persisting the selected language (default: `preferredLanguage`).
 * @param {number} [options.observerDebounceMs] Debounce for mutation-driven re-translation (default: 300).
 * @param {string} [options.sourceLanguage] Language code for the original page content (default: `en`); selecting this restores originals.
 * @param {boolean} [options.markTranslations] When true (default), apply Google machine-translation `lang` markup to the translation root.
 * @param {boolean} [options.translateHTML] When true (default), translate eligible rich-text containers as HTML instead of splitting their text nodes.
 * @param {number} [options.cacheVersion] Bump to invalidate cached maps for all languages (default: 1).
 * @param {number} [options.cacheExpirationMs] Time-to-live for cached maps (default: 30 days).
 * @returns {{
 *   setLanguage: (language: string) => Promise<void>,
 *   getLanguage: () => string,
 *   restoreOriginals: () => void,
 *   destroy: () => void
 * }}
 */
export function createPageTranslator(options) {
  const {
    root = typeof document !== 'undefined' ? document.body : null,
    transport,
    storage = getDefaultStorage(),
    languages,
    shouldTranslateNode,
    shouldTranslateAttribute,
    observeMutations = true,
    chunkSize = 128,
    storagePrefix = 'translations_',
    preferenceKey = 'preferredLanguage',
    observerDebounceMs = 300,
    // Language code for the untranslated page content. Switching back to this restores originals.
    sourceLanguage = 'en',
    markTranslations = true,
    translateHTML = true,
    // Bump cacheVersion to immediately invalidate all cached translations for all users.
    cacheVersion = 1,
    cacheExpirationMs = 30 * 24 * 60 * 60 * 1000
  } = options || {}

  if (!root) throw new Error('createPageTranslator requires a root element')

  if (typeof transport !== 'function') throw new Error('createPageTranslator requires transport(texts, targetLanguage)')

  // WeakMaps let us keep original values without mutating DOM nodes or leaking memory.
  const originals = {
    text: new WeakMap(),
    html: new WeakMap(),
    placeholder: new WeakMap(),
    value: new WeakMap()
  }
  // Rich-text containers have their innerHTML replaced on translation, so a fresh snapshot
  // can no longer classify them as rich-text. Track every element whose original HTML we
  // captured so restoreOriginals can reach them regardless of current DOM shape.
  const trackedRichTextElements = new Set()
  const langTarget = getLangTarget(root)
  const originalLang = {
    hadAttribute: langTarget?.hasAttribute('lang') || false,
    value: langTarget?.getAttribute('lang') || ''
  }

  let currentLanguage = sourceLanguage
  // Prevent observer feedback loops while we are actively writing translated content.
  let ignoreMutationsUntil = 0
  let observerTimer = null
  // Monotonic request id guards against stale async responses overwriting newer language choices.
  let applyRequestId = 0
  let observer = null

  function getStoredLanguage() {
    if (!storage) return null

    try {
      const value = storage.getItem(preferenceKey)

      return typeof value === 'string' && value ? value : null
    } catch {
      return null
    }
  }

  function setStoredLanguage(language) {
    if (!storage) return

    try {
      storage.setItem(preferenceKey, language)
    } catch {
      // ignore
    }
  }

  function initializeOriginals(snapshot) {
    // Capture originals once so every language switch always starts from the same source text.
    snapshot.richTextElements.forEach(element => {
      if (!originals.html.has(element)) originals.html.set(element, element.innerHTML)

      trackedRichTextElements.add(element)
    })

    snapshot.textNodes.forEach(node => {
      if (!originals.text.has(node)) originals.text.set(node, node.nodeValue)
    })

    snapshot.placeholderElements.forEach(element => {
      if (!originals.placeholder.has(element))
        originals.placeholder.set(element, element.getAttribute('placeholder') || '')
    })

    snapshot.valueElements.forEach(element => {
      if (!originals.value.has(element)) originals.value.set(element, element.getAttribute('value') || '')
    })
  }

  function getSnapshot() {
    const richTextElements = translateHTML ? getRichTextElements(root, shouldTranslateNode) : []
    const richTextElementSet = richTextElements.length > 0 ? new Set(richTextElements) : null
    const snapshot = {
      richTextElements,
      textNodes: getTextNodes(root, shouldTranslateNode, richTextElementSet),
      placeholderElements: getPlaceholderElements(root, shouldTranslateAttribute),
      valueElements: getValueElements(root, shouldTranslateAttribute)
    }

    initializeOriginals(snapshot)

    return snapshot
  }

  function restoreOriginalsFromSnapshot(snapshot) {
    // Iterate tracked elements rather than the snapshot: once we replace innerHTML with a
    // translation, the container no longer matches getRichTextElements, so a fresh snapshot
    // would miss it and leave the translated markup in place.
    trackedRichTextElements.forEach(element => {
      const value = originals.html.get(element)

      if (typeof value === 'string') element.innerHTML = value
    })

    snapshot.textNodes.forEach(node => {
      const value = originals.text.get(node)

      if (typeof value === 'string') node.nodeValue = value
    })

    snapshot.placeholderElements.forEach(element => {
      const value = originals.placeholder.get(element)

      if (typeof value === 'string') element.setAttribute('placeholder', value)
    })

    snapshot.valueElements.forEach(element => {
      const value = originals.value.get(element)

      if (typeof value === 'string') element.setAttribute('value', value)
    })
  }

  function buildTranslationQueue(snapshot) {
    // Flatten all translatable targets into one ordered queue for positional mapping.
    return [
      ...snapshot.richTextElements.map(element => ({
        type: 'html',
        target: element,
        original: originals.html.get(element) || '',
        cacheKey: `html:${originals.html.get(element) || ''}`,
        format: 'html'
      })),
      ...snapshot.textNodes.map(node => ({
        type: 'textNode',
        target: node,
        original: originals.text.get(node) || '',
        cacheKey: `text:${originals.text.get(node) || ''}`,
        format: 'text'
      })),
      ...snapshot.placeholderElements.map(element => ({
        type: 'placeholder',
        target: element,
        original: originals.placeholder.get(element) || '',
        cacheKey: `text:${originals.placeholder.get(element) || ''}`,
        format: 'text'
      })),
      ...snapshot.valueElements.map(element => ({
        type: 'value',
        target: element,
        original: originals.value.get(element) || '',
        cacheKey: `text:${originals.value.get(element) || ''}`,
        format: 'text'
      }))
    ]
  }

  function applyTranslatedQueue(queue, translatedTexts) {
    queue.forEach((item, index) => {
      const translatedText = translatedTexts[index]
      if (typeof translatedText !== 'string') return

      if (item.type === 'html') {
        item.target.innerHTML = translatedText

        return
      }

      if (item.type === 'textNode') {
        item.target.nodeValue = preserveWhitespace(item.original, translatedText)

        return
      }

      if (item.type === 'placeholder') {
        item.target.setAttribute('placeholder', translatedText)

        return
      }

      item.target.setAttribute('value', translatedText)
    })
  }

  async function translateMissGroup(uniqueMisses, targetLanguage, options) {
    const chunks = chunkArray(uniqueMisses, chunkSize)
    const results = new Map()

    for (const chunk of chunks) {
      // Chunk requests to stay under service limits and reduce payload size.
      const translated = await transport(
        chunk.map(item => item.original),
        targetLanguage,
        options
      )

      if (!Array.isArray(translated) || translated.length !== chunk.length) {
        throw new Error('transport must return an array of translated strings matching input length')
      }

      chunk.forEach((item, index) => {
        results.set(item.cacheKey, translated[index])
      })
    }

    return results
  }

  async function translateMisses(uniqueMisses, targetLanguage) {
    const textMisses = uniqueMisses.filter(item => item.format === 'text')
    const htmlMisses = uniqueMisses.filter(item => item.format === 'html')
    const results = new Map()

    if (textMisses.length > 0) {
      const translatedText = await translateMissGroup(textMisses, targetLanguage, { format: 'text' })

      translatedText.forEach((value, key) => {
        results.set(key, value)
      })
    }

    if (htmlMisses.length > 0) {
      const translatedHTML = await translateMissGroup(htmlMisses, targetLanguage, { format: 'html' })

      translatedHTML.forEach((value, key) => {
        results.set(key, value)
      })
    }

    return results
  }

  function applyTranslationMarkup(targetLanguage) {
    if (!markTranslations || !langTarget) return

    langTarget.setAttribute('lang', `${targetLanguage}-x-mtfrom-${sourceLanguage}`)
  }

  function restoreTranslationMarkup() {
    if (!markTranslations || !langTarget) return

    restoreLangAttribute(langTarget, originalLang)
  }

  async function applyLanguage(targetLanguage) {
    const requestId = ++applyRequestId
    const snapshot = getSnapshot()

    if (targetLanguage === sourceLanguage) {
      ignoreMutationsUntil = Date.now() + 500

      restoreOriginalsFromSnapshot(snapshot)
      restoreTranslationMarkup()

      return
    }

    const queue = buildTranslationQueue(snapshot)

    const stringMap = loadStringMap({
      storage,
      storagePrefix,
      language: targetLanguage,
      cacheVersion,
      cacheExpirationMs
    })

    const uniqueMisses = []
    const seenMisses = new Set()

    queue.forEach(item => {
      if (item.cacheKey in stringMap || seenMisses.has(item.cacheKey)) return

      seenMisses.add(item.cacheKey)
      uniqueMisses.push(item)
    })

    if (uniqueMisses.length > 0) {
      const translated = await translateMisses(uniqueMisses, targetLanguage)

      // Another language selection happened while awaiting transport results.
      if (requestId !== applyRequestId) return

      uniqueMisses.forEach(item => {
        if (!translated.has(item.cacheKey)) return

        stringMap[item.cacheKey] = translated.get(item.cacheKey)
      })

      saveStringMap({
        storage,
        storagePrefix,
        language: targetLanguage,
        cacheVersion,
        map: stringMap
      })
    }

    if (requestId !== applyRequestId) return

    ignoreMutationsUntil = Date.now() + 500

    applyTranslatedQueue(
      queue,
      queue.map(item => stringMap[item.cacheKey] ?? item.original)
    )
    applyTranslationMarkup(targetLanguage)
  }

  async function setLanguage(language) {
    if (typeof language !== 'string' || !language) return

    if (Array.isArray(languages) && languages.length > 0) {
      const known = new Set(languages.map(l => l?.value).filter(Boolean))

      if (!known.has(language)) return
    }

    currentLanguage = language

    setStoredLanguage(language)

    try {
      await applyLanguage(language)
    } catch (error) {
      console.error('Translation failed:', error)
    }
  }

  function getLanguage() {
    return currentLanguage
  }

  function restoreOriginals() {
    currentLanguage = sourceLanguage

    setStoredLanguage(sourceLanguage)

    restoreOriginalsFromSnapshot(getSnapshot())
    restoreTranslationMarkup()
  }

  function destroy() {
    if (observer) observer.disconnect()

    observer = null

    if (observerTimer) clearTimeout(observerTimer)

    observerTimer = null

    // Incrementing applyRequestId cancels any in-flight applyLanguage call
    // by invalidating its requestId check, preventing stale DOM writes after teardown.
    applyRequestId++
  }

  if (observeMutations && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => {
      if (Date.now() < ignoreMutationsUntil) return

      if (currentLanguage === sourceLanguage) return

      if (observerTimer) clearTimeout(observerTimer)

      observerTimer = setTimeout(() => {
        if (currentLanguage === sourceLanguage) return

        // Re-translate newly inserted content after DOM updates settle.
        applyLanguage(currentLanguage).catch(error => {
          console.error('Translation failed:', error)
        })
      }, observerDebounceMs)
    })

    observer.observe(root, { childList: true, subtree: true })
  }

  const saved = getStoredLanguage()

  if (saved) {
    currentLanguage = saved

    if (saved !== sourceLanguage) {
      applyLanguage(saved).catch(error => {
        console.error('Translation failed:', error)
      })
    }
  }

  return { setLanguage, getLanguage, restoreOriginals, destroy }
}
