import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

// La réception (webhook Resend signé + lecture du message) est couverte par les tests
// d'intégration de l'API ; ici, le réglage de l'adresse personnelle.
test('ajouter par e-mail : créer, remplacer et désactiver son adresse', async ({ page }) => {
  test.skip(!process.env.INBOUND_EMAIL_ADDRESS, 'INBOUND_EMAIL_ADDRESS non configuré');
  await signUpWithHousehold(page, 'Grace');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Créer mon adresse' }).click();
  const input = page.getByRole('textbox', { name: 'Votre adresse pour créer des tâches' });
  await expect(input).toHaveValue(/^[a-f0-9]{32}@/);
  const first = await input.inputValue();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Nouvelle adresse' }).click();
  await expect(input).not.toHaveValue(first);

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Désactiver' }).click();
  await expect(page.getByRole('button', { name: 'Créer mon adresse' })).toBeVisible();
});
