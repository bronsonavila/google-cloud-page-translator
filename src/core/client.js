// --- Utility helpers

function hasTranslatableContent(text) {
  return /[\p{L}\p{N}]/u.test(text || '')
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

function getTextNodes(root, shouldTranslateNode) {
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

    if (typeof shouldTranslateAttribute !== 'function') return true

    return shouldTranslateAttribute(element, 'value')
  })
}

/**
 * Create a headless page translator that snapshots text nodes and selected attributes,
 * batches strings through your transport, caches results, and optionally observes DOM mutations.
 *
 * @param {object} [options]
 * @param {ParentNode} [options.root] Root subtree to translate (default: `document.body` when `document` exists).
 * @param {(texts: string[], targetLanguage: string) => Promise<string[]>} options.transport Required batch translator; must return an array of the same length as `texts`.
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
    // Bump cacheVersion to immediately invalidate all cached translations for all users.
    cacheVersion = 1,
    cacheExpirationMs = 30 * 24 * 60 * 60 * 1000
  } = options || {}

  if (!root) throw new Error('createPageTranslator requires a root element')

  if (typeof transport !== 'function') throw new Error('createPageTranslator requires transport(texts, targetLanguage)')

  // WeakMaps let us keep original values without mutating DOM nodes or leaking memory.
  const originals = {
    text: new WeakMap(),
    placeholder: new WeakMap(),
    value: new WeakMap()
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
    const snapshot = {
      textNodes: getTextNodes(root, shouldTranslateNode),
      placeholderElements: getPlaceholderElements(root, shouldTranslateAttribute),
      valueElements: getValueElements(root, shouldTranslateAttribute)
    }

    initializeOriginals(snapshot)

    return snapshot
  }

  function restoreOriginalsFromSnapshot(snapshot) {
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
      ...snapshot.textNodes.map(node => ({
        type: 'textNode',
        target: node,
        original: originals.text.get(node) || ''
      })),
      ...snapshot.placeholderElements.map(element => ({
        type: 'placeholder',
        target: element,
        original: originals.placeholder.get(element) || ''
      })),
      ...snapshot.valueElements.map(element => ({
        type: 'value',
        target: element,
        original: originals.value.get(element) || ''
      }))
    ]
  }

  function applyTranslatedQueue(queue, translatedTexts) {
    queue.forEach((item, index) => {
      const translatedText = translatedTexts[index]
      if (typeof translatedText !== 'string') return

      if (item.type === 'textNode') {
        item.target.nodeValue = translatedText

        return
      }

      if (item.type === 'placeholder') {
        item.target.setAttribute('placeholder', translatedText)

        return
      }

      item.target.setAttribute('value', translatedText)
    })
  }

  async function translateMisses(uniqueMisses, targetLanguage) {
    const chunks = chunkArray(uniqueMisses, chunkSize)
    const results = []

    for (const chunk of chunks) {
      // Chunk requests to stay under service limits and reduce payload size.
      const translated = await transport(chunk, targetLanguage)

      if (!Array.isArray(translated) || translated.length !== chunk.length) {
        throw new Error('transport must return an array of translated strings matching input length')
      }

      results.push(...translated)
    }

    return results
  }

  async function applyLanguage(targetLanguage) {
    const requestId = ++applyRequestId
    const snapshot = getSnapshot()

    if (targetLanguage === sourceLanguage) {
      ignoreMutationsUntil = Date.now() + 500

      restoreOriginalsFromSnapshot(snapshot)

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

    const uniqueMisses = [...new Set(queue.map(item => item.original).filter(text => !(text in stringMap)))]

    if (uniqueMisses.length > 0) {
      const translated = await translateMisses(uniqueMisses, targetLanguage)

      // Another language selection happened while awaiting transport results.
      if (requestId !== applyRequestId) return

      uniqueMisses.forEach((text, index) => {
        stringMap[text] = translated[index]
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
      queue.map(item => stringMap[item.original] ?? item.original)
    )
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
