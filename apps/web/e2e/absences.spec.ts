import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

test('mode absence : déclarer, bandeau, annuler', async ({ page, baseURL }) => {
  await signUpWithHousehold(page, 'Grace');
  await addPartner(page, baseURL!);
  await page.reload();

  await page.getByRole('link', { name: 'Réglages' }).first().click();
  const section = page.getByRole('region', { name: 'Absences' });
  await section.getByLabel('Qui ?').selectOption({ label: 'Grace' });
  await section.getByLabel('Du').fill(todayBrussels());
  await section.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText('Absence enregistrée')).toBeVisible();
  await expect(section.getByRole('list', { name: 'Absences prévues' })).toContainText('Grace');

  await page.getByRole('link', { name: "Aujourd'hui" }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Grace : absence jusqu' })).toBeVisible();

  await page.getByRole('link', { name: 'Réglages' }).first().click();
  await section.getByRole('button', { name: "Annuler l'absence de Grace" }).click();
  await expect(page.getByText('Absence annulée')).toBeVisible();
  await expect(section.getByRole('list', { name: 'Absences prévues' })).toBeHidden();
});
