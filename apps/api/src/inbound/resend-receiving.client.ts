import { Injectable } from '@nestjs/common';
import { env } from '../config/env';

/** E-mail reçu, tel que renvoyé par `GET /emails/receiving/{id}` (champs utiles). */
export interface ReceivedEmail {
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers?: Record<string, string>;
}

export class ResendUnavailableError extends Error {}

/** Le webhook de Resend ne contient pas le corps : on le récupère par l'API. */
@Injectable()
export class ResendReceivingClient {
  async get(emailId: string): Promise<ReceivedEmail> {
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      { headers: { authorization: `Bearer ${env().RESEND_API_KEY}` } },
    ).catch((e: unknown) => {
      throw new ResendUnavailableError(String(e));
    });
    if (!res.ok) throw new ResendUnavailableError(`Resend ${res.status}`);
    return (await res.json()) as ReceivedEmail;
  }
}
