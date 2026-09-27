import PostalMime, { type Email } from 'postal-mime';

export interface Env {
  /** Origine de l'app, ex. https://agenda.fs0ciety.org */
  API_URL: string;
  /** Secret partagé avec l'API (variable INBOUND_EMAIL_SECRET, identique des deux côtés). */
  INBOUND_EMAIL_SECRET: string;
}

/** Message plus gros : refusé (pièces jointes volumineuses inutiles pour une tâche). */
const MAX_RAW_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 20_000;

export interface InboundPayload {
  to: string;
  from: string;
  subject: string;
  text: string;
}

/** HTML → texte lisible (le texte brut est préféré quand il existe). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function toPayload(envelopeTo: string, email: Email): InboundPayload {
  const from = email.from
    ? email.from.name
      ? `${email.from.name} <${email.from.address ?? ''}>`
      : (email.from.address ?? '')
    : '';
  const text = (email.text?.trim() || (email.html ? htmlToText(email.html) : '')).slice(
    0,
    MAX_TEXT,
  );
  return { to: envelopeTo, from, subject: email.subject ?? '', text };
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (message.rawSize > MAX_RAW_BYTES) {
      message.setReject('Message trop volumineux');
      return;
    }
    const email = await PostalMime.parse(await new Response(message.raw).arrayBuffer());
    const res = await fetch(`${env.API_URL.replace(/\/$/, '')}/v1/inbound/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.INBOUND_EMAIL_SECRET}`,
        'x-requested-with': 'agenda-gn',
      },
      body: JSON.stringify(toPayload(message.to, email)),
    });
    if (res.status === 404) message.setReject('Adresse inconnue ou désactivée');
    else if (res.status === 400) message.setReject('Message vide : aucun titre de tâche');
    // Autre erreur (API indisponible…) : échec temporaire, le serveur d'envoi réessaiera.
    else if (!res.ok) throw new Error(`API ${res.status}`);
  },
} satisfies ExportedHandler<Env>;
