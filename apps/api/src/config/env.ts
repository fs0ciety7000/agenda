import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
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
  /** Requêtes/minute/IP sur login, inscription, refresh. */
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
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
