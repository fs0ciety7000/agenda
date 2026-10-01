import { expect, test } from '@playwright/test';
import { signUpWithHousehold } from './helpers';

test('passkey : ajoutée dans les Réglages, puis connexion sans mot de passe', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Authentificateur virtuel : Chromium seulement');
  // Authentificateur de test (empreinte simulée), comme un téléphone ou un Mac.
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await signUpWithHousehold(page, 'Ada');
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Ajouter une passkey' }).click();
  await expect(page.getByText('Passkey ajoutée')).toBeVisible();
  await expect(page.getByText(/Ajoutée le/)).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: 'Se connecter avec une passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Ada 👋' })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText(/Utilisée le/)).toBeVisible();
});
