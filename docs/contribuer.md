---
title: Contribuer
description: Démarrer en local, conventions, tests, documentation et changelog.
---

# Contribuer

## Démarrer en local

Prérequis : Node 22, pnpm 10, Docker (ou PostgreSQL 16 + Redis). Android : JDK 17+ et le SDK.

```bash
docker compose up -d                       # PostgreSQL + Redis
pnpm install
cp apps/api/.env.example apps/api/.env     # renseigner JWT_SECRET et TOKEN_ENCRYPTION_KEY
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @agenda/api db:migrate
pnpm dev                                   # API :4000 (Swagger : /docs) · Web :3000
```

Documentation (site séparé, dépendances à part) :

```bash
cd apps/docs && npm ci && npm start        # http://localhost:3000, rechargement à chaud
```

## Avant de proposer une modification

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @agenda/web e2e              # parcours web (API et web démarrés)
cd apps/android && ./gradlew lintDebug testDebugUnitTest assembleDebug
```

## Conventions

- **Français** pour l'interface, la documentation et les commentaires ; l'anglais pour les
  identifiants et les messages d'erreur techniques de l'API.
- **Contrats d'abord** : un nouveau champ ou une nouvelle route commence par son schéma Zod dans
  `packages/contracts` ; la doc OpenAPI suit toute seule.
- **Commentaire `/** … */` sur chaque méthode de contrôleur** : sa première phrase devient le
  résumé de la route dans la référence de l'API.
- **Migrations Prisma** générées (`prisma migrate diff`), jamais écrites à la main.
- **Pas de secret dans le dépôt** : ni clé, ni jeton, ni fichier de compte de service, ni
  adresse personnelle.

## À mettre à jour dans la même PR

| Vous changez… | Mettez à jour |
|---|---|
| une route de l'API | `pnpm --filter @agenda/api build && pnpm --filter @agenda/api openapi` (la CI le vérifie) |
| une fonction visible | le **guide** (`docs/guide/`) et les **nouveautés** (`docs/changelog.md`) |
| une donnée collectée, un prestataire | [Confidentialité & RGPD](rgpd.md), la politique en ligne (`privacyPolicy` dans `apps/web/messages/*.json`) et, pour Android, la [sécurité des données Google Play](play-store.md#4-sécurité-des-données-réponses) |
| une variable d'environnement | [Déploiement](deployment.md) et `docker-compose.prod.yml` |

### Écrire une entrée de changelog

En tête de `docs/changelog.md`, sous la date du jour (créée si besoin), un titre court avec le
numéro de PR, puis une ligne par changement **du point de vue de l'utilisateur** :

```markdown
### Liste de courses partagée (#43)

- ✨ **Liste de courses partagée** en temps réel.
- 🐞 Un article coché hors ligne n'était pas envoyé.
```

## CI (GitHub Actions)

Le dépôt est privé : les minutes sont comptées. Chaque workflow ne tourne que si c'est utile :

| Workflow | Quand |
|---|---|
| `CI` (API, web, E2E, images Docker) | PR et `main`, sauf changements limités à la doc ou à l'app Android |
| `Android` | quand `apps/android/**` change |
| `Android (émulateur)` | à la demande (*Run workflow*) ou étiquette `emulateur` sur la PR |
| `Android — APK à installer` | sur `main` quand l'app Android change |
| `Documentation` | quand `docs/**` ou `apps/docs/**` change |
| `Disponibilité` | toutes les 2 heures |
