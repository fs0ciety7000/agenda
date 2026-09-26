import { notFound } from './app-exception';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

/** Identifiant de ressource dans l'URL : malformé ⇒ 404 (même réponse qu'une ressource absente). */
export function assertUuid(value: string): string {
  if (!isUuid(value)) throw notFound();
  return value;
}
