import { expect, test } from '@playwright/test';
import { openSettings, signUpWithHousehold } from './helpers';

test('bilan du mois des dépenses : réglable dans les préférences de notification', async ({
  page,
}) => {
  await signUpWithHousehold(page, 'Emma');
  await openSettings(page, 'Préférences');
  const label = 'Bilan des dépenses du mois écoulé, le 1er';
  await expect(page.getByRole('rowheader', { name: label })).toBeVisible();
  const push = page.getByRole('checkbox', { name: `${label} — Notification` });
  await expect(push).toBeChecked();
  // Case contrôlée : elle change quand le serveur a répondu.
  await push.click();
  await expect(push).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: `${label} — Notification` })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: `${label} — Dans l'app` })).toBeChecked();
});
