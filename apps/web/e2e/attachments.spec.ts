import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

test('pièces jointes : joindre, ouvrir, supprimer', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  const households = await (await page.request.get('/v1/households')).json();
  const hid = households[0].id as string;
  await page.request.post(`/v1/households/${hid}/tasks`, {
    headers: { 'x-requested-with': 'tandem' },
    data: { title: 'Garantie frigo', date: todayBrussels() },
  });
  await page.reload();
  await page
    .getByRole('list', { name: "Aujourd'hui" })
    .getByRole('button', { name: /Garantie frigo/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Modifier la tâche' });

  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Joindre un fichier' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'facture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 facture'),
  });
  const link = dialog.getByRole('link', { name: 'facture.pdf' });
  await expect(link).toBeVisible();
  const res = await page.request.get((await link.getAttribute('href'))!);
  expect(res.headers()['content-type']).toBe('application/pdf');

  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Supprimer « facture.pdf »' }).click();
  await expect(link).toBeHidden();
});
