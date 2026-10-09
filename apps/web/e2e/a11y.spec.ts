import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

/**
 * Audit automatique WCAG 2.2 AA (axe-core) des écrans principaux, en thème clair et sombre.
 * Critère de sortie de la Phase 6 : aucune violation. Ne remplace pas le test au lecteur d'écran
 * (docs/design-system.md), mais empêche les régressions (contraste, noms accessibles, ARIA…).
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page, name: string) {
  // Laisser finir les transitions (toasts, dialogues) avant de mesurer les contrastes.
  await page.waitForTimeout(300);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${n.failureSummary}`),
  }));
  expect(summary, `${name} : violations axe`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`thème ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('pages publiques', async ({ page }) => {
      for (const path of [
        '/login',
        '/register',
        '/forgot-password',
        '/privacy',
        '/about',
        '/status',
      ]) {
        await page.goto(path);
        await audit(page, path);
      }
    });

    test('onboarding', async ({ page }) => {
      await page.goto('/register');
      await page.getByLabel('Prénom').fill('Grace');
      await page
        .getByLabel('Adresse email')
        .fill(`a11y.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`);
      await page.getByLabel('Mot de passe').fill('correct horse battery');
      await page.getByRole('button', { name: 'Créer mon compte' }).click();
      await expect(page).toHaveURL(/\/onboarding/);
      await expect(page.getByLabel('Votre prénom dans le foyer')).toHaveValue('Grace');
      await audit(page, 'Onboarding : foyer');
      await page.getByLabel('Nom du foyer').fill('G & N');
      await page.getByRole('button', { name: 'Créer le foyer' }).click();
      await expect(page.getByRole('heading', { name: /Inviter votre partenaire/ })).toBeFocused();
      await audit(page, 'Onboarding : invitation');
    });

    test('application', async ({ page }) => {
      // Un audit axe par page (19 écrans, ~1,5 s chacun) : 30 s ne suffisent plus sur la CI.
      test.setTimeout(90_000);
      await signUpWithHousehold(page, 'Grace');
      const today = todayBrussels();
      const households = await (await page.request.get('/v1/households')).json();
      const hid = households[0].id as string;
      const headers = { 'x-requested-with': 'tandem' };
      for (const data of [
        { title: 'Sortir les poubelles', date: today, startMinute: 19 * 60 },
        { title: 'Arroser les plantes', date: today, durationMinutes: 15 },
        { title: 'Réserver le garage' },
      ]) {
        await page.request.post(`/v1/households/${hid}/tasks`, { headers, data });
      }
      await page.reload();
      await expect(page.getByText('Sortir les poubelles').first()).toBeVisible();
      await audit(page, "Aujourd'hui");

      for (const path of [
        '/tasks',
        '/shopping',
        `/calendar?view=week&date=${today}`,
        `/calendar?view=day&date=${today}`,
        `/calendar?view=month&date=${today}`,
        '/stats',
        '/expenses',
        '/notes',
        '/dates',
        '/meals',
        '/more',
        '/review',
        '/history',
        '/settings',
        '/report',
      ]) {
        await page.goto(path);
        // Pas de « networkidle » : le flux temps réel reste ouvert. On attend la fin des chargements.
        await page.waitForLoadState('load');
        await expect(page.locator('[aria-busy="true"], [aria-busy=""]')).toHaveCount(0);
        await audit(page, path);
      }

      await page.goto('/');
      await page.getByRole('button', { name: "Plus d'options" }).click();
      await expect(page.getByRole('dialog', { name: 'Nouvelle tâche' })).toBeVisible();
      await audit(page, 'Formulaire nouvelle tâche');
    });
  });
}
