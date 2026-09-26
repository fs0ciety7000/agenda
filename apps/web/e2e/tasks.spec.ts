import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

test('quick add → aujourd’hui → cocher / annuler → modifier → rechercher', async ({ page }) => {
  await signUpWithHousehold(page);
  const quickAdd = page.getByLabel('Ajouter une tâche rapidement');

  // Aperçu pendant la frappe, puis création avec Entrée.
  await quickAdd.fill("Faire les courses aujourd'hui 18h #courses");
  await expect(page.locator('#quick-add-preview')).toContainText('18:00');
  await expect(page.locator('#quick-add-preview')).toContainText('Courses');
  await quickAdd.press('Enter');
  await expect(quickAdd).toHaveValue('');

  const today = page.getByRole('list', { name: "Aujourd'hui" });
  await expect(today.getByText('Faire les courses')).toBeVisible();
  await expect(today.getByText('18:00')).toBeVisible();

  // Cocher, puis annuler depuis le toast.
  const check = today.getByRole('checkbox', { name: 'Marquer « Faire les courses » comme faite' });
  await check.click();
  await expect(
    today.getByRole('checkbox', { name: 'Marquer « Faire les courses » comme à faire' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(check).toHaveAttribute('aria-checked', 'false');

  // Tâche de demain → section « Cette semaine », répartition mise à jour.
  await quickAdd.fill('Sortir les poubelles demain 19h');
  await quickAdd.press('Enter');
  await expect(
    page.getByRole('list', { name: /demain/i }).getByText('Sortir les poubelles'),
  ).toBeVisible();
  // Répartition de la semaine en cours : le dimanche, « demain » tombe la semaine suivante.
  const sunday = new Date(`${todayBrussels()}T12:00:00Z`).getUTCDay() === 0;
  await expect(page.getByText(sunday ? '1 tâche' : '2 tâches', { exact: true })).toBeVisible();

  // Modifier depuis le formulaire.
  await today.getByRole('button', { name: /Faire les courses/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await dialog.getByLabel('Titre').fill('Faire les courses du week-end');
  await dialog.getByRole('radio', { name: 'À définir' }).click();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(today.getByText('Faire les courses du week-end')).toBeVisible();
  await expect(today.getByText('À définir')).toBeVisible();

  // Vue Tâches : recherche.
  await page.getByRole('link', { name: 'Tâches' }).first().click();
  await expect(page.getByRole('heading', { name: 'Tâches' })).toBeVisible();
  await page.getByLabel('Rechercher').fill('poubelles');
  await expect(page.getByText('Sortir les poubelles', { exact: true })).toBeVisible();
  await expect(page.getByText('Faire les courses du week-end', { exact: true })).toBeHidden();
});

test('création via le formulaire complet : tâche personnelle', async ({ page }) => {
  await signUpWithHousehold(page, 'Nicolas');
  await page.getByRole('button', { name: "Plus d'options" }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  await dialog.getByLabel('Titre').fill('Préparer une surprise');
  await dialog.getByLabel('Tâche personnelle').check();
  await expect(dialog.getByRole('radiogroup', { name: 'Responsable' })).toBeHidden();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('link', { name: 'Tâches' }).first().click();
  await page.getByRole('link', { name: 'Personnelles' }).click();
  await expect(page.getByText('Préparer une surprise')).toBeVisible();
  await expect(page.getByText('Personnel', { exact: false }).first()).toBeVisible();
});
