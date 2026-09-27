---
title: Stack technique
description: Vue d'ensemble des technologies, du dépôt et de l'infrastructure de Tandem.
---

# Stack technique

```text
 Navigateur (site, PWA)           App Android (Kotlin, Compose)
        │  HTTPS, cookies httpOnly          │  HTTPS, Bearer
        ▼                                   ▼
 ┌─────────────── Cloudflare (DNS, TLS, protection) ───────────────┐
 │                         Coolify (Traefik)                        │
 │   web  : Next.js 15 ── /v1/* relayé ──►  api : NestJS 11        │
 │                                           │   │   │              │
 │                              PostgreSQL 16 ┘   │   └ BullMQ ► Redis 7
 │   backup : pg_dump nocturne → restauration vérifiée → R2        │
 │   docs   : ce site (Docusaurus, nginx)                           │
 └──────────────────────────────────────────────────────────────────┘
        │                     │                       │
   Google Calendar       Firebase (FCM)         Resend / SMTP
```

## Dépôt (monorepo pnpm + Turborepo)

| Dossier | Contenu |
|---|---|
| `apps/api` | **NestJS 11**, **Prisma 6** (PostgreSQL 16), **BullMQ** (Redis) ; Zod pour valider ; Pino pour les journaux ; OpenAPI généré |
| `apps/web` | **Next.js 15** (App Router), **React 19**, **Tailwind CSS 4**, **TanStack Query**, **next-intl** (FR/EN), service worker (hors ligne, Web Push) |
| `apps/android` | **Kotlin**, **Jetpack Compose** (Material 3), **Room**, **WorkManager**, **Glance** (widgets), Retrofit/OkHttp, DataStore chiffré ; Gradle autonome |
| `apps/docs` | ce site : **Docusaurus 3** (contenu : dossier `docs/`), référence Swagger |
| `packages/domain` | logique métier pure et testée à ≥ 95 % : récurrence, rotation, ajout rapide, répartition, courses |
| `packages/contracts` | schémas **Zod** partagés API ↔ web (entrées, réponses, codes d'erreur) — source de la doc OpenAPI |
| `packages/design-tokens` | couleurs, rayons, espacements → CSS (web) et `Tokens.kt` (Android) |
| `packages/config` | tsconfig et ESLint partagés |
| `infra/backup` | image de sauvegarde (pg_dump, restauration de contrôle, rclone) |
| `infra/uptime-kuma` | surveillance externe (à installer sur une autre machine) |

## Choix structurants

- **Une seule source de vérité pour les formats** : les schémas Zod de `packages/contracts`
  valident les requêtes côté API, typent le web et produisent la documentation OpenAPI.
- **Logique métier isolée** (`packages/domain`) : la récurrence et l'ajout rapide sont testés sans
  base ni réseau, et partagés entre l'API et le web.
- **Même origine** : le web relaie `/v1/*` vers l'API ; cookies first-party, pas de CORS.
- **Hors ligne d'abord** sur Android (Room + file d'envoi idempotente) et sur le site (service
  worker + file d'envoi).
- **Rien de bloquant côté Google** : la synchronisation passe par une file de jobs.
- Détails et décisions (ADR) : [Architecture](architecture.md).

## Qualité

| Vérification | Outil | Où |
|---|---|---|
| Format | Prettier | CI |
| Lint | ESLint (TS), Android Lint | CI |
| Types | TypeScript strict | CI |
| Tests unitaires et d'intégration API | Vitest (+ PostgreSQL et Redis réels) | CI |
| Couverture du moteur métier | Vitest ≥ 95 % | CI |
| Bout en bout web | Playwright (desktop et mobile) | CI |
| Accessibilité | axe (WCAG 2.2 AA), clair et sombre | CI (Playwright) |
| Android | JUnit, Robolectric (écrans, captures), émulateur (à la demande) | CI |
| Images de production + sauvegarde/restauration | Docker Compose | CI |
| Documentation OpenAPI à jour | `pnpm --filter @agenda/api openapi` + diff | CI |
| Dépendances | Dependabot (hebdomadaire) | GitHub |

## Exploitation

- Hébergement **Coolify** (Docker Compose) derrière **Cloudflare** : [Déploiement](deployment.md).
- Sauvegardes nocturnes **restaurées et vérifiées**, copie hors serveur.
- Surveillance interne (sondes, incidents, `/status`) et externe (Uptime Kuma) :
  [Surveillance](monitoring.md).
- App Android : APK auto-hébergé à mise à jour automatique, ou Google Play :
  [Application Android](android.md), [Google Play](play-store.md).
