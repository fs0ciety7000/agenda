import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

test('notification « tâche confiée » : cloche, ouverture de la tâche, puis bilan', async ({
  page,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Grace');
  const partner = await addPartner(page, baseURL!, 'Nicolas');
  const grace = partner.members.find((m) => m.displayName === 'Grace')!;
  // Nicolas confie une tâche à Grace (depuis son téléphone, par l'API).
  const res = await fetch(`${baseURL}/v1/households/${partner.householdId}/tasks`, {
    method: 'POST',
    headers: partner.headers,
    body: JSON.stringify({
      title: 'Sortir les poubelles',
      date: todayBrussels(),
      assigneeIds: [grace.id],
    }),
  });
  expect(res.status).toBe(201);

  await page.reload();
  const bell = page.getByRole('button', { name: 'Notifications, 1 non lue' });
  await expect(bell).toBeVisible();
  await bell.click();
  await page
    .getByRole('button', { name: /Nicolas vous a confié « Sortir les poubelles »/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Modifier la tâche' })).toBeVisible();
  await expect(page.getByLabel('Titre')).toHaveValue('Sortir les poubelles');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // Cocher la tâche puis consulter le bilan.
  await page
    .getByRole('checkbox', { name: /Sortir les poubelles/ })
    .first()
    .click();
  await page.getByRole('link', { name: 'Bilan' }).first().click();
  await expect(page.getByRole('heading', { name: 'Bilan', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tâches faites par jour' })).toBeVisible();
  await page.getByText('Voir les chiffres').click();
  await expect(page.getByRole('table').getByRole('cell', { name: '1' }).last()).toBeVisible();
});
