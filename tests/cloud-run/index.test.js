import { describe, expect, it } from 'vitest'

const endpoint = process.env.VITE_TRANSLATE_ENDPOINT

const describeIntegration = endpoint ? describe : describe.skip

function jsonBody(data) {
  return JSON.stringify(data)
}

describeIntegration('Cloud Run translate endpoint (integration)', () => {
  it('POST returns translatedTexts matching input length', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody({ texts: ['hello', 'world'], targetLanguage: 'es', format: 'text' })
    })

    expect(response.status).toBe(200)

    const data = await response.json()

    expect(Array.isArray(data.translatedTexts)).toBe(true)
    expect(data.translatedTexts).toHaveLength(2)
    expect(typeof data.translatedTexts[0]).toBe('string')
    expect(typeof data.translatedTexts[1]).toBe('string')
  })

  it('POST returns 400 when texts is empty', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody({ texts: [], targetLanguage: 'es' })
    })

    expect(response.status).toBe(400)
  })

  it('POST returns 400 when targetLanguage is missing', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody({ texts: ['only'] })
    })

    expect(response.status).toBe(400)
  })

  it('POST returns 400 when batch exceeds 128 strings', async () => {
    const texts = Array.from({ length: 129 }, (_, index) => `s${index}`)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonBody({ texts, targetLanguage: 'es' })
    })

    expect(response.status).toBe(400)
  })

  it('GET returns 405', async () => {
    const response = await fetch(endpoint, { method: 'GET' })

    expect(response.status).toBe(405)
  })
})
