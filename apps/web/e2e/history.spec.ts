import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

const HEADERS = { 'x-requested-with': 'tandem' };

test('supprimer, annuler ; corbeille, journal et export', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  const households = await (await page.request.get('/v1/households')).json();
  const hid = households[0].id as string;
  await page.request.post(`/v1/households/${hid}/tasks`, {
    headers: HEADERS,
    data: { title: 'Payer la facture', date: todayBrussels() },
  });
  await page.reload();
  const today = page.getByRole('list', { name: "Aujourd'hui" });
  const open = () => today.getByRole('button', { name: /Payer la facture/ }).click();
  const remove = async () => {
    await open();
    page.once('dialog', (d) => void d.accept());
    await page
      .getByRole('dialog', { name: 'Modifier la tâche' })
      .getByRole('button', { name: 'Supprimer' })
      .click();
    await expect(page.getByText('Tâche supprimée')).toBeVisible();
    await expect(today.getByText('Payer la facture')).toBeHidden();
  };

  // « Annuler » dans le toast.
  await remove();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByText('Tâche restaurée.')).toBeVisible();
  await expect(today.getByText('Payer la facture')).toBeVisible();

  // Corbeille.
  await remove();
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Ouvrir le journal' }).click();
  await expect(page.getByRole('heading', { name: 'Journal et corbeille' })).toBeVisible();
  await expect(page.getByText('a supprimé « Payer la facture »').first()).toBeVisible();
  await expect(page.getByText('a restauré « Payer la facture »')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter (CSV)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^agenda-journal-\d{4}-\d{2}-\d{2}\.csv$/);

  await page.getByRole('radio', { name: 'Corbeille' }).click();
  await page.getByRole('button', { name: 'Restaurer « Payer la facture »' }).click();
  await expect(page.getByText('« Payer la facture » restaurée.')).toBeVisible();
  await expect(page.getByText('La corbeille est vide.')).toBeVisible();
  await page.goto('/');
  await expect(today.getByText('Payer la facture')).toBeVisible();
});
