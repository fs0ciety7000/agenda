import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test('tableau « qui fait quoi » : une case par personne et par jour, ses tâches au toucher', async ({
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
  const add = (title: string, date: string, assigneeIds: string[]) =>
    page.request.post(`/v1/households/${hid}/tasks`, {
      headers: H,
      data: { title, date, assigneeIds },
    });
  await add('Vaisselle', today, [grace.id]);
  await add('Lessive', today, [grace.id]);
  await add('Poubelles', plusDays(today, 2), [nico.id]);
  await add('Courses du samedi', plusDays(today, 3), [grace.id, nico.id]);

  await page.goto('/');
  const board = page.getByRole('region', { name: 'Qui fait quoi' });
  await expect(board.getByRole('columnheader')).toHaveCount(7);
  await expect(board.getByRole('rowheader', { name: 'Grace' })).toBeVisible();
  await expect(board.getByRole('rowheader', { name: 'Tous les deux' })).toBeVisible();
  // Personne n'est « à définir » : pas de ligne pour rien.
  await expect(board.getByRole('rowheader', { name: 'À définir' })).toHaveCount(0);

  const cell = board.getByRole('button', { name: "Grace, aujourd'hui : 2 tâches" });
  await expect(cell).toHaveText('2');
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(board.getByRole('button', { name: /^Lessive/ })).toBeVisible();
  await expect(board.getByRole('button', { name: /^Vaisselle/ })).toBeVisible();

  await board.getByRole('button', { name: /^Nicolas, .* : 1 tâche$/ }).click();
  await expect(board.getByRole('button', { name: /^Poubelles/ })).toBeVisible();
  await expect(board.getByRole('button', { name: /^Lessive/ })).toHaveCount(0);
});
