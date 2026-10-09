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

  // Historique : la version de Nicolas (9999) est gardée ; on la restaure.
  await page.getByRole('button', { name: 'Modifier « Wi-Fi »' }).click();
  dialog = page.getByRole('dialog', { name: 'Modifier la note' });
  const history = dialog.getByRole('button', { name: 'Versions précédentes' });
  await expect(history).toHaveAttribute('aria-expanded', 'false');
  await history.click();
  await expect(history).toHaveAttribute('aria-expanded', 'true');
  const versions = dialog.getByRole('list', { name: 'Versions précédentes' });
  await expect(versions.getByText('Code : 9999')).toBeVisible();
  await versions
    .getByRole('listitem')
    .filter({ hasText: 'Code : 9999' })
    .getByRole('button', { name: 'Restaurer cette version' })
    .click();
  await expect(page.getByText(/^Version du .* restaurée\.$/)).toBeVisible();
  await expect(dialog.getByLabel('Contenu')).toHaveValue('Code : 9999');
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByText('Code : 9999')).toBeVisible();

  // Supprimer, puis annuler.
  await page.getByRole('button', { name: 'Modifier « Idées cadeaux »' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('« Idées cadeaux » supprimée')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Idées cadeaux' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('heading', { name: 'Idées cadeaux' })).toBeVisible();
});

test('note sensible : contenu masqué, affiché après le mot de passe', async ({ page }) => {
  await signUpWithHousehold(page, 'Emma');
  await page.goto('/notes');
  await page.getByRole('button', { name: 'Nouvelle note' }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Nouvelle note' });
  await dialog.getByLabel('Titre').fill('Digicode');
  await dialog.getByLabel('Contenu').fill('A-2468');
  await dialog.getByLabel('Note sensible').check();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  // Masquée dans la liste ; « Afficher » demande le mot de passe.
  await expect(page.getByText('Contenu protégé')).toBeVisible();
  await expect(page.getByText('A-2468')).toHaveCount(0);
  await page.getByRole('button', { name: 'Afficher « Digicode »' }).click();
  const vault = page.getByRole('dialog', { name: 'Note sensible' });
  await vault.getByLabel('Mot de passe').fill('pas le bon');
  await vault.getByRole('button', { name: 'Afficher' }).click();
  await expect(vault.getByText('Mot de passe actuel incorrect.')).toBeVisible();
  await vault.getByLabel('Mot de passe').fill('correct horse battery');
  await vault.getByRole('button', { name: 'Afficher' }).click();
  await expect(vault).toBeHidden();
  await expect(page.getByText('A-2468')).toBeVisible();
  await page.getByRole('button', { name: 'Masquer « Digicode »' }).click();
  await expect(page.getByText('A-2468')).toHaveCount(0);

  // Coffre ouvert 5 minutes : modifier le contenu ne redemande rien.
  await page.getByRole('button', { name: 'Modifier « Digicode »' }).click();
  dialog = page.getByRole('dialog', { name: 'Modifier la note' });
  await dialog.getByRole('button', { name: 'Afficher pour modifier' }).click();
  await dialog.getByLabel('Contenu').fill('B-1357');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('B-1357')).toBeVisible();

  // La recherche ne trouve pas le contenu.
  await page.keyboard.press('/');
  const search = page.getByRole('dialog', { name: 'Rechercher' });
  await search.getByRole('searchbox').fill('1357');
  await expect(search.getByText('Rien trouvé pour « 1357 ».')).toBeVisible();
});
