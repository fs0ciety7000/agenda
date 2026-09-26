# Agenda G & N

Gestionnaire des tâches du foyer pour Grace & Nicolas — web responsive + Android natif, avec
synchronisation vers le calendrier Google partagé « Commun G & N ».

> État : **Phase 0 (Discovery) et Phase 1 (Foundation) livrées.** Voir [`docs/roadmap.md`](docs/roadmap.md).

## Documentation

| Document                                          | Contenu                                            |
| ------------------------------------------------- | -------------------------------------------------- |
| [Exigences produit](docs/product-requirements.md) | Vision, user stories MVP, ambiguïtés et décisions  |
| [Architecture](docs/architecture.md)              | Choix techniques (ADR), sécurité, RGPD, infra      |
| [Base de données](docs/database.md)               | Modèle, récurrence, fuseaux, index                 |
| [Google Calendar](docs/google-calendar.md)        | OAuth, stratégie de synchronisation, erreurs       |
| [Design system](docs/design-system.md)            | Tokens, composants, accessibilité                  |
| [Roadmap](docs/roadmap.md)                        | Phases, risques                                    |
| [Déploiement](docs/deployment.md)                 | Coolify (Docker Compose) + Cloudflare, sauvegardes |

## Structure

```
apps/api       NestJS 11 + Prisma 6 (PostgreSQL)
apps/web       Next.js 15 (App Router) + Tailwind 4 + TanStack Query + next-intl
apps/android   Kotlin + Jetpack Compose (Gradle autonome)
packages/contracts      Schémas Zod partagés API ↔ web
packages/design-tokens  Tokens → CSS (web) + Tokens.kt (Android)
packages/config         tsconfig / ESLint partagés
```

## Démarrage local

Prérequis : Node 22, pnpm 10, Docker (ou PostgreSQL 16 local), JDK 17+ et Android SDK pour l'app mobile.

```bash
docker compose up -d                       # PostgreSQL + Redis
pnpm install
cp apps/api/.env.example apps/api/.env     # puis renseigner JWT_SECRET et TOKEN_ENCRYPTION_KEY
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @agenda/api db:migrate       # applique les migrations
pnpm dev                                   # API :4000 (Swagger : /docs) · Web :3000
```

Le web appelle l'API via `/v1/*` sur sa propre origine (rewrite Next.js) : cookies first-party, pas de CORS.

### Tests

```bash
pnpm test                               # unitaires + intégration API (base agenda_test jetable)
pnpm --filter @agenda/web e2e           # Playwright (API et web démarrés)
cd apps/android && ./gradlew lintDebug testDebugUnitTest assembleDebug
```

### Production

`docker-compose.prod.yml` (Coolify + Cloudflare) : voir [docs/deployment.md](docs/deployment.md).

### Android

`pnpm --filter @agenda/design-tokens gen:android` régénère `Tokens.kt` après modification de
`packages/design-tokens/tokens.json`. En debug, l'app vise `http://10.0.2.2:4000/` (API locale depuis l'émulateur).
