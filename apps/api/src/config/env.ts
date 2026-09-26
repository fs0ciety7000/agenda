import { z } from 'zod';
import { decodeEncryptionKey } from '../common/crypto';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  // Sans barre finale : sert à construire les URI de redirection OAuth (comparées à l'octet près).
  WEB_ORIGIN: z
    .string()
    .trim()
    .url()
    .default('http://localhost:3000')
    .transform((v) => v.replace(/\/+$/, '')),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // Vérifiée au démarrage : une clé invalide ne doit pas attendre la première connexion Google.
  TOKEN_ENCRYPTION_KEY: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .trim()
      .refine(
        (v) => {
          try {
            decodeEncryptionKey(v);
            return true;
          } catch {
            return false;
          }
        },
        {
          message:
            'TOKEN_ENCRYPTION_KEY must be 32 random bytes: generate one with `openssl rand -base64 32`',
        },
      )
      .optional(),
  ),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(60),
  /**
   * En-tête portant l'IP réelle du client derrière les proxys (Cloudflare → Traefik → web → API).
   * Vide = IP de la connexion TCP (développement). Voir docs/deployment.md.
   */
  CLIENT_IP_HEADER: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || undefined),
  /**
   * Requêtes/minute/IP sur l'ensemble de l'API. Généreux : les membres d'un foyer partagent
   * souvent la même IP publique (box internet) et l'interface fait plusieurs requêtes par écran.
   */
  GLOBAL_RATE_LIMIT: z.coerce.number().int().min(1).default(600),
  /** Requêtes/minute/IP sur login, inscription, refresh. */
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  // ── Emails (SMTP générique : Brevo, Resend, Mailjet…). Sans SMTP_HOST : aucun envoi (journalisé). ──
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Agenda G & N <no-reply@example.invalid>'),
  // ── Google Calendar (Phase 4) ──
  /** Redis pour la file de synchronisation (BullMQ). Sans Redis : synchronisation directe en mémoire. */
  REDIS_URL: z.string().optional(),
  /**
   * `queue` (BullMQ, production), `inline` (minuterie en mémoire, développement sans Redis),
   * `off` (tests : synchronisation déclenchée explicitement). Défaut déduit de l'environnement.
   */
  CALENDAR_SYNC_MODE: z.enum(['queue', 'inline', 'off']).optional(),
  /** Développement uniquement : faux Google Calendar en mémoire (refusé en production). */
  GOOGLE_CALENDAR_FAKE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // ── Google Sign-In (OIDC). Sans identifiants : le bouton est masqué. ──
  // Espaces ou retours à la ligne collés par erreur dans Coolify ⇒ `invalid_client` chez Google.
  GOOGLE_CLIENT_ID: z.string().trim().optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
  // ── Suivi des erreurs (optionnel) : Sentry ou GlitchTip. Sans DSN : erreurs dans les logs seulement. ──
  SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  // ── Notifications instantanées Android (Firebase, docs/android.md). Sans : vérification périodique. ──
  /** JSON du compte de service Firebase (brut ou en base64). */
  FCM_SERVICE_ACCOUNT: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  FCM_API_URL: z.string().url().default('https://fcm.googleapis.com'),
  // ── Distribution de l'app Android (docs/android.md §4) ──
  /** Dépôt GitHub dont la release `android-latest` contient l'APK et version.json. */
  ANDROID_RELEASE_REPO: z.string().trim().default('fs0ciety7000/agenda'),
  /** Jeton GitHub en lecture seule (Contents: read) : requis si le dépôt est privé. */
  GITHUB_RELEASES_TOKEN: z.string().trim().optional(),
  /** Inscriptions ouvertes. À passer à false une fois les membres du foyer inscrits. */
  REGISTRATION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Lit et valide l'environnement une seule fois ; échoue au démarrage si invalide. */
export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Tests uniquement. */
export function resetEnvCache(): void {
  cached = undefined;
}
