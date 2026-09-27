import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('commentaires : ajouter, compteur dans la liste, supprimer', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  await page.getByLabel('Ajouter une tâche rapidement').fill("Vidange aujourd'hui");
  await page.keyboard.press('Enter');
  const today = page.getByRole('list', { name: "Aujourd'hui" });
  await today.getByRole('button', { name: /Vidange/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await dialog.getByLabel('Ajouter un commentaire…').fill('Le bidon est au garage');
  await dialog.getByRole('button', { name: 'Envoyer le commentaire' }).click();
  const thread = dialog.getByRole('list', { name: 'Commentaires' });
  await expect(thread).toContainText('Le bidon est au garage');
  await expect(thread).toContainText('Grace');
  await expect(dialog.getByLabel('Ajouter un commentaire…')).toHaveValue('');

  await page.keyboard.press('Escape');
  await expect(today.getByText('1 commentaire')).toBeAttached();

  await today.getByRole('button', { name: /Vidange/ }).click();
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Supprimer mon commentaire' }).click();
  await expect(dialog.getByRole('list', { name: 'Commentaires' })).toBeHidden();
});
