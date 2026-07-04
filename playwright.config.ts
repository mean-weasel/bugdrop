import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8787';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*\.(?:live|live-radix|cross-browser-live|radix)\.spec\.ts$/,
    },
    {
      name: 'chromium-radix',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.radix\.spec\.ts/,
    },
    {
      name: 'firefox-radix',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /.*\.radix\.spec\.ts/,
    },
    {
      name: 'webkit-radix',
      use: { ...devices['Desktop Safari'] },
      testMatch: /.*\.radix\.spec\.ts/,
    },
    {
      name: 'chromium-live',
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*\.live\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: 'chromium-live-radix',
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*\.live-radix\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: 'chromium-cross-browser-live',
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /.*\.cross-browser-live\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: 'firefox-cross-browser-live',
      fullyParallel: false,
      use: {
        ...devices['Desktop Firefox'],
      },
      testMatch: /.*\.cross-browser-live\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: 'webkit-cross-browser-live',
      fullyParallel: false,
      use: {
        ...devices['Desktop Safari'],
      },
      testMatch: /.*\.cross-browser-live\.spec\.ts/,
      timeout: 60_000,
    },
  ],
  webServer: process.env.LIVE_TARGET
    ? undefined
    : {
        command: 'BUGDROP_TEST_HOOKS=1 npm run build:widget && npm run dev',
        url: 'http://localhost:8787',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
