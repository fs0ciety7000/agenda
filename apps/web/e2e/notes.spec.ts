import { expect, test } from '@playwright/test';
import { addPartner, signUpWithHousehold } from './helpers';

test('notes partagées : créer, épingler, modifier ; conflit avec l’autre ; supprimer et annuler', async ({
  page,
  baseURL,
}, info) => {
  await signUpWithHousehold(page, 'Grace');
  const partner = await addPartner(page, baseURL!, 'Nicolas');
  const hid = partner.householdId as string;

  // Depuis « Plus » sur téléphone, depuis le menu sur ordinateur.
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Plus', exact: true }).click();
    await page.getByRole('link', { name: /^Notes/ }).click();
  } else {
    await page.getByRole('link', { name: 'Notes' }).first().click();
  }
  await expect(page.getByText('Aucune note pour l’instant.')).toBeVisible();

  await page.getByRole('button', { name: 'Nouvelle note' }).click();
  let dialog = page.getByRole('dialog', { name: 'Nouvelle note' });
  await dialog.getByLabel('Titre').fill('Wi-Fi');
  await dialog.getByLabel('Contenu').fill('Réseau : Maison\nCode : 1234');
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText('Note ajoutée')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wi-Fi' })).toBeVisible();

  // Nicolas en ajoute une ; elle arrive (temps réel), puis Grace épingle la sienne en tête.
  await fetch(`${baseURL}/v1/households/${hid}/notes`, {
    method: 'POST',
    headers: partner.headers,
    body: JSON.stringify({ title: 'Idées cadeaux', body: 'Livre de cuisine' }),
  });
  await expect(page.getByRole('heading', { name: 'Idées cadeaux' })).toBeVisible();
  const titles = page.getByRole('list', { name: 'Notes' }).getByRole('heading');
  await expect(titles).toHaveText(['Idées cadeaux', 'Wi-Fi']);
  await page.getByRole('button', { name: 'Épingler « Wi-Fi »' }).click();
  await expect(titles).toHaveText([/Wi-Fi/, 'Idées cadeaux']);
  await expect(page.getByRole('button', { name: 'Désépingler « Wi-Fi »' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Conflit : Nicolas modifie pendant que Grace édite.
  await page.getByRole('button', { name: 'Modifier « Wi-Fi »' }).click();
  dialog = page.getByRole('dialog', { name: 'Modifier la note' });
  const list = await (
    await fetch(`${baseURL}/v1/households/${hid}/notes`, { headers: partner.headers })
  ).json();
  const wifi = list.find((n: { title: string }) => n.title === 'Wi-Fi');
  await fetch(`${baseURL}/v1/households/${hid}/notes/${wifi.id}`, {
    method: 'PATCH',
    headers: partner.headers,
    body: JSON.stringify({ body: 'Code : 9999', version: wifi.version }),
  });
  await dialog.getByLabel('Contenu').fill('Code : 5678');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByRole('alert')).toContainText('modifiée entre-temps');
  await expect(dialog.getByLabel('Contenu')).toHaveValue('Code : 9999');
  await dialog.getByLabel('Contenu').fill('Code : 5678');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Note enregistrée')).toBeVisible();
  await expect(page.getByText('Code : 5678')).toBeVisible();

  // Supprimer, puis annuler.
  await page.getByRole('button', { name: 'Modifier « Idées cadeaux »' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('« Idées cadeaux » supprimée')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Idées cadeaux' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('heading', { name: 'Idées cadeaux' })).toBeVisible();
});
