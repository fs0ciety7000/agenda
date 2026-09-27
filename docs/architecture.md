# Architecture — Agenda G & N

> Statut : Phase 0 · Les décisions marquées **[ADR]** sont figées sauf nouvelle information.

## 1. Vue d'ensemble

```
            ┌──────────────────┐        ┌───────────────────────┐
            │  Web (Next.js)   │        │ Android (Kotlin/Compose)│
            │  Coolify/Docker  │        │ Room + WorkManager     │
            └────────┬─────────┘        └───────────┬───────────┘
                     │ HTTPS (cookies httpOnly)      │ HTTPS (Bearer)
                     ▼                               ▼
            ┌──────────────────────────────────────────────────┐
            │            API NestJS (REST + OpenAPI)           │
            │ auth · households · tasks · recurrence · rotation│
            │ calendar · notifications · statistics · privacy  │
            └───────┬──────────────────┬──────────────┬────────┘
                    │ Prisma           │ BullMQ       │ googleapis
                    ▼                  ▼              ▼
              PostgreSQL 16         Redis 7      Google Calendar API
                                       │
                                       ▼
                         Worker (même image, process séparé
                         ou même process en V1 — cf. §6)
```

**Toute la logique métier vit dans l'API.** Web et Android sont des clients : ils n'implémentent
ni la récurrence ni la rotation (l'API expose `POST /recurrence/preview` pour afficher les
prochaines occurrences dans les formulaires).

## 2. Monorepo **[ADR-001]**

| Option | + | − |
|---|---|---|
| A. Turborepo + pnpm | Standard, cache de build, workspaces rapides, simple | Android hors de l'écosystème JS |
| B. Nx | Graphe riche, générateurs | Plus lourd, courbe d'apprentissage |
| C. Repos séparés | Isolation | Contrats dupliqués, PR multiples |

**Choix : A.** Android vit dans `apps/android` (Gradle autonome) ; Turborepo l'ignore, la CI a un
job dédié.

```
apps/
  api/        NestJS + Prisma (+ worker BullMQ)
  web/        Next.js App Router
  android/    Kotlin + Jetpack Compose (Gradle)
packages/
  contracts/  Schémas Zod partagés API ↔ Web (DTO, enums, codes d'erreur) + types inférés
  domain/     Logique métier pure : récurrence, rotation, quick-add parser (0 dépendance I/O)
  design-tokens/ Tokens (couleurs, espacements, rayons…) → CSS variables + Kotlin
  config/     tsconfig / eslint partagés
docs/
```

Écarts par rapport à la structure suggérée (justifiés) :
- `types` + `validation` → fusionnés en **`contracts`** : les types sont *inférés* des schémas Zod, les séparer crée de la duplication.
- `ui` → **`design-tokens`** : un seul client React (web) ; les composants shadcn restent dans `apps/web/src/components/ui` (convention shadcn). Ce qui est réellement partagé entre Web et Android, ce sont les **tokens**.
- `api-client` → généré depuis l'OpenAPI en Phase 2 (web : TanStack Query + client typé ; Android : Retrofit/Ktor écrit à la main contre le même OpenAPI).
- `domain` ajouté : la récurrence/rotation est la partie la plus critique, elle doit être testable sans base ni framework.

## 3. Backend **[ADR-002]**

NestJS 11 modulaire, un module par contexte : `auth`, `users`, `households`, `tasks`,
`categories`, `recurrence`, `calendar` (Google), `notifications`, `statistics`, `privacy`, `health`.

Conventions :
- Contrôleurs minces → services → Prisma. Pas de repository générique au-dessus de Prisma (Prisma *est* le repository ; on évite une couche vide).
- Validation d'entrée via **Zod** (`packages/contracts`) + pipe Nest ; mêmes schémas côté web.
- Erreurs : format unique `{ error: { code: "TASK_NOT_FOUND", message, details? } }`. Le client traduit le `code`.
- OpenAPI/Swagger servi en `/docs` (non-prod) et exporté en JSON en CI.
- Versionnement d'URL : `/v1/...`.

### Isolation multi-tenant (sécurité critique)

Toutes les routes métier sont de la forme `/v1/households/:householdId/...`.
Le `HouseholdMemberGuard` :
1. vérifie que l'utilisateur authentifié est membre **actif** de `:householdId` ;
2. injecte `ctx.householdId` + `ctx.memberId`.

Les services **ne reçoivent jamais un id nu** : chaque requête Prisma filtre par
`householdId` (ex. `findFirst({ where: { id, householdId } })`), donc un id d'un autre foyer
retourne 404 (pas 403, pour ne pas révéler l'existence). Tests d'intégration dédiés (§9).
Les tâches `PERSONAL` sont en plus filtrées par `createdById = currentUser`.

## 4. Authentification **[ADR-003]**

| Option | + | − |
|---|---|---|
| A. Auth maison (JWT court + refresh opaque rotatif) | Contrôle total, web + Android identiques, pas de coût | À implémenter soigneusement |
| B. Auth.js / NextAuth | Rapide côté web | Couplé à Next ; Android doit passer par l'API quand même |
| C. SaaS (Clerk, Auth0, Supabase Auth) | Rapide, MFA | Coût, dépendance, données hors contrôle (RGPD), 2 utilisateurs |

**Choix : A**, avec des briques éprouvées (argon2id, jose) :
- **Access token** JWT (HS256 → migrable EdDSA), durée 15 min, contient `sub`, `sid`.
- **Refresh token** opaque (256 bits aléatoires), stocké **haché** (SHA‑256) dans `Session`, rotation à chaque usage, détection de réutilisation (famille révoquée si un ancien token est rejoué plus de 30 s après sa rotation ; en deçà, rejeu toléré pour les onglets concurrents).
- **Web** : tokens en cookies `httpOnly; Secure; SameSite=Lax`, refresh cookie restreint au path `/v1/auth`. Le web appelle l'API **sur sa propre origine** (`/v1/*` réécrit par Next.js vers l'API) : cookies first-party, aucun CORS nécessaire, indépendant du domaine de l'API.
- **CSRF** : `SameSite=Lax` + header `X-Requested-With: agenda-gn` exigé sur **toute** mutation (règle uniforme web/Android, `CsrfGuard`). Un formulaire ou une image cross-site ne peut pas ajouter ce header ; CORS ne l'autorise que depuis `WEB_ORIGIN`.
- **Android** : `Authorization: Bearer`, refresh token dans DataStore chiffré (Android Keystore).
- « Déconnexion de tous les appareils » = révocation de toutes les `Session` de l'utilisateur. Le guard vérifie à chaque requête que la session de l'access token n'est pas révoquée (1 lecture par clé primaire) : la déconnexion est **immédiate**, sans attendre l'expiration des 15 min.
- Rate limiting des routes d'auth : `AUTH_RATE_LIMIT` req/min/IP (défaut 10).
- Mots de passe : argon2id (m=19 MiB, t=2, p=1 — recommandations OWASP), longueur min 10, vérification HIBP (k-anonymity) post‑MVP.
- **Google Sign-In** (OIDC, scopes `openid email profile`) ≠ **connexion Google Calendar** (scopes calendrier, incrémentaux). Deux flux, deux tables (`AuthIdentity` vs `GoogleConnection`). Cf. `google-calendar.md`.

## 5. Récurrence & rotation **[ADR-004]**

| Option | + | − |
|---|---|---|
| A. Calcul à la volée depuis la règle | Pas de stockage | Impossible de cocher/annoter/synchroniser une occurrence sans la matérialiser ; exceptions complexes |
| B. Matérialisation complète | Simple à requêter | Infini pour les séries sans fin |
| C. **Matérialisation sur fenêtre glissante** (ex. 90 jours) + règle | Requêtes SQL simples, occurrences adressables (id stable → Google), exceptions = lignes modifiées | Job d'extension quotidien |

**Choix : C.** La règle (sous‑ensemble RFC 5545 RRULE, représenté en JSON typé) vit dans
`TaskSeries`. Un job quotidien étend l'horizon. Détails dans `database.md` §4.

La rotation est **déterministe** : `responsable(occurrence) = f(règle, index de l'occurrence dans la série)`.
Conséquence : régénérer une série donne les mêmes responsables, sauf les occurrences
explicitement modifiées (`isException = true`), qui ne sont jamais écrasées.

## 6. Jobs asynchrones **[ADR-005]**

Redis + **BullMQ** (demandé, et adapté : retries, backoff exponentiel, jobs répétables, déduplication par `jobId`).

File (implémentée en Phase 4) : **`calendar-sync`**, concurrence 1, jobs `sweep` (par foyer,
regroupés sur 2 s), `reconcile` (à la demande), et planifications `sweep-all` (10 min, étend
aussi l'horizon des séries) et `reconcile-all` (6 h). BullMQ n'est qu'un déclencheur : l'état
de synchronisation vit en base (cf. `google-calendar.md` §5). Sans Redis (développement), des
minuteries en mémoire prennent le relais (`CALENDAR_SYNC_MODE=inline`).
À venir : `notifications` — rappels planifiés (Phase 6).

**V1 : le worker tourne dans le même process que l'API** pour réduire le coût (1 service). Séparation en service dédié le jour où ce serait utile.

Pattern **transactional outbox** léger : la mutation métier incrémente `syncVersion` et
passe `googleSyncStatus = PENDING` dans la même transaction ; l'enqueue BullMQ suit le commit. Le
job de réconciliation rattrape tout `PENDING` orphelin (si Redis était indisponible). Donc aucune
perte même si l'enqueue échoue.

## 7. Temps réel **[ADR-006]**

| Option | Choix |
|---|---|
| WebSocket (Socket.IO) | Surdimensionné pour 2 utilisateurs en V1 |
| SSE | Candidat V2 |
| **Refetch au focus + polling 30 s (TanStack Query)** | **V1** |

## 8. Android offline **[ADR-007]**

- **Room** = cache local (occurrences de −7 j à +60 j, catégories, membres).
- **Outbox** locale : chaque action (cocher, créer, modifier) = une ligne `PendingOperation` avec `idempotencyKey` (UUID client). **WorkManager** la rejoue quand le réseau revient.
- API : header `Idempotency-Key` accepté sur les créations (`POST tasks`, `POST tasks/quick`) ; réservé avant traitement, stocké 24 h → rejouer renvoie la réponse d'origine. Cocher / décocher sont idempotents par nature.
- Concurrence optimiste : chaque ressource a un `version` (entier), envoyé dans le corps du `PATCH`. Conflit → `409 VERSION_CONFLICT` ; l'app recharge la version serveur. Modifier / supprimer se font en ligne (cf. `android.md`).
- Résolution : pour `status` (cocher), **la complétion gagne** (idempotent, intention claire) ; pour les autres champs, fusion champ par champ si les champs modifiés diffèrent, sinon l'UI propose « garder la mienne / garder celle du serveur ».
- Statut visible : ✓ Synchronisé / ⟳ Synchronisation… / ⚠ En attente.

### Site hors ligne

- **Service worker** (`apps/web/public/sw.js`) : pages en « réseau d'abord, sinon cache » ;
  fichiers `/_next/static` en « cache d'abord ». Les données (`/v1/*`) ne passent jamais par lui.
- **Cache persistant TanStack Query** (`localStorage`, 7 jours, invalidé à chaque build) : les
  écrans s'affichent sans réseau avec les dernières données reçues, puis se rafraîchissent.
- **File d'envoi** : cocher, ajout rapide (`Idempotency-Key`) et courses (identifiants choisis
  par le navigateur) sont des mutations « en pause » hors ligne, conservées au rechargement et
  rejouées au retour du réseau (`apps/web/src/lib/offline.ts`). Les autres actions échouent tout
  de suite avec un message clair (comme sur Android).
- Effacé à la déconnexion (cache TanStack et pages en cache).

## 9. Stratégie de test

| Niveau | Outil | Cible |
|---|---|---|
| Unitaire | Vitest | `packages/domain` (récurrence, rotation, DST, quick-add) — couverture ≥ 95 % |
| Intégration API | Vitest + Supertest + PostgreSQL réel (base jetable par run) | Auth, isolation foyers, CRUD, découpe de série |
| Google | Vitest avec faux client Google (fake en mémoire fidèle aux codes d'erreur 401/403/404/409/410/429) | Idempotence, doublons, expiration token, révocation, calendrier supprimé |
| E2E web | Playwright | Parcours : inscription → foyer → tâche récurrente → cocher |
| Android | JUnit + Compose UI tests + Robolectric | ViewModels, outbox, écrans |

Tests critiques listés dans le cahier des charges §29 → chacun a un test nommé explicitement.

## 10. Sécurité & RGPD

- **Chiffrement** des refresh tokens Google : AES‑256‑GCM, clé `TOKEN_ENCRYPTION_KEY` (32 octets, base64) hors base ; format `v1:<iv>:<tag>:<ciphertext>` → rotation de clé possible.
- **Rate limiting** : `@nestjs/throttler` — global 600 req/min/IP (`GLOBAL_RATE_LIMIT` ; les membres d'un foyer partagent souvent la même IP), auth 10 req/min/IP (`AUTH_RATE_LIMIT`). Stockage en mémoire en V1 (une instance) ; Redis si plusieurs instances.
- **Headers** : Helmet (API), CSP stricte (web), HSTS.
- **Entrées** : Zod partout, Prisma paramétré (pas de SQL brut non paramétré), React échappe par défaut, pas de `dangerouslySetInnerHTML`.
- **Logs** : pino structuré, **sans** données personnelles ni tokens (redaction configurée).
- **Secrets** : variables d'environnement du fournisseur, jamais dans le repo ; `.env.example` documenté.
- **RGPD** :
  - Données minimales : email, nom d'affichage, hash mdp, tâches. Pas de téléphone, pas d'adresse, pas de tracking tiers.
  - `GET /v1/me/export` (JSON), `DELETE /v1/me` (suppression effective sous 30 j, révocation des tokens Google auprès de Google).
  - Rétention : tâches soft-deleted purgées après 30 j ; `ActivityLog` 12 mois ; sessions expirées purgées quotidiennement.
  - Hébergement UE (Frankfurt) ; Google = sous-traitant choisi par l'utilisateur (consentement explicite à la connexion calendrier).
  - Sentry : `sendDefaultPii=false`, scrubbing des corps de requêtes.

## 11. Infrastructure **[ADR-008]**

| Option | Coût/mois (ordre de grandeur) | + | − |
|---|---|---|---|
| A. Vercel (web) + Render Frankfurt (API, Postgres, Key Value) | ~ 25–40 € | Tout managé, région UE, backups Postgres | Deux fournisseurs de plus, coût récurrent |
| B. Vercel + Railway / Fly.io + Neon | ~ 15–40 € | DX excellente | Plusieurs fournisseurs, facturation variable |
| C. **Coolify auto-hébergé (Docker Compose, Traefik) + Cloudflare** | coût du serveur déjà en place | Infrastructure existante de l'équipe, un seul `docker-compose.prod.yml`, données sur un serveur maîtrisé, pas de dépendance à un PaaS | Backups et mises à jour du serveur à notre charge |
| D. AWS (ECS/RDS/ElastiCache) | ~ 80 €+ | Puissant | Surdimensionné, maintenance lourde |

**Choix : C** (décision du 2026-09-26, remplace le choix initial A) : le serveur Coolify existe
déjà et héberge d'autres projets sur `fs0ciety.org`. Les images Docker restent standard, donc
portables vers A/B/D sans réécriture. Un seul domaine public (`agenda.fs0ciety.org`, service
`web`), API et base internes. Mode opératoire complet : [`deployment.md`](deployment.md).

- CI/CD : GitHub Actions (lint, typecheck, tests, build ; job Android séparé).
- Monitoring : Sentry (web + API + Android), logs pino JSON, `/health/live` et `/health/ready` (DB ; Redis volontairement exclu : sa panne ne fait que retarder la synchro) exposé publiquement en `/healthz`, métriques BullMQ (taille des files, jobs en échec).
- Sauvegardes : service `backup` (dump nuitier restauré en base temporaire pour vérification, copie R2) — cf. `deployment.md` §6.
- Stockage S3 : non nécessaire en MVP (pas de pièces jointes) → reporté.

## 12. Versions (épinglées)

Épinglées volontairement sur des majeures stables et connues ; les montées de version
majeures (TypeScript 7, Next 16, Prisma 7, NestJS 12) feront l'objet d'une PR dédiée.

| Outil | Version |
|---|---|
| Node.js | 22 LTS |
| pnpm / Turborepo | 10 / 2 |
| TypeScript | 5.9 |
| NestJS | 11 |
| Prisma | 6 |
| Next.js / React | 15.5 / 19 |
| Tailwind CSS | 4 |
| PostgreSQL / Redis | 16 / 7 |
| Kotlin / Compose BOM / AGP | 2.x / 2025.x / 8.x |
