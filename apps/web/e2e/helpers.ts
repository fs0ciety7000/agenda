import { expect, type Page } from '@playwright/test';

/** Inscription + création d'un foyer ; termine sur le dashboard. */
export async function signUpWithHousehold(page: Page, name = 'Grace') {
  const email = `${name.toLowerCase()}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Prénom').fill(name);
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill('correct horse battery');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Nom du foyer').fill('G & N');
  await page.getByRole('button', { name: 'Créer le foyer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: `Bonjour ${name} 👋` })).toBeVisible();
  return { email };
}

const API_HEADERS = {
  'content-type': 'application/json',
  'x-requested-with': 'tandem',
  'x-client': 'mobile',
};

/** Crée un 2e membre (Nicolas) par l'API et le fait rejoindre le foyer courant de la page. */
export async function addPartner(page: Page, baseURL: string, name = 'Nicolas') {
  const cookies = await page.context().cookies();
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const households = await (
    await fetch(`${baseURL}/v1/households`, { headers: { cookie } })
  ).json();
  const invite = await (
    await fetch(`${baseURL}/v1/households/${households[0].id}/invitations`, {
      method: 'POST',
      headers: { ...API_HEADERS, cookie },
      body: '{}',
    })
  ).json();
  const reg = await (
    await fetch(`${baseURL}/v1/auth/register`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({
        email: `${name.toLowerCase()}.${Date.now()}@example.test`,
        password: 'correct horse battery',
        displayName: name,
      }),
    })
  ).json();
  const joined = await (
    await fetch(`${baseURL}/v1/invitations/accept`, {
      method: 'POST',
      headers: { ...API_HEADERS, authorization: `Bearer ${reg.accessToken}` },
      body: JSON.stringify({ token: invite.token }),
    })
  ).json();
  return {
    householdId: households[0].id as string,
    accessToken: reg.accessToken as string,
    members: joined.members as { id: string; displayName: string }[],
    headers: { ...API_HEADERS, authorization: `Bearer ${reg.accessToken}` },
  };
}

/** Date du jour à Bruxelles (YYYY-MM-DD). */
export const todayBrussels = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
