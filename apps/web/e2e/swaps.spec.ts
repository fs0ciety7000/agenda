import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

test('échange de tour : proposer sa tâche, puis accepter une demande reçue', async ({
  page,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Grace');
  const partner = await addPartner(page, baseURL!, 'Nicolas');
  const hid = partner.householdId as string;
  const members = partner.members as { id: string; displayName: string }[];
  const grace = members.find((m) => m.displayName === 'Grace')!;
  const nico = members.find((m) => m.displayName === 'Nicolas')!;
  const H = { 'x-requested-with': 'tandem' };
  const today = todayBrussels();

  // Grace propose sa vaisselle à Nicolas depuis la fiche de la tâche.
  await page.request.post(`/v1/households/${hid}/tasks`, {
    headers: H,
    data: { title: 'Vaisselle', date: today, assigneeIds: [grace.id] },
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Vaisselle/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Modifier la tâche' });
  await dialog.getByRole('button', { name: 'Proposer à Nicolas' }).click();
  await dialog.getByLabel('Un mot (facultatif)').fill('Je rentre tard');
  await dialog.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByText('Demande envoyée à Nicolas.')).toBeVisible();
  await expect(dialog.getByText('Demande envoyée à Nicolas, en attente de réponse.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('En attente de Nicolas : « Vaisselle »')).toBeVisible();

  // Nicolas propose « Poubelles » à Grace : elle l'accepte depuis Aujourd'hui.
  const task = await (
    await fetch(`${baseURL}/v1/households/${hid}/tasks`, {
      method: 'POST',
      headers: partner.headers,
      body: JSON.stringify({ title: 'Poubelles', date: today, assigneeIds: [nico.id] }),
    })
  ).json();
  await fetch(`${baseURL}/v1/households/${hid}/occurrences/${task.id}/swap`, {
    method: 'POST',
    headers: partner.headers,
    body: JSON.stringify({ toMemberId: grace.id, note: 'Merci !' }),
  });
  await page.reload();
  await expect(page.getByText('Nicolas vous demande de prendre « Poubelles »')).toBeVisible();
  await page.getByRole('button', { name: 'Je la prends' }).click();
  await expect(page.getByText('« Poubelles » est pour vous.')).toBeVisible();
  await expect(page.getByText('Nicolas vous demande de prendre « Poubelles »')).toHaveCount(0);
  const o = await (await page.request.get(`/v1/households/${hid}/occurrences/${task.id}`)).json();
  expect(o.assigneeIds).toEqual([grace.id]);
});
