import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

const HEADERS = { 'x-requested-with': 'tandem' };

test('modèle de tâches : créé dans les Réglages, utilisé depuis Aujourd’hui', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Nouveau modèle' }).click();
  const editor = page.getByRole('dialog', { name: 'Nouveau modèle' });
  await editor.getByRole('textbox', { name: 'Nom', exact: true }).fill('Ménage du samedi');
  await editor.getByRole('textbox', { name: 'Tâche 1', exact: true }).fill('Aspirateur');
  await editor.getByRole('button', { name: 'Ajouter une tâche' }).click();
  await editor.getByRole('textbox', { name: 'Tâche 2', exact: true }).fill('Salle de bain');
  await editor.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByText('Aspirateur · Salle de bain')).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Utiliser un modèle' }).click();
  const use = page.getByRole('dialog', { name: 'Utiliser un modèle' });
  await use.getByRole('button', { name: 'Créer les 2 tâches' }).click();
  await expect(page.getByText('2 tâches ajoutées depuis « Ménage du samedi »')).toBeVisible();
  const today = page.getByRole('list', { name: "Aujourd'hui" });
  await expect(today.getByText('Aspirateur')).toBeVisible();
  await expect(today.getByText('Salle de bain')).toBeVisible();
});

test('historique « fait par » d’une tâche récurrente', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  const households = await (await page.request.get('/v1/households')).json();
  const hid = households[0].id as string;
  const start = new Date(`${todayBrussels()}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 7);
  const startDate = start.toISOString().slice(0, 10);
  const weekday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][start.getUTCDay()];
  await page.request.post(`/v1/households/${hid}/tasks`, {
    headers: HEADERS,
    data: {
      title: 'Sortir les poubelles',
      date: startDate,
      recurrence: { rule: { freq: 'WEEKLY', interval: 1, byWeekday: [weekday] } },
    },
  });
  const past = await (
    await page.request.get(`/v1/households/${hid}/occurrences?view=overdue`)
  ).json();
  await page.request.post(`/v1/households/${hid}/occurrences/${past[0].id}/complete`, {
    headers: HEADERS,
  });
  await page.reload();
  await page
    .getByRole('list', { name: "Aujourd'hui" })
    .getByRole('button', { name: /Sortir les poubelles/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await dialog.getByText('Historique').click();
  await expect(dialog.getByText('Fait par Grace')).toBeVisible();
});
