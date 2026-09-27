import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('signaler un problème : depuis les Réglages, informations techniques visibles, suivi', async ({
  page,
}) => {
  await signUpWithHousehold(page, 'Grace');
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Signaler un problème' }).click();
  await expect(page.getByRole('heading', { name: 'Signaler un problème', level: 1 })).toBeVisible();

  // Envoi impossible tant que le titre et les détails manquent.
  const send = page.getByRole('button', { name: 'Envoyer' });
  await expect(send).toBeDisabled();

  await page.getByRole('radio', { name: 'Idée' }).click();
  await page.getByLabel('En quelques mots').fill('Pouvoir mettre une tâche en pause');
  await page.getByLabel('Détails').fill('Pendant les vacances, sans la supprimer ni la reporter.');

  // Informations techniques : décochées par défaut, et consultables avant l'envoi.
  const diagnostics = page.getByLabel('Joindre les informations techniques');
  await expect(diagnostics).not.toBeChecked();
  await page.getByText('Voir exactement ce qui sera envoyé').click();
  await expect(page.getByText('/settings', { exact: true })).toBeVisible();
  await diagnostics.check();
  await expect(page.getByLabel(/recontacté/)).not.toBeChecked();

  await send.click();
  await expect(page.getByText(/^Merci ! Votre signalement a bien été envoyé/)).toBeVisible();
  const mine = page.getByRole('region', { name: 'Mes signalements' });
  await expect(mine.getByText('Pouvoir mettre une tâche en pause')).toBeVisible();
  await expect(mine.getByText('Envoyé')).toBeVisible();

  // Retrait : effacé.
  page.once('dialog', (d) => void d.accept());
  await mine.getByRole('button', { name: /Retirer/ }).click();
  await expect(page.getByRole('region', { name: 'Mes signalements' })).toBeHidden();
});
