import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openSettings, signUpWithHousehold } from './helpers';

/** Code TOTP (RFC 6238) calculé comme le ferait l'application d'authentification. */
function totp(base32: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32.replace(/\s/g, ''))
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('double authentification : activée dans les Réglages, puis connexion avec un code de secours', async ({
  page,
}) => {
  const { email } = await signUpWithHousehold(page, 'Emma');
  await openSettings(page);
  await page.getByRole('button', { name: 'Activer', exact: true }).click();

  // Mot de passe du compte d'abord, comme pour le coffre.
  const verify = page.getByRole('dialog', { name: 'Vérification' });
  await verify.getByLabel('Mot de passe').fill('correct horse battery');
  await verify.getByRole('button', { name: 'Continuer' }).click();

  const scan = page.getByRole('dialog', { name: 'Ajouter Tandem à votre application' });
  await expect(scan.getByRole('img', { name: /QR code/ })).toBeVisible();
  const secret = (await scan.locator('code').innerText()).replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await expect(
    scan.getByRole('link', { name: "Ouvrir dans l'application d'authentification" }),
  ).toHaveAttribute('href', new RegExp(`^otpauth://totp/Tandem.*secret=${secret}`));
  const a11y = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(a11y.violations).toEqual([]);
  await scan.getByLabel('Code').fill('000000');
  await scan.getByRole('button', { name: 'Valider' }).click();
  await expect(scan.getByText('Code incorrect ou expiré.', { exact: false })).toBeVisible();
  await scan.getByLabel('Code').fill(totp(secret));
  await scan.getByRole('button', { name: 'Valider' }).click();

  const codesDialog = page.getByRole('dialog', { name: 'Vos codes de secours' });
  const codes = (await codesDialog.getByRole('listitem').allInnerTexts()).map((c) => c.trim());
  expect(codes).toHaveLength(10);
  await codesDialog.getByRole('button', { name: "C'est noté" }).click();
  await expect(page.getByText('10 codes de secours restants.')).toBeVisible();

  // Déconnexion, puis connexion : le mot de passe ne suffit plus.
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.waitForURL(/\/login/);
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill('correct horse battery');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Code de vérification' })).toBeVisible();
  await page.getByLabel('Code').fill(codes[0]!);
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Emma 👋' })).toBeVisible();

  await openSettings(page);
  await expect(page.getByText('9 codes de secours restants.')).toBeVisible();
});
