# Roadmap

Chaque phase suit : analyser → proposer → implémenter → tester → vérifier → corriger → documenter.
Une phase n'est « terminée » que si la CI est verte et la documentation à jour.

| Phase | Contenu | Critère de sortie | Statut |
|---|---|---|---|
| **0 — Discovery** | PRD, architecture, BDD, Google Calendar, design system, roadmap, risques | Docs relus et validés par Grace & Nicolas | ✅ Livré (à valider) |
| **1 — Foundation** | Monorepo, CI, Docker Compose (Postgres/Redis), API NestJS + Prisma (schéma complet), auth email/mdp (sessions, refresh rotatif), foyers + isolation, web Next.js (tokens, i18n, login/inscription, shell), squelette Android | `pnpm test` vert (unit + intégration), `pnpm build` vert, CI verte | ✅ Livré (cf. §Phase 1) |
| **2 — Core Tasks** | CRUD tâches ponctuelles, catégories, attribution, statuts, dashboard « Aujourd'hui », vue Tâches + filtres + recherche, quick add (parseur FR déterministe), client API typé (OpenAPI), Google Sign-In | E2E Playwright : créer → cocher | ⏳ |
| **3 — Récurrence & rotation** | `packages/domain` : moteur RRULE-subset, DST, rotation (slots, par semaine, par jour), matérialisation 90 j, exceptions, split de série, 3 modes d'édition | Couverture domaine ≥ 95 %, tests critiques §29 | ⏳ |
| **4 — Google Calendar** | OAuth calendrier, sélection « Commun G & N », `GoogleCalendarSyncService`, BullMQ, retry/backoff, réconciliation, erreurs humaines | Suite fake Google verte + recette manuelle sur « Commun G & N » | ⏳ |
| **5 — Android** | Compose : navigation, dashboard, tâches, calendrier, création rapide, Room + outbox + WorkManager, notifications locales | Tests Compose + instrumentation ; APK de recette | ⏳ |
| **6 — Polish** | Drag & drop calendrier, animations, accessibilité (audit axe + TalkBack), dark mode fin, onboarding complet, statistiques, notifications & préférences | Audit a11y sans violation AA | ⏳ |
| **7 — Production** | Render (Frankfurt) + Vercel, Sentry, backups vérifiés (restauration testée), passage de l'app OAuth Google en production, politique de confidentialité, AAB Play Store (test interne) | Checklist de mise en production signée | ⏳ |

## Risques principaux

| # | Risque | Impact | Mitigation |
|---|---|---|---|
| R1 | App OAuth Google en « Testing » ⇒ refresh token expiré après 7 jours | Sync cassée chaque semaine | Passer en « In production » dès la Phase 4 ; documenté dans `google-calendar.md` |
| R2 | Bugs de récurrence/DST | Tâches au mauvais moment | Moteur pur, tests exhaustifs (changements d'heure mars/octobre, 29 février, 31 du mois) |
| R3 | Doublons Google | Calendrier pollué, confiance perdue | IDs d'événements déterministes + extendedProperties + réconciliation |
| R4 | Conflits offline Android | Perte de coche / écrasement | Outbox idempotente + versions + « la complétion gagne » |
| R5 | Sur-ingénierie | Retard, maintenance | Worker dans le process API en V1, pas de WebSocket en V1, 1 fournisseur backend |
| R6 | Fuite inter-foyers | Grave (vie privée) | Guard de foyer + filtres Prisma systématiques + tests d'intégration dédiés |
| R7 | Montées de version majeures (TS 7, Next 16, Prisma 7…) | Casse de build | Versions épinglées ; montées en PR dédiées |

## Phase 1 — détail de ce qui est livré

- `pnpm` workspace + Turborepo, `packages/{config,contracts,design-tokens}`.
- `apps/api` : NestJS 11, Prisma 6 (schéma complet du modèle cible + migration initiale), modules `health`, `auth` (inscription, connexion, refresh rotatif avec détection de réutilisation, logout, logout-all, `me`), `households` (création avec catégories par défaut, liste, détail, invitations, acceptation) + `HouseholdMemberGuard`. Validation Zod, format d'erreur unique, Helmet, throttling, Swagger.
- Tests : unitaires (crypto, tokens) + intégration (PostgreSQL réel) dont **isolation inter-foyers**.
- `apps/web` : Next.js 15, Tailwind 4 branché sur les tokens, dark/light, i18n FR/EN (`next-intl`), pages connexion/inscription, shell responsive, onboarding « Bienvenue ».
- `apps/android` : projet Gradle Kotlin DSL + Compose, thème généré depuis les tokens, Clean Architecture (squelette `data/domain/ui`).
- `docker-compose.yml` (PostgreSQL 16, Redis 7), `.env.example`, CI GitHub Actions (JS, E2E, Android).

Vérifié localement : lint + typecheck + build (tous paquets), 5 tests contracts, 23 tests API
(dont rotation/réutilisation de refresh token, refresh concurrents, CSRF, logout-all, isolation inter-foyers),
4 E2E Playwright (desktop + mobile), Android : lint, 3 tests unitaires ViewModel, APK debug.

Reporté explicitement de la Phase 1 vers la Phase 2 : Google Sign-In, réinitialisation du mot
de passe par email (nécessite un fournisseur d'emails), export / suppression de compte (RGPD),
client API généré depuis l'OpenAPI, onboarding complet (étapes Google et notifications).
