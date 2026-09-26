import { defineConfig, devices } from '@playwright/test';

/** E2E : nécessite l'API (port 4000) et le web (port 3000) démarrés. */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'fr-BE',
    timezoneId: 'Europe/Brussels',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
