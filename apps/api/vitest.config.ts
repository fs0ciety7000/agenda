import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC émet les métadonnées de décorateurs nécessaires à l'injection NestJS (esbuild ne le fait pas).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
