import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('barre du bas : tirée vers le haut, elle ouvre le tiroir « Plus » ; Échap le referme', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'barre du bas : téléphone seulement');
  await signUpWithHousehold(page, 'Grace');

  const bar = page.getByRole('navigation', { name: 'Navigation principale' }).last();
  const box = (await bar.boundingBox())!;
  // Glisser du milieu de la barre vers le haut.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 6 });
  await page.mouse.up();

  const drawer = page.getByRole('dialog', { name: 'Plus' });
  await expect(drawer).toBeVisible();
  for (const name of ['Dépenses', 'Notes', 'Dates importantes', 'Menus', 'Réglages']) {
    await expect(drawer.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  // Au toucher : « Plus » ouvre le même tiroir, un lien y mène à la page et le referme.
  await page.getByRole('button', { name: 'Plus', exact: true }).click();
  await drawer.getByRole('link', { name: 'Dates importantes', exact: true }).click();
  await page.waitForURL(/\/dates/);
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Plus', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
