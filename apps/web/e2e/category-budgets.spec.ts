import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

test('budget par catégorie : le fixer, voir la jauge se remplir, l’alerte dans la cloche de l’autre', async ({
  page,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Grace');
  const partner = await addPartner(page, baseURL!, 'Nicolas');
  const hid = partner.householdId as string;
  const members = partner.members as { id: string; displayName: string }[];
  const grace = members.find((m) => m.displayName === 'Grace')!;

  await page.goto('/expenses');
  await page.getByRole('button', { name: 'Fixer un budget par catégorie' }).click();
  const dialog = page.getByRole('dialog', { name: 'Budgets par catégorie' });
  await dialog.getByLabel('Courses').fill('100');
  await dialog.getByLabel('Loisirs et sorties').fill('abc');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  // Montant invalide : le champ en erreur prend le focus.
  await expect(dialog.getByLabel('Loisirs et sorties')).toBeFocused();
  await dialog.getByLabel('Loisirs et sorties').fill('');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  await page.request.post(`/v1/households/${hid}/expenses`, {
    headers: { 'x-requested-with': 'tandem' },
    data: {
      paidById: grace.id,
      amountCents: 8500,
      date: todayBrussels(),
      title: 'Supermarché',
      category: 'GROCERIES',
    },
  });
  await page.reload();
  const gauges = page.getByRole('list', { name: 'Budgets par catégorie' });
  await expect(gauges.getByText('85,00 € sur 100,00 €')).toBeVisible();
  await expect(gauges.getByRole('meter', { name: 'Budget Courses' })).toHaveAttribute(
    'aria-valuetext',
    /85/,
  );
  await expect(page.getByRole('button', { name: 'Budgets par catégorie' })).toBeVisible();

  // Nicolas a reçu l'alerte des 80 %.
  const bell = await (
    await fetch(`${baseURL}/v1/households/${hid}/notifications`, { headers: partner.headers })
  ).json();
  expect(bell.items[0]).toMatchObject({ type: 'EXPENSE_BUDGET', category: 'GROCERIES', level: 80 });
});
