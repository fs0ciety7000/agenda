import { expect, test } from '@playwright/test';
import { openSettings, signUpWithHousehold, todayBrussels } from './helpers';

/**
 * Parcours Google Calendar avec le faux Google du mode démo (API lancée avec
 * GOOGLE_CALENDAR_FAKE=true). Sans ce mode, seul l'état « non configuré » est vérifié.
 */
const FAKE = process.env.E2E_FAKE_GOOGLE === '1';

test('calendrier partagé : connecter Google, choisir « Commun G & N », synchroniser une tâche', async ({
  page,
}) => {
  test.skip(!FAKE, 'Nécessite le mode démo Google (E2E_FAKE_GOOGLE=1)');
  await signUpWithHousehold(page, 'Nicolas');
  await openSettings(page);
  await page.getByRole('link', { name: 'Connecter Google Calendar' }).click();

  await expect(page.getByText('Google Calendar connecté.')).toBeVisible();
  const picker = page.getByRole('radiogroup', { name: 'Choisissez le calendrier partagé' });
  await expect(picker.getByRole('radio', { name: 'Commun G & N' })).toBeChecked(); // pré-sélectionné
  await expect(picker.getByRole('radio', { name: /Jours fériés/ })).toBeDisabled(); // lecture seule
  await page.getByRole('button', { name: 'Utiliser ce calendrier' }).click();
  await expect(page.getByText('✓ Commun G & N')).toBeVisible();
  await expect(page.getByText('Google Calendar connecté', { exact: false }).first()).toBeVisible();

  // Nouvelle tâche : la case « Ajouter au calendrier partagé » est cochée par défaut.
  await page.getByRole('link', { name: "Aujourd'hui" }).first().click();
  await page.getByRole('button', { name: "Plus d'options" }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  await dialog.getByLabel('Titre').fill('Sortir les poubelles');
  await dialog.getByLabel('Date', { exact: true }).fill(todayBrussels());
  await dialog.getByLabel('Heure').fill('19:00');
  await expect(dialog.getByLabel('Ajouter au calendrier partagé')).toBeChecked();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();

  // L'indicateur passe de « Synchronisation… » à « Synchronisé » sans recharger la page.
  const row = page
    .getByRole('list', { name: "Aujourd'hui" })
    .getByRole('listitem')
    .filter({ hasText: 'Sortir les poubelles' });
  await expect(row.getByText('Synchronisé', { exact: true })).toBeAttached({ timeout: 15_000 });

  await openSettings(page);
  await expect(page.getByText('1 tâche synchronisée')).toBeVisible();
});

test('calendrier partagé non configuré : message clair', async ({ page }) => {
  test.skip(FAKE, 'Le mode démo rend l’intégration disponible');
  await signUpWithHousehold(page, 'Grace');
  await openSettings(page);
  await expect(
    page.getByText("La connexion à Google Calendar n'est pas activée sur ce serveur."),
  ).toBeVisible();
});

test('calendrier, vue jour : la barre d’ajout met la tâche sur le jour affiché', async ({
  page,
}) => {
  await signUpWithHousehold(page, 'Emma');
  const today = todayBrussels();
  const x = new Date(`${today}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 3);
  const day = x.toISOString().slice(0, 10);
  const weekday = x.toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' });

  await page.goto(`/calendar?view=day&date=${day}`);
  const quickAdd = page.getByLabel('Ajouter une tâche rapidement');
  await expect(quickAdd).toHaveAttribute('placeholder', `Qu'est-ce qu'on fait ${weekday} ?`);
  await quickAdd.fill('Arroser les plantes');
  await quickAdd.press('Enter');
  await expect(quickAdd).toHaveValue('');
  await expect(page.getByRole('button', { name: /Arroser les plantes/ })).toBeVisible();

  // La phrase l'emporte sur le jour affiché : « demain » va à demain, pas au jour affiché.
  await quickAdd.fill('Sortir les poubelles demain');
  await quickAdd.press('Enter');
  await expect(quickAdd).toHaveValue('');
  await expect(page.getByRole('button', { name: /Sortir les poubelles/ })).toHaveCount(0);
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await page.goto(`/calendar?view=day&date=${tomorrow.toISOString().slice(0, 10)}`);
  await expect(page.getByRole('button', { name: /Sortir les poubelles/ })).toBeVisible();
});
