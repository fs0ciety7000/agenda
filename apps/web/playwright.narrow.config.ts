import { devices } from '@playwright/test';
import base from './playwright.config';

/** Petit écran (320 px) pour repérer les débordements : `pnpm exec playwright test -c playwright.narrow.config.ts`. */
export default {
  ...base,
  projects: [
    { name: 'w320', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 720 } } },
  ],
};
