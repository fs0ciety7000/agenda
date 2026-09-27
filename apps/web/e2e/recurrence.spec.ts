import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

test('tâche récurrente avec rotation, modification d’une occurrence, suppression de la série', async ({
  page,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Grace');
  await addPartner(page, baseURL!);
  await page.reload();

  // Création : chaque semaine, chacun son tour en commençant par Grace.
  await page.getByRole('button', { name: "Plus d'options" }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  await dialog.getByLabel('Titre').fill('Nettoyer la salle de bain');
  await dialog.getByLabel('Date', { exact: true }).fill(todayBrussels());
  await dialog.getByLabel('Heure').fill('10:00');
  await dialog.getByLabel('Répéter').selectOption('weekly');
  await dialog
    .getByLabel('Qui s’en occupe ?')
    .or(dialog.getByLabel("Qui s'en occupe ?"))
    .selectOption('alternate');
  await expect(dialog.getByRole('radiogroup', { name: 'Responsable' })).toBeHidden();

  // Aperçu calculé par l'API : alternance Grace / Nicolas.
  const preview = dialog.getByText('Prochaines fois').locator('..').getByRole('listitem');
  await expect(preview).toHaveCount(5);
  await expect(preview.nth(0)).toContainText('Grace');
  await expect(preview.nth(1)).toContainText('Nicolas');
  await expect(preview.nth(2)).toContainText('Grace');
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  // Aujourd'hui : l'occurrence du jour, attribuée à Grace.
  const today = page.getByRole('list', { name: "Aujourd'hui" });
  await expect(today.getByText('Nettoyer la salle de bain')).toBeVisible();
  await expect(today.getByText('Tâche récurrente')).toBeAttached();

  // Modifier uniquement cette occurrence.
  await today.getByRole('button', { name: /Nettoyer la salle de bain/ }).click();
  const edit = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await expect(edit.getByLabel('Répéter')).toHaveValue('weekly');
  await edit.getByLabel('Heure').fill('14:00');
  await edit.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(edit.getByText('Cette tâche se répète. Que voulez-vous modifier ?')).toBeVisible();
  await edit.getByLabel('Uniquement cette occurrence').check();
  await edit.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(edit).toBeHidden();
  await expect(today.getByText('14:00')).toBeVisible();

  // Onglet Récurrentes.
  await page.getByRole('link', { name: 'Tâches' }).first().click();
  await page.getByRole('link', { name: 'Récurrentes' }).click();
  await expect(page.getByText('Chaque semaine le', { exact: false })).toBeVisible();
  await expect(page.getByText('chacun son tour : Grace → Nicolas', { exact: false })).toBeVisible();

  // Calendrier : l'occurrence apparaît en bloc.
  await page.getByRole('link', { name: 'Calendrier' }).first().click();
  await expect(
    page.getByRole('button', { name: /Nettoyer la salle de bain/ }).first(),
  ).toBeVisible();

  // Supprimer toute la série. Un rafraîchissement du calendrier (temps réel) pendant le toucher
  // peut avaler un tap sur mobile : on retape, comme le ferait quelqu'un.
  const del = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await expect(async () => {
    await page
      .getByRole('button', { name: /Nettoyer la salle de bain/ })
      .first()
      .click();
    await expect(del).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await del.getByRole('button', { name: 'Supprimer' }).click();
  await del.getByLabel('Toute la série').check();
  await del.getByRole('button', { name: 'Supprimer' }).click();
  await expect(del).toBeHidden();
  await expect(page.getByRole('button', { name: /Nettoyer la salle de bain/ })).toHaveCount(0);
});

test('calendrier : vues jour / semaine / mois et création sur un créneau', async ({ page }) => {
  await signUpWithHousehold(page, 'Nicolas');
  await page.getByRole('link', { name: 'Calendrier' }).first().click();
  await page.getByRole('radio', { name: 'Semaine' }).click();
  await expect(page.getByRole('heading', { name: /Semaine du/ })).toBeVisible();
  await page.getByRole('button', { name: 'Nouvelle tâche à 09:00' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  await expect(dialog.getByLabel('Heure')).toHaveValue('09:00');
  await dialog.getByLabel('Titre').fill('Rendez-vous plombier');
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByRole('button', { name: /Rendez-vous plombier/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Mois' }).click();
  await expect(page.getByRole('button', { name: /Rendez-vous plombier/ })).toBeVisible();
});

test('mot de passe oublié : message neutre (pas d’énumération des comptes)', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
  await page.getByLabel('Adresse email').fill('personne@example.test');
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByText('Si un compte existe pour cette adresse')).toBeVisible();
});

test('répétition « après la dernière fois » : la suivante part du jour où c’est fait', async ({
  page,
}) => {
  await signUpWithHousehold(page, 'Grace');
  await page.getByRole('button', { name: "Plus d'options" }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  await dialog.getByLabel('Titre').fill('Détartrer la bouilloire');
  await dialog.getByLabel('Date', { exact: true }).fill(todayBrussels());
  await dialog.getByLabel('Répéter').selectOption('after');
  await dialog.getByLabel('Tous les').fill('3');
  await dialog.getByLabel('Unité').selectOption('WEEK');
  await expect(dialog.getByText('à partir du jour où la tâche est faite')).toBeVisible();
  await expect(dialog.getByText('Prochaines fois')).toBeHidden();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  const today = page.getByRole('list', { name: "Aujourd'hui" });
  await today.getByRole('checkbox', { name: /Détartrer la bouilloire/ }).click();

  // Onglet Récurrentes : règle lisible et prochaine date dans 3 semaines.
  await page.getByRole('link', { name: 'Tâches' }).first().click();
  await page.getByRole('link', { name: 'Récurrentes' }).click();
  await expect(page.getByText('3 semaines après la dernière fois')).toBeVisible();

  // La suivante indique la dernière fois.
  await page.getByRole('link', { name: 'À venir' }).click();
  await page.getByRole('button', { name: /Détartrer la bouilloire/ }).click();
  const edit = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await expect(edit.getByLabel('Répéter')).toHaveValue('after');
  await expect(edit.getByText(/Fait .* par Grace/)).toBeVisible();
});
