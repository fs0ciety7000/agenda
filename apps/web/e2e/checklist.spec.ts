import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

test('liste de courses : créer avec des éléments, cocher, ajouter, retirer', async ({ page }) => {
  await signUpWithHousehold(page, 'Grace');
  await page.getByRole('button', { name: "Plus d'options" }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  await dialog.getByLabel('Titre').fill('Courses');
  await dialog.getByLabel('Date', { exact: true }).fill(todayBrussels());
  const item = dialog.getByLabel('Nouvel élément de la liste');
  for (const text of ['Lait', 'Pain', 'Café']) {
    await item.fill(text);
    await item.press('Enter'); // ajoute l'élément, n'enregistre pas la tâche
  }
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Retirer « Café »' }).click();
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(dialog).toBeHidden();

  const row = page
    .getByRole('list', { name: "Aujourd'hui" })
    .getByRole('listitem')
    .filter({ hasText: 'Courses' });
  await expect(row.getByText('Liste : 0 sur 2 cochés')).toBeAttached();

  await row
    .getByRole('button', { name: /Courses/ })
    .last()
    .click();
  const edit = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await edit.getByRole('checkbox', { name: 'Lait' }).click();
  await expect(edit.getByRole('checkbox', { name: 'Lait' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await edit.getByLabel('Nouvel élément de la liste').fill('Beurre');
  await edit.getByRole('button', { name: 'Mettre dans la liste' }).click();
  await expect(edit.getByRole('checkbox', { name: 'Beurre' })).toBeVisible();
  await expect(edit.getByText('1 sur 3')).toBeVisible();
  await page.keyboard.press('Escape');

  // Enregistré sans cliquer sur « Enregistrer » : visible après rechargement.
  await page.reload();
  await expect(
    page.getByRole('list', { name: "Aujourd'hui" }).getByText('Liste : 1 sur 3 cochés'),
  ).toBeAttached();
});
