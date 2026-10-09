import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

/** WCAG 2.2 AA (axe-core), comme e2e/a11y.spec.ts. */
async function noViolations(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    name,
  ).toEqual([]);
}

test('courses : lien invité en lecture seule, ouvert sans compte, puis coupé', async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Emma');
  await page.goto('/shopping');
  await page.getByRole('textbox', { name: 'Ajouter à la liste' }).fill('2 kg de pommes, lait');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'lait' })).toBeVisible();

  await page.getByRole('button', { name: 'Partager avec un invité' }).click();
  const dialog = page.getByRole('dialog', { name: 'Lien pour un invité' });
  // Une semaine par défaut : le lien se coupe tout seul.
  await expect(dialog.getByRole('radio', { name: '1 semaine' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dialog.getByRole('button', { name: 'Créer le lien' }).click();
  await expect(dialog.getByText(/^Se coupe tout seul le /)).toBeVisible();
  const field = dialog.getByRole('textbox', { name: 'Lien invité' });
  await expect(field).toHaveValue(/\/guest\/[a-f0-9]{40}$/);
  await expect(dialog.getByText(/Créé le .+ par Emma/)).toBeVisible();
  const url = await field.inputValue();
  await noViolations(page, 'dialogue du lien invité');
  await page.keyboard.press('Escape');
  // Le bouton dit qu'un lien est actif (pas seulement par la pastille de couleur).
  await expect(
    page.getByRole('button', { name: 'Partager avec un invité, Lien invité actif' }),
  ).toBeVisible();

  // L'invité : un autre navigateur, sans session.
  const guest = await browser.newContext({ baseURL, locale: 'fr-BE' });
  const guestPage = await guest.newPage();
  await guestPage.goto(new URL(url).pathname);
  await expect(guestPage).toHaveURL(/\/guest\//); // pas renvoyé vers /login
  await expect(guestPage.getByRole('heading', { name: 'Liste de courses' })).toBeVisible();
  await expect(guestPage.getByText(/Lecture seule/)).toBeVisible();
  await expect(guestPage.getByRole('list', { name: /Fruits/ }).getByText('pommes')).toBeVisible();
  await expect(guestPage.getByText('2 kg')).toBeVisible();
  // Rien à cocher ni à ajouter.
  await expect(guestPage.getByRole('checkbox')).toHaveCount(0);
  await expect(guestPage.getByRole('textbox')).toHaveCount(0);
  for (const colorScheme of ['light', 'dark'] as const) {
    await guestPage.emulateMedia({ colorScheme });
    await noViolations(guestPage, `page invité (${colorScheme})`);
  }

  // Sans limite : le dialogue le rappelle (nouveau lien, l'ancien cesse de fonctionner).
  await page.getByRole('button', { name: /Partager avec un invité/ }).click();
  await dialog.getByRole('radio', { name: 'Sans limite' }).click();
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Nouveau lien' }).click();
  await expect(dialog.getByText(/^Sans limite : pensez à le couper/)).toBeVisible();
  const forever = await field.inputValue();
  expect(forever).not.toBe(url);
  await page.keyboard.press('Escape');

  // Coupé : l'invité voit que le lien ne marche plus.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: /Partager avec un invité/ }).click();
  await dialog.getByRole('button', { name: 'Couper le lien' }).click();
  await expect(dialog.getByRole('button', { name: 'Créer le lien' })).toBeVisible();
  await guestPage.goto(new URL(forever).pathname);
  await expect(guestPage.getByText('Ce lien ne fonctionne plus')).toBeVisible();
  await guest.close();
});
