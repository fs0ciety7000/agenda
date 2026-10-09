import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

test('recherche globale : tâches, notes et courses ; un résultat ouvre la bonne page', async ({
  page,
}) => {
  await signUpWithHousehold(page, 'Grace');
  const me = await page.request.get('/v1/households');
  const hid = ((await me.json()) as { id: string }[])[0]!.id;
  const today = todayBrussels();
  for (const [path, body] of [
    ['tasks', { title: 'Réserver le garage', date: today }],
    ['notes', { title: 'Codes', body: 'Portail 4521, porte du garage 7788' }],
    ['shopping', { text: 'Lave-glace pour le garage' }],
  ] as const) {
    const res = await page.request.post(`/v1/households/${hid}/${path}`, {
      headers: { 'x-requested-with': 'tandem' },
      data: body,
    });
    expect(res.ok()).toBeTruthy();
  }

  await page.goto('/');
  await page.keyboard.press('/');
  const dialog = page.getByRole('dialog', { name: 'Rechercher' });
  await dialog.getByRole('searchbox', { name: 'Rechercher dans le foyer' }).fill('garage');
  await expect(dialog.getByRole('heading', { name: 'Tâches' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Réserver le garage/ })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Codes/ })).toContainText('garage 7788');
  await expect(dialog.getByRole('link', { name: /Lave-glace pour le garage/ })).toContainText(
    'À acheter',
  );

  await dialog.getByRole('link', { name: /Codes/ }).click();
  await page.waitForURL(/\/notes/);
  await expect(dialog).toBeHidden();

  // Rien trouvé : une phrase, pas un écran vide.
  await page.keyboard.press('/');
  await dialog.getByRole('searchbox').fill('zzzz introuvable');
  await expect(dialog.getByText('Rien trouvé pour « zzzz introuvable ».')).toBeVisible();

  // Clavier : à la fermeture (Échap), le focus revient au bouton qui a ouvert la recherche.
  await page.keyboard.press('Escape');
  const open = page.getByRole('button', { name: 'Rechercher' }).locator('visible=true').first();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
});
