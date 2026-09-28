import { expect, test } from '@playwright/test';
import { signUpWithHousehold, todayBrussels } from './helpers';

const HEADERS = { 'x-requested-with': 'tandem' };

test('hors ligne : consulter, cocher, ajouter, recharger ; envoyé au retour du réseau', async ({
  page,
  context,
}) => {
  await signUpWithHousehold(page, 'Grace');
  const households = await (await page.request.get('/v1/households')).json();
  const hid = households[0].id as string;
  await page.request.post(`/v1/households/${hid}/tasks`, {
    headers: HEADERS,
    data: { title: 'Sortir les poubelles', date: todayBrussels() },
  });

  // En ligne : le service worker s'installe et garde les pages visitées.
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const today = page.getByRole('list', { name: "Aujourd'hui" });
  await expect(today.getByText('Sortir les poubelles')).toBeVisible();

  await context.setOffline(true);
  await today.getByRole('checkbox', { name: /Sortir les poubelles/ }).click();
  await expect(today.getByRole('checkbox', { name: /Sortir les poubelles/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const quick = page.getByLabel('Ajouter une tâche rapidement');
  await quick.fill("Arroser les plantes aujourd'hui");
  await quick.press('Enter');
  await expect(
    page.getByText("« Arroser les plantes aujourd'hui » sera ajoutée au retour du réseau."),
  ).toBeVisible();
  await expect(page.getByText('2 modifications en attente.')).toBeVisible();

  // Rechargement sans réseau : page et données viennent du navigateur.
  await page.waitForTimeout(1500); // écriture du cache (regroupée par seconde)
  await page.reload();
  await expect(page.getByText(/^Hors ligne/)).toBeVisible();
  await expect(today.getByRole('checkbox', { name: /Sortir les poubelles/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Retour du réseau : tout part, sans doublon.
  await context.setOffline(false);
  await expect(page.getByText(/^Hors ligne/)).toBeHidden();
  await expect(today.getByText('Arroser les plantes')).toBeVisible();
  const list = await (
    await page.request.get(
      `/v1/households/${hid}/occurrences?from=${todayBrussels()}&to=${todayBrussels()}`,
    )
  ).json();
  const titles = (list as { title: string; status: string }[]).map((o) => [o.title, o.status]);
  expect(titles).toContainEqual(['Sortir les poubelles', 'DONE']);
  expect(titles.filter(([t]) => t === 'Arroser les plantes')).toHaveLength(1);
});
