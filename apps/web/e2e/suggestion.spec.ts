import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold, todayBrussels } from './helpers';

test('« À définir » : la personne la moins chargée de la semaine est proposée', async ({
  page,
  baseURL,
}) => {
  await signUpWithHousehold(page, 'Grace');
  const partner = await addPartner(page, baseURL!, 'Nicolas');
  const grace = partner.members.find((m) => m.displayName === 'Grace')!;
  // Grace a déjà deux tâches cette semaine, Nicolas aucune.
  for (const title of ['Lessive', 'Courses']) {
    const res = await fetch(`${baseURL}/v1/households/${partner.householdId}/tasks`, {
      method: 'POST',
      headers: partner.headers,
      body: JSON.stringify({
        title,
        date: todayBrussels(),
        durationMinutes: 30,
        assigneeIds: [grace.id],
      }),
    });
    expect(res.status).toBe(201);
  }
  await page.reload();
  await page.getByRole('button', { name: "Plus d'options" }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle tâche' });
  await dialog.getByLabel('Titre').fill('Sortir les poubelles');
  const who = dialog.getByRole('radiogroup', { name: 'Responsable' });
  await who.getByRole('radio', { name: 'À définir' }).click();
  await expect(
    dialog.getByText('Suggestion : Nicolas, la moins chargée cette semaine'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confier à Nicolas' }).click();
  await expect(who.getByRole('radio', { name: 'Nicolas' })).toHaveAttribute('aria-checked', 'true');
});
