import { expect, test } from '@playwright/test';
import { openSettings, signUpWithHousehold } from './helpers';

test('réglages : un sommaire en quatre rubriques, chacune sur sa page', async ({ page }) => {
  await signUpWithHousehold(page, 'Emma');
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  for (const [name, heading, inside] of [
    ['Foyer', 'Foyer', 'Catégories'],
    ['Compte et sécurité', 'Compte et sécurité', 'Connexion'],
    ['Préférences', 'Préférences', 'Notifications'],
    ['Données et aide', 'Données et aide', 'Sauvegarde du foyer'],
  ] as const) {
    await page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: inside })).toBeVisible();
    // Retour au sommaire par le lien en tête de page.
    await page.getByRole('main').getByRole('link', { name: 'Réglages', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
  }
  // Plus d'Administration dans les Réglages.
  await expect(page.getByText('Administration')).toHaveCount(0);
});

test('anciens liens des Réglages : renvoyés vers la bonne rubrique', async ({ page }) => {
  await signUpWithHousehold(page, 'Emma');
  await page.goto('/settings#s-account');
  await expect(page).toHaveURL(/\/settings\/account$/);
  await page.goto('/settings?calendarError=GOOGLE_DENIED');
  await expect(page).toHaveURL(/\/settings\/preferences/);
});

test('administration : tuile du tiroir « Plus » et lien latéral, pour l’admin seulement', async ({
  page,
  isMobile,
}) => {
  await signUpWithHousehold(page, 'Emma');
  const nav = async () => {
    if (isMobile) {
      await page.getByRole('button', { name: 'Plus', exact: true }).click();
      return page.getByRole('dialog', { name: 'Plus' });
    }
    return page.getByRole('navigation', { name: 'Navigation principale' }).first();
  };
  await expect((await nav()).getByRole('link', { name: 'Administration' })).toHaveCount(0);
  if (isMobile) await page.keyboard.press('Escape');

  // Compte admin simulé (ADMIN_EMAILS n'est pas réglé en test).
  await page.route('**/v1/me', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), isAdmin: true } });
  });
  await page.reload();
  await (await nav()).getByRole('link', { name: 'Administration' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});
