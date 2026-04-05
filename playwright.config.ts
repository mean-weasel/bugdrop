import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8787';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*\.live\.spec\.ts/,
    },
    {
      name: 'chromium-live',
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET && {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          },
        }),
      },
      testMatch: /.*\.live\.spec\.ts/,
      timeout: 60_000,
    },
  ],
  webServer: process.env.LIVE_TARGET
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:8787',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
