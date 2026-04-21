import '../src/components/page-translator.js'

const endpoint = import.meta.env.VITE_TRANSLATE_ENDPOINT

const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'tl', label: 'Tagalog' }
]

const logEl = document.querySelector('[data-log]')
const hintEl = document.getElementById('endpoint-hint')

function appendLog(message) {
  const line = `${new Date().toISOString()} ${message}\n`

  logEl.textContent += line
  logEl.scrollTop = logEl.scrollHeight
}

function requestUrl(input) {
  if (typeof input === 'string') return input

  if (input instanceof Request) return input.url

  return String(input)
}

const nativeFetch = window.fetch.bind(window)

window.fetch = async (input, init) => {
  const url = requestUrl(input)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()

  if (endpoint && url === endpoint && method === 'POST') {
    appendLog(`POST ${url}`)
  }

  const response = await nativeFetch(input, init)

  if (endpoint && url === endpoint && method === 'POST') {
    appendLog(`  response status ${response.status}`)
  }

  return response
}

const translator = document.getElementById('translator')
const pageRoot = document.getElementById('page-root')

if (!endpoint) {
  hintEl.hidden = false

  appendLog('Missing VITE_TRANSLATE_ENDPOINT. Add it to .env.test at the repo root and restart.')
} else {
  translator.endpoint = endpoint
}

translator.languages = languages
translator.sourceLanguage = 'en'
translator.translateHTML = true
translator.root = pageRoot

appendLog('Playground ready. Change the language in the control to translate the main panel.')
