import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Keep attachment dumps out of the repository root (default is `.vitest-attachments`).
    attachmentsDir: 'node_modules/.cache/vitest-attachments',
    projects: [
      {
        test: {
          name: 'cloud-run',
          environment: 'node',
          include: ['tests/cloud-run/**/*.test.js']
        }
      },
      {
        test: {
          name: 'client',
          include: ['tests/client/**/*.test.js'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            // Pin the port so the Cloud Run function's ALLOWED_ORIGINS can allowlist it.
            api: { port: 51204 }
          }
        }
      }
    ]
  }
})
