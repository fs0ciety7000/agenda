---
title: Guide de l'API
description: Authentification, CSRF, erreurs, idempotence, concurrence, temps réel — tout pour écrire un client de l'API Agenda G & N.
---

# Guide de l'API

L'API REST sert le site et l'app Android. Toutes les routes métier sont sous **`/v1`**, sur la
même origine que le site (`https://agenda.fs0ciety.org/v1/…` : le web relaie vers l'API).

- **Référence complète et interactive** : [Référence (Swagger)](/api-reference) — chaque route,
  ses paramètres, son corps et sa réponse, générés depuis le code.
- **Fichier OpenAPI 3** : [`/openapi.json`](pathname:///openapi.json), à importer dans Postman,
  Insomnia ou un générateur de client.
- En développement, l'API sert aussi Swagger UI sur `http://localhost:4000/docs`.

## Authentification

### Navigateur (cookies)

`POST /v1/auth/login` avec `{ "email", "password" }` pose deux cookies `httpOnly`, `Secure`,
`SameSite=Lax` :

| Cookie | Contenu | Durée |
|---|---|---|
| `gn_at` | jeton d'accès (JWT) | 15 minutes |
| `gn_rt` | jeton de rafraîchissement, limité au chemin `/v1/auth` | 60 jours d'inactivité |

À l'expiration (`401 UNAUTHENTICATED`), `POST /v1/auth/refresh` renouvelle les deux.

### Application mobile (Bearer)

Avec l'en-tête **`X-Client: mobile`**, `login`, `register` et `refresh` renvoient les jetons dans
le corps au lieu des cookies :

```json
{ "user": { … }, "accessToken": "eyJ…", "refreshToken": "…", "accessTokenExpiresIn": 900 }
```

Les requêtes suivantes portent `Authorization: Bearer <accessToken>` ; le rafraîchissement envoie
`{ "refreshToken": "…" }` à `POST /v1/auth/refresh`. Chaque rafraîchissement **remplace** le
jeton de rafraîchissement (rotation) : conservez le nouveau.

### Connexion Google

- Web : redirection vers `GET /v1/auth/google/start`, retour sur `/v1/auth/google/callback`.
- Android : code serveur Google Sign-In échangé par `POST /v1/auth/google/mobile/exchange`.

## CSRF

Toute requête qui modifie (`POST`, `PATCH`, `PUT`, `DELETE`) doit porter :

```http
X-Requested-With: agenda-gn
```

Sinon : `403 CSRF_REJECTED`. Règle identique pour le web et l'app (seuls les webhooks entrants,
signés, en sont dispensés).

## Foyers et droits

Presque tout est rangé sous `/v1/households/{householdId}/…`. L'API vérifie à chaque requête que
l'utilisateur est **membre** du foyer (sinon `404`, pour ne rien révéler). Les tâches
**personnelles** ne sont visibles que par leur auteur.

```bash
# Lister les tâches du jour
curl -s https://agenda.fs0ciety.org/v1/households/$HH/occurrences?view=today \
  -H "Authorization: Bearer $TOKEN"

# Ajout rapide
curl -s -X POST https://agenda.fs0ciety.org/v1/households/$HH/tasks/quick \
  -H "Authorization: Bearer $TOKEN" -H 'X-Requested-With: agenda-gn' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Sortir les poubelles demain 19h @nicolas"}'
```

## Tâches, séries et occurrences

- Une **tâche** porte le titre, les notes, la catégorie, la visibilité…
- Une tâche répétée a une **série** (règle de répétition, tour de rôle) qui produit des
  **occurrences** (une par date), matérialisées 90 jours à l'avance.
- Les listes et vues manipulent des **occurrences** (`OccurrenceDto`) ; modifier une occurrence
  d'une série demande la **portée** : `?scope=this|following|all`.

## Erreurs

Toutes les erreurs ont la même forme :

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Validation failed", "details": { … } } }
```

- `code` est **stable** : c'est lui que le client traduit (liste complète dans le schéma
  `ApiError` de la référence) ;
- `message` est un texte technique en anglais, jamais destiné à l'affichage ;
- `details` (facultatif) : pour `VALIDATION_FAILED`, les champs invalides.

| Statut | Codes fréquents |
|---|---|
| 400 | `VALIDATION_FAILED`, `TASK_TITLE_REQUIRED` |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS` |
| 403 | `CSRF_REJECTED`, `FORBIDDEN`, `ACCOUNT_DISABLED` |
| 404 | `NOT_FOUND`, `HOUSEHOLD_NOT_FOUND` |
| 409 | `VERSION_CONFLICT`, `IDEMPOTENCY_IN_PROGRESS`, `EMAIL_ALREADY_USED` |
| 413 | `ATTACHMENT_TOO_LARGE`, `ATTACHMENTS_QUOTA` |
| 429 | `RATE_LIMITED` |

## Concurrence optimiste

Chaque occurrence a un champ `version`. `PATCH …/occurrences/{id}` exige la `version` lue : si
quelqu'un a modifié entre-temps, la réponse est `409 VERSION_CONFLICT` et le client montre la
version actuelle au lieu d'écraser.

## Idempotence (files hors ligne)

Les créations de tâches acceptent un en-tête **`Idempotency-Key`** (UUID généré par le client) :
rejouer la même requête renvoie la réponse d'origine au lieu de créer un doublon. Deux rejeux
simultanés : le second reçoit `409 IDEMPOTENCY_IN_PROGRESS` (à retenter).

## Temps réel

`GET /v1/households/{householdId}/events` est un flux **Server-Sent Events** :

```text
data: {"topic":"tasks"}
data: {"topic":"shopping"}
data: {"topic":"notifications"}
```

L'événement ne contient **aucune donnée** : le client recharge le sujet par l'API habituelle
(mêmes droits). Un `ping` part toutes les 25 secondes ; à la reconnexion, tout recharger.

## Limites

- **Débit** : 600 requêtes par minute et par IP (`GLOBAL_RATE_LIMIT`), 10 par minute sur les
  routes de connexion (`AUTH_RATE_LIMIT`) → `429 RATE_LIMITED`.
- **Pièces jointes** : 10 Mo par fichier, 200 Mo par foyer.

## Versions et compatibilité

Le préfixe `/v1` ne reçoit que des changements **compatibles** (champs ajoutés, routes
ajoutées) : l'app Android installée continue de fonctionner. Un changement incompatible
passerait par `/v2`. Les changements sont listés dans les [Nouveautés](changelog.md).

## Documentation générée

La référence est produite depuis le code, sans rien écrire à la main :

- les **routes** et paramètres de chemin : contrôleurs NestJS ;
- les **corps** et **paramètres de requête** : les schémas Zod passés à `ZodPipe` ;
- les **réponses** : le type de retour des contrôleurs (`Promise<OccurrenceDto>`), relié au
  schéma Zod du même nom dans `@agenda/contracts` ;
- les **résumés** : le commentaire `/** … */` au-dessus de chaque méthode.

```bash
pnpm --filter @agenda/api build
pnpm --filter @agenda/api openapi   # écrit apps/docs/static/openapi.json
```

La CI échoue si `openapi.json` n'est pas à jour.
