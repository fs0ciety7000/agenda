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
  attachments?: {
    id: string;
    filename: string;
    content_type: string;
    content_disposition: string | null;
    size?: number;
  }[];
}

export class ResendUnavailableError extends Error {}

/** Le webhook de Resend ne contient pas le corps : on le récupère par l'API. */
@Injectable()
export class ResendReceivingClient {
  private async call<T>(path: string): Promise<T> {
    const res = await fetch(`https://api.resend.com${path}`, {
      headers: { authorization: `Bearer ${env().RESEND_API_KEY}` },
    }).catch((e: unknown) => {
      throw new ResendUnavailableError(String(e));
    });
    if (!res.ok) throw new ResendUnavailableError(`Resend ${res.status}`);
    return (await res.json()) as T;
  }

  get(emailId: string): Promise<ReceivedEmail> {
    return this.call(`/emails/receiving/${encodeURIComponent(emailId)}`);
  }

  /** Contenu d'une pièce jointe (lien de téléchargement temporaire fourni par Resend). */
  async attachment(emailId: string, attachmentId: string, maxBytes: number): Promise<Buffer> {
    const meta = await this.call<{ download_url: string }>(
      `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    const res = await fetch(meta.download_url);
    if (!res.ok) throw new ResendUnavailableError(`Attachment ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > maxBytes) throw new Error('Attachment too large');
    return data;
  }
}
