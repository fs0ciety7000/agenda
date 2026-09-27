import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

const SECRET = process.env.INBOUND_EMAIL_SECRET;

test('ajouter par e-mail : adresse personnelle, e-mail transféré → tâche', async ({ page }) => {
  test.skip(!SECRET, 'INBOUND_EMAIL_SECRET non configuré');
  await signUpWithHousehold(page, 'Grace');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Créer mon adresse' }).click();
  const input = page.getByRole('textbox', { name: 'Votre adresse pour créer des tâches' });
  await expect(input).toHaveValue(/^agenda\+[a-f0-9]{32}@/);
  const address = await input.inputValue();

  // Ce que fait le Worker Cloudflare à la réception.
  const res = await page.request.post('/v1/inbound/email', {
    headers: { authorization: `Bearer ${SECRET}`, 'x-requested-with': 'agenda-gn' },
    data: { to: address, from: 'garage@example.com', subject: 'Fwd: Appeler le garage', text: '' },
  });
  expect(res.status()).toBe(201);
  await page.goto('/tasks');
  await expect(page.getByText('Appeler le garage')).toBeVisible();
});
