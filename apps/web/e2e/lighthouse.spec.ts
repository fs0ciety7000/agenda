import { chromium, expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

/**
 * Budget de performance (docs/audit-ui-ux.md §5) : Lighthouse mobile sur `/login` et `/`
 * (connecté). Lancé à part, une fois : `LIGHTHOUSE=1 pnpm exec playwright test lighthouse
 * --project=desktop`. Médiane de trois mesures, la performance variant d'une mesure à l'autre sur
 * une machine partagée.
 */
const BUDGET = {
  // Accueil : 85 pour l'instant (~87 mesuré) ; 90 demande de préparer la session côté serveur
  // (docs/roadmap.md, lot 6). Ne baisser aucun seuil : le relever quand c'est fait.
  '/login': { performance: 90, accessibility: 95 },
  '/': { performance: 85, accessibility: 95 },
} as const;
const RUNS = 3;
const PORT = 9333;

test.skip(!process.env.LIGHTHOUSE, 'LIGHTHOUSE=1 pour mesurer');

test('Lighthouse : connexion et accueil', async ({ baseURL }) => {
  test.setTimeout(300_000);
  // Lighthouse pilote ce même navigateur : la session ouverte ci-dessous vaut pour « / ».
  const context = await chromium.launchPersistentContext('', {
    args: [`--remote-debugging-port=${PORT}`],
    baseURL,
    locale: 'fr-BE',
    timezoneId: 'Europe/Brussels',
  });
  const { default: lighthouse } = await import('lighthouse');
  // `keepSession` : Lighthouse vide d'ordinaire cookies et stockage avant de mesurer.
  const measure = async (path: string, keepSession = false) => {
    const runs: { performance: number; accessibility: number }[] = [];
    for (let i = 0; i < RUNS; i++) {
      const result = await lighthouse(
        `${baseURL}${path}`,
        { port: PORT, output: 'json', logLevel: 'error' },
        {
          extends: 'lighthouse:default',
          settings: {
            onlyCategories: ['performance', 'accessibility'],
            disableStorageReset: keepSession,
          },
        },
      );
      const categories = result!.lhr.categories;
      runs.push({
        performance: Math.round((categories.performance!.score ?? 0) * 100),
        accessibility: Math.round((categories.accessibility!.score ?? 0) * 100),
      });
    }
    const median = (values: number[]) =>
      values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const score = {
      performance: median(runs.map((r) => r.performance)),
      accessibility: median(runs.map((r) => r.accessibility)),
    };
    // Affiché dans le journal de la CI (console.log est refusé par le lint).
    console.warn(
      `Lighthouse ${path} : ${JSON.stringify(score)} (mesures : ${JSON.stringify(runs)})`,
    );
    return score;
  };
  try {
    const login = await measure('/login');
    const page = context.pages()[0] ?? (await context.newPage());
    await signUpWithHousehold(page, 'Emma');
    const home = await measure('/', true);
    for (const [path, score] of [
      ['/login', login],
      ['/', home],
    ] as const) {
      const min = BUDGET[path];
      expect
        .soft(score.performance, `${path} : performance`)
        .toBeGreaterThanOrEqual(min.performance);
      expect
        .soft(score.accessibility, `${path} : accessibilité`)
        .toBeGreaterThanOrEqual(min.accessibility);
    }
  } finally {
    await context.close();
  }
});
