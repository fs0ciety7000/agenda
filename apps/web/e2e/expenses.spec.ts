import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold } from './helpers';

test('dépenses : une dépense commune, le solde, le remboursement', async ({
  page,
  baseURL,
}, info) => {
  await signUpWithHousehold(page, 'Grace');
  await addPartner(page, baseURL!, 'Nicolas');
  await page.goto('/');
  // Mobile : « Plus » → Dépenses ; desktop : menu latéral.
  if (info.project.name === 'mobile') {
    await page.getByRole('link', { name: 'Plus', exact: true }).click();
    await page.getByRole('link', { name: /^Dépenses/ }).click();
  } else {
    await page.getByRole('link', { name: 'Dépenses', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Dépenses', level: 1 })).toBeVisible();
  await expect(page.getByText('Aucune dépense ce mois-ci')).toBeVisible();
  await expect(page.getByText('Vous êtes à l’équilibre.')).toBeVisible();

  await page.getByRole('button', { name: 'Dépense', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Montant (€)').fill('80,50');
  await dialog.getByLabel('Quoi ?').fill('Courses de la semaine');
  await dialog.getByLabel('Catégorie').selectOption('GROCERIES');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText('Courses de la semaine')).toBeVisible();
  await expect(page.getByText('Payé par Grace · commune')).toBeVisible();
  await expect(page.getByText(/Nicolas doit 40,25\s€ à Grace/)).toBeVisible();

  await page.getByRole('button', { name: 'Enregistrer le remboursement' }).click();
  await expect(page.getByText('Vous êtes à l’équilibre.')).toBeVisible();
  await expect(page.getByText('Remboursement', { exact: true })).toBeVisible();
});

test('dépenses : parts à la main, charge fixe, ticket, lien depuis les courses', async ({
  page,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Grace');
  await addPartner(page, baseURL!, 'Nicolas');
  await page.goto('/expenses');
  const dialog = page.getByRole('dialog');

  // Restaurant : 90 €, 30 pour Grace et 60 pour Nicolas.
  await page.getByRole('button', { name: 'Dépense', exact: true }).first().click();
  await dialog.getByLabel('Montant (€)').fill('90');
  await dialog.getByLabel('Quoi ?').fill('Restaurant');
  await dialog.getByRole('radio', { name: 'À la main' }).click();
  await dialog.getByLabel('Part de Grace (€)').fill('30');
  await expect(dialog.getByText(/Reste à répartir/)).toBeVisible();
  await dialog.getByLabel('Part de Nicolas (€)').fill('60');
  await expect(dialog.getByText('Le compte est bon.')).toBeVisible();
  await dialog.getByLabel('Joindre le ticket (photo ou PDF)').setInputFiles({
    name: 'ticket.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
  });
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Payé par Grace · parts à la main')).toBeVisible();
  await expect(page.getByText('Ticket', { exact: true })).toBeVisible();
  await expect(page.getByText(/Nicolas doit 60,00\s€ à Grace/)).toBeVisible();

  // Loyer chaque mois, payé par Nicolas.
  await page.getByRole('button', { name: 'Dépense', exact: true }).first().click();
  await dialog.getByLabel('Montant (€)').fill('900');
  await dialog.getByLabel('Quoi ?').fill('Loyer');
  await dialog.getByRole('radio', { name: 'Nicolas', exact: true }).click();
  await dialog.getByLabel('Chaque mois').check();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Charges fixes' })).toBeVisible();
  await expect(page.getByText(/Le \d+ de chaque mois · payé par Nicolas/)).toBeVisible();

  // Retour des courses : « Noter la dépense » ouvre le formulaire prérempli.
  await page.goto('/shopping');
  await page.getByRole('textbox', { name: 'Ajouter à la liste' }).fill('Pain');
  await page.keyboard.press('Enter');
  await page.getByRole('checkbox', { name: 'Pain' }).click();
  await page.getByRole('button', { name: 'Vider le panier' }).click();
  await page.getByRole('button', { name: 'Noter la dépense' }).click();
  await expect(page).toHaveURL(/\/expenses/);
  await expect(dialog.getByLabel('Quoi ?')).toHaveValue('Courses');
  await expect(dialog.getByLabel('Catégorie')).toHaveValue('GROCERIES');
});

test('dépenses : budget commun, évolution sur 6 mois, export CSV', async ({ page, baseURL }) => {
  await signUpWithHousehold(page, 'Grace');
  await addPartner(page, baseURL!, 'Nicolas');
  await page.goto('/expenses');
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Définir un budget' }).click();
  await dialog.getByLabel('Montant par mois (€)').fill('100');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Budget commun : 0,00\s€ sur 100,00\s€/)).toBeVisible();

  await page.getByRole('button', { name: 'Dépense', exact: true }).first().click();
  await dialog.getByLabel('Montant (€)').fill('85');
  await dialog.getByLabel('Quoi ?').fill('Courses');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Budget commun : 85,00\s€ sur 100,00\s€/)).toBeVisible();
  await expect(page.getByText(/85\s% · reste 15,00\s€/)).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Budget commun du mois' })).toHaveAttribute(
    'aria-valuetext',
    /85\s% du budget/,
  );
  await expect(page.getByRole('heading', { name: 'Sur 6 mois' })).toBeVisible();
  await expect(page.getByText(/Repère : budget de 100,00\s€/)).toBeVisible();

  await page.getByRole('button', { name: 'Exporter' }).click();
  await expect(dialog.getByLabel('Du mois')).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Télécharger' }).click();
  expect((await download).suggestedFilename()).toMatch(/^tandem-depenses-\d{4}-\d{2}.*\.csv$/);
});
