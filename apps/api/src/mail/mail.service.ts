import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Envoi d'emails par SMTP (fournisseur au choix, cf. docs/deployment.md §Emails).
 * Sans SMTP configuré : rien n'est envoyé ; en développement, le contenu est journalisé.
 * En test, les messages sont conservés dans `outbox`.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  readonly outbox: OutgoingMail[] = [];

  constructor() {
    const config = env();
    this.transporter = config.SMTP_HOST
      ? nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_PORT === 465,
          requireTLS: config.SMTP_PORT !== 465,
          auth: config.SMTP_USER
            ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
            : undefined,
          // Un serveur SMTP injoignable ne doit pas bloquer indéfiniment.
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        })
      : null;
  }

  get enabled(): boolean {
    return this.transporter !== null || env().NODE_ENV !== 'production';
  }

  /** Surveillance : le serveur SMTP accepte la connexion. null = pas de SMTP configuré. */
  async verify(): Promise<boolean | null> {
    if (!this.transporter) return null;
    await this.transporter.verify();
    return true;
  }

  async send(mail: OutgoingMail): Promise<void> {
    const config = env();
    if (config.NODE_ENV === 'test') {
      this.outbox.push(mail);
      return;
    }
    if (!this.transporter) {
      if (config.NODE_ENV === 'development')
        this.logger.log(`[email non envoyé] ${mail.subject}\n${mail.text}`);
      else this.logger.warn('SMTP not configured: email not sent');
      return;
    }
    await this.transporter.sendMail({ from: config.EMAIL_FROM, ...mail });
  }
}
