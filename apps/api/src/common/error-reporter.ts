import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { ClientErrorInput } from '@agenda/contracts';
import { env } from '../config/env';

const logger = new Logger('ErrorReporter');
let enabled = false;

/**
 * Suivi des erreurs : toujours dans les logs ; envoyé à Sentry (ou GlitchTip) si SENTRY_DSN.
 * Aucune donnée personnelle : ni corps de requête, ni en-têtes, ni cookies, ni utilisateur.
 */
export function initErrorReporting(): void {
  const dsn = env().SENTRY_DSN;
  if (!dsn || env().NODE_ENV === 'test') return;
  Sentry.init({
    dsn,
    environment: env().NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        event.request = { method: event.request.method, url: event.request.url?.split('?')[0] };
      }
      delete event.user;
      return event;
    },
  });
  enabled = true;
  logger.log('Error reporting enabled (Sentry)');
}

export function reportServerError(error: unknown, route?: string): void {
  if (enabled)
    Sentry.captureException(error, { tags: { source: 'api', route: route ?? 'unknown' } });
}

export function reportClientError(input: ClientErrorInput): void {
  logger.warn(
    `Client error [${input.source}${input.release ? ` ${input.release}` : ''}] ${input.location ?? ''}: ${input.message}`,
  );
  if (!enabled) return;
  Sentry.captureEvent({
    message: input.message,
    level: 'error',
    platform: input.source === 'android' ? 'java' : 'javascript',
    tags: { source: input.source, location: input.location ?? 'unknown' },
    release: input.release,
    extra: input.stack ? { stack: input.stack } : undefined,
  });
}
