# google-cloud-page-translator

Framework-agnostic page translation using the Google Cloud Translation API as the intended backend.

This package ships:

- **Headless client core**: DOM snapshotting, caching, batching, and mutation observation.
- **Web Component**: `<page-translator>` drop-in UI.

## Install

```bash
npm install github:bronsonavila/google-cloud-page-translator
```

## Client (drop-in Web Component)

```js
import 'google-cloud-page-translator/element'
```

```html
<page-translator id="translator"></page-translator>
```

```js
const el = document.getElementById('translator')
// Use the HTTPS trigger URL returned by `gcloud functions deploy`.
el.endpoint = '<YOUR_TRANSLATE_FUNCTION_URL>'
el.languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'tl', label: 'Tagalog' }
]
// Optional: language code of your untranslated page (default: "en").
el.sourceLanguage = 'en'
```

The element is themed via CSS custom properties:

```css
page-translator {
  --pt-label-color: currentColor;
  --pt-label-font: system-ui, sans-serif;
  --pt-label-size: 1rem;
  --pt-select-color: currentColor;
  --pt-select-border: 1px solid currentColor;
  --pt-attribution-color: inherit;
}
```

## Client (headless, bring your own UI)

```js
import { createPageTranslator } from 'google-cloud-page-translator'

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'tl', label: 'Tagalog' }
]

// Use the HTTPS trigger URL returned by `gcloud functions deploy`.
const endpoint = '<YOUR_TRANSLATE_FUNCTION_URL>'

const transport = async (texts, targetLanguage) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, targetLanguage, format: 'text' })
  })

  if (!response.ok) throw new Error(`Translation request failed: ${response.status}`)

  const data = await response.json()
  return data.translatedTexts
}

const translator = createPageTranslator({
  root: document.body,
  transport,
  languages: LANGUAGES,
  // Optional: language code of your untranslated page (default: "en").
  sourceLanguage: 'en'
})

document.querySelector('#language').addEventListener('change', event => {
  translator.setLanguage(event.target.value)
})
```

By default, the client skips text nodes and translatable attributes under an ancestor with `translate="no"` or class `notranslate`, matching [Google Cloud Translation HTML guidance](https://docs.cloud.google.com/translate/troubleshooting). Use `shouldTranslateNode` or `shouldTranslateAttribute` only when you need extra filters beyond that.

## Testing

This repo uses **pnpm** (see `packageManager` in [package.json](package.json)).

### Playwright browsers (required)

Client tests run in **Vitest browser mode** (Chromium through Playwright), not jsdom. `pnpm install` does not download browser binaries. Run this once per clone, after upgrading the `playwright` dependency, and in continuous integration before `pnpm test`:

```bash
pnpm run playwright:install
pnpm test
```

That script is defined in [package.json](package.json) as `playwright install chromium`. The same install is available as `pnpm exec playwright install chromium`.

If this step is missing, `pnpm test` can fail with `browserType.launch: Executable doesn't exist` even when integration tests are skipped.

### Live endpoint (optional integration tests)

Integration tests call a **real** deployed translate URL (no mocks). Copy [`.env.test.example`](.env.test.example) to `.env.test` and set `VITE_TRANSLATE_ENDPOINT` to your function URL (see comments in that file and the note right after the deploy command under [Google Cloud Functions deployment](#google-cloud-functions-deployment)).

If `VITE_TRANSLATE_ENDPOINT` is unset, those integration suites are skipped, but the Playwright install above is still required for `pnpm test` to complete.

The `pnpm test` script loads `.env.test` when present via Node’s `--env-file-if-exists`, so Cloud Run integration tests see `VITE_TRANSLATE_ENDPOINT` without extra helpers.

## Local playground

Use the Vite playground for **local manual testing**: a real browser tab where `<page-translator>` renders, the language `<select>` is clickable, and translated copy updates in place. Automated tests stay headless; this page is for watching the component by hand on your machine.

**Prerequisites**

- Same `.env.test` as browser tests: set `VITE_TRANSLATE_ENDPOINT` to your deployed function URL (see [`.env.test.example`](.env.test.example)).
- The playground dev server is fixed to **`http://localhost:5173`**. Add that exact origin to **`ALLOWED_ORIGINS`** on the function. Browser integration tests use a fixed Vitest UI origin **`http://localhost:51204`** (see [vitest.config.js](vitest.config.js)); include that origin too if you run `pnpm test` against the live endpoint.

**Run**

```bash
pnpm playground
```

Then open `http://localhost:5173`. The `pnpm playground` script uses Vite **`--mode test`** so variables from `.env.test` are loaded automatically.

## Language codes

Use language codes that match what you pass to the Cloud Translation API. The authoritative list for the **Neural Machine Translation (NMT)** model is Google Cloud’s [supported languages](https://docs.cloud.google.com/translate/docs/languages#nmt) table.

[Google Translate](https://translate.google.com/) can show additional locale or variant labels. Some of those codes may still work with this backend even when they are not called out in the Cloud Translation documentation, but behavior is not guaranteed.

## Google Cloud Functions deployment

`src/cloud-run/index.js` is the server implementation for Google Cloud Functions (2nd gen, also called Cloud Run functions). It receives POST requests from the client, calls the Google Cloud Translation API, and returns translated strings.

The deployment source folder lives at `src/cloud-run` in this repository.

### Prerequisites

Enable the **Cloud Translation API**, **Cloud Functions API**, and **Cloud Build API** in your Google Cloud project.

### Deploy

```bash
gcloud functions deploy translatePage \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --max-instances=3 \
  --source src/cloud-run \
  --set-env-vars ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

After a successful deploy, `gcloud` prints the function URL. You can also copy it from the Cloud Run service details page (it usually looks like `https://SERVICE_NAME-PROJECT_NUMBER.REGION.run.app`). Set that value as `VITE_TRANSLATE_ENDPOINT` in `.env.test` for integration tests and the playground (see [`.env.test.example`](.env.test.example)).

### Environment variables

**`ALLOWED_ORIGINS`** — comma-separated list of full origins allowed to call the function.

- Include protocol, and include port when needed
- Do not include any path
- Matching is exact against the browser's `Origin` header
- Wildcards are not supported

```text
# Production only
ALLOWED_ORIGINS=https://example.com,https://www.example.com

# Local + production (include the Vitest browser port and the playground port if you use them)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:51204,http://localhost:5173,https://example.com,https://www.example.com
```

### Rate limiting

The function includes a simple per-IP rate limit to reduce accidental or opportunistic abuse.

- The limit is **per instance**. `--max-instances` controls how many instances can run concurrently.
- This is not a substitute for Cloud Armor or API keys if you expect targeted abuse.

Rate limits are hardcoded in the function: **60** requests per minute per IP (rolling 1-minute window), and **200** requests in a rolling **5-minute** window triggers a permanent ban for that IP on the current instance.

To update env vars without redeploying code:

```bash
gcloud functions deploy translatePage --update-env-vars ALLOWED_ORIGINS=https://example.com,https://www.example.com
```
