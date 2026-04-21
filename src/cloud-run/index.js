const { Translate } = require('@google-cloud/translate').v2
const translate = new Translate()

const BAN_THRESHOLD = 200
const BAN_WINDOW_MS = 5 * 60_000
const MAX_STRING_LENGTH = 5_000
const MAX_STRINGS_PER_BATCH = 128
const RATE_LIMIT_RPM = 60
const RATE_LIMIT_WINDOW_MS = 60_000

const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)

if (allowedOrigins.size === 0) {
  console.warn('ALLOWED_ORIGINS is empty. No origin will receive CORS headers.')
}

function isOriginAllowed(origin) {
  try {
    // Match the browser's Origin header exactly, including protocol and port.
    return allowedOrigins.has(new URL(origin).origin)
  } catch {
    return false
  }
}

const bannedIps = new Set()
const requestLog = new Map()

function pruneRequestTimestamps(timestamps, now) {
  const cutoff = now - BAN_WINDOW_MS

  let firstValidIndex = 0

  while (firstValidIndex < timestamps.length && timestamps[firstValidIndex] < cutoff) firstValidIndex++

  return firstValidIndex === 0 ? timestamps : timestamps.slice(firstValidIndex)
}

function isRateLimited(ip) {
  if (!RATE_LIMIT_RPM) return false

  if (bannedIps.has(ip)) return true

  const now = Date.now()
  const current = requestLog.get(ip) || []
  const pruned = pruneRequestTimestamps(current, now)

  if (pruned.length >= BAN_THRESHOLD) {
    bannedIps.add(ip)
    requestLog.delete(ip)

    console.warn(`IP ${ip} permanently banned on this instance.`)

    return true
  }

  const rpmCutoff = now - RATE_LIMIT_WINDOW_MS
  const recentCount = pruned.filter(timestamp => timestamp >= rpmCutoff).length

  if (recentCount >= RATE_LIMIT_RPM) {
    requestLog.set(ip, pruned)

    return true
  }

  pruned.push(now)

  requestLog.set(ip, pruned)

  return false
}

const cleanupTimer = setInterval(() => {
  const now = Date.now()

  for (const [ip, timestamps] of requestLog.entries()) {
    const pruned = pruneRequestTimestamps(timestamps, now)

    if (pruned.length === 0) requestLog.delete(ip)
    else if (pruned !== timestamps) requestLog.set(ip, pruned)
  }
}, 60_000)

if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref()

exports.translatePage = async (request, response) => {
  const origin = request.get('Origin')

  if (origin && isOriginAllowed(origin)) {
    response.set('Access-Control-Allow-Origin', origin)
    response.set('Vary', 'Origin')
  }

  response.set('Access-Control-Allow-Methods', 'POST')
  response.set('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.status(204).send('')

    return
  }

  const ip = String(request.ip || '').trim() || 'unknown'

  if (isRateLimited(ip)) {
    response.status(429).json({ error: 'Too many requests, try again later' })

    return
  }

  if (request.method !== 'POST') {
    response.status(405).send('Method Not Allowed')

    return
  }

  const { texts, targetLanguage, format } = request.body || {}

  if (!Array.isArray(texts) || texts.length === 0 || !targetLanguage) {
    response.status(400).json({ error: 'texts (array) and targetLanguage are required' })

    return
  }

  if (texts.length > MAX_STRINGS_PER_BATCH) {
    response.status(400).json({
      error: `texts array must not exceed ${MAX_STRINGS_PER_BATCH} items per request`
    })

    return
  }

  const hasInvalidItem = texts.some(item => typeof item !== 'string' || item.length > MAX_STRING_LENGTH)

  if (hasInvalidItem) {
    response.status(400).json({
      error: `Each item in texts must be a string of at most ${MAX_STRING_LENGTH} characters`
    })

    return
  }

  try {
    let [translations] = await translate.translate(texts, {
      to: targetLanguage,
      format: format || 'text'
    })

    translations = Array.isArray(translations) ? translations : [translations]

    response.status(200).json({ translatedTexts: translations })
  } catch (error) {
    console.error('Translation error:', error)

    response.status(500).json({ error: 'Translation failed' })
  }
}
