import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

test('dates importantes : ajouter, retrouver sur Aujourd’hui, date unique sans année refusée, supprimer', async ({
  page,
}, info) => {
  await signUpWithHousehold(page, 'Grace');
  const target = plusDays(todayBrussels(), 5);
  const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(
    target,
  );

  if (info.project.name === 'mobile') {
    await page.getByRole('link', { name: 'Plus' }).click();
    await page.getByRole('link', { name: /^Dates importantes/ }).click();
  } else {
    await page.getByRole('link', { name: 'Dates' }).first().click();
  }
  await expect(page.getByText('Aucune date pour l’instant.')).toBeVisible();

  await page.getByRole('button', { name: 'Nouvelle date' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle date' });
  await dialog.getByLabel('Titre').fill('Anniversaire de mamie');
  await dialog.getByLabel('Jour').selectOption(String(target.getUTCDate()));
  await dialog.getByLabel('Mois').selectOption({ label: monthName });
  await dialog.getByLabel('Année (facultatif)').fill('1950');
  await dialog.getByLabel('Rappel').selectOption({ label: '3 jours avant' });
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText('Date ajoutée')).toBeVisible();
  const list = page.getByRole('list', { name: 'Dates importantes' });
  await expect(list.getByText('Anniversaire de mamie')).toBeVisible();
  await expect(list.getByText(/dans 5 jours · \d+ ans/)).toBeVisible();
  await expect(list.getByText('3 j avant')).toBeVisible();

  // Date unique : l'année est obligatoire, le champ en erreur prend le focus.
  await page.getByRole('button', { name: 'Nouvelle date' }).click();
  await dialog.getByLabel('Titre').fill('Contrôle technique');
  await dialog.getByLabel('Chaque année').uncheck();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog.getByLabel('Année', { exact: true })).toBeFocused();
  await expect(dialog.getByText('Indiquez l’année d’une date qui ne se répète pas.')).toBeVisible();
  await page.keyboard.press('Escape');

  // Sur Aujourd'hui, dans « Bientôt ».
  await page.goto('/');
  const soon = page.getByRole('region', { name: 'Bientôt' });
  await expect(soon.getByText('Anniversaire de mamie')).toBeVisible();
  await expect(soon.getByText('dans 5 jours')).toBeVisible();

  await page.goto('/dates');
  await list.getByRole('button', { name: /Anniversaire de mamie/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('« Anniversaire de mamie » supprimée')).toBeVisible();
  await expect(page.getByText('Aucune date pour l’instant.')).toBeVisible();
});
