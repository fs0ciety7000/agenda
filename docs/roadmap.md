# Roadmap

Chaque phase suit : analyser → proposer → implémenter → tester → vérifier → corriger → documenter.
Une phase n'est « terminée » que si la CI est verte et la documentation à jour.

| Phase | Contenu | Critère de sortie | Statut |
|---|---|---|---|
| **0 — Discovery** | PRD, architecture, BDD, Google Calendar, design system, roadmap, risques | Docs relus et validés par Grace & Nicolas | ✅ Livré (à valider) |
| **1 — Foundation** | Monorepo, CI, Docker Compose (Postgres/Redis), API NestJS + Prisma (schéma complet), auth email/mdp (sessions, refresh rotatif), foyers + isolation, web Next.js (tokens, i18n, login/inscription, shell), squelette Android | `pnpm test` vert (unit + intégration), `pnpm build` vert, CI verte | ✅ Livré (cf. §Phase 1) |
| **2 — Core Tasks** | CRUD tâches ponctuelles, catégories, attribution, statuts, dashboard « Aujourd'hui », vue Tâches + filtres + recherche, quick add (parseur FR/EN déterministe) | E2E Playwright : créer → cocher | ✅ Livré (cf. §Phase 2) |
| **2b — Compte & RGPD** | Google Sign-In, réinitialisation du mot de passe (SMTP générique, Brevo recommandé), export / suppression de compte | Tests d'intégration + E2E | ✅ Livré (cf. §Phase 3 & 2b) |
| **3 — Récurrence & rotation** | `packages/domain` : moteur RRULE-subset, DST, rotation (slots, par semaine, par jour), matérialisation 90 j, exceptions, split de série, 3 modes d'édition | Couverture domaine ≥ 95 %, tests critiques §29 | ✅ Livré (98,6 % des lignes) |
| **4 — Google Calendar** | OAuth calendrier, sélection « Commun G & N », `GoogleCalendarSyncService`, BullMQ, retry/backoff, réconciliation, erreurs humaines | Suite fake Google verte + recette manuelle sur « Commun G & N » | ✅ Livré, recette manuelle à faire (cf. §Phase 4) |
| **5 — Android** | Compose : navigation, dashboard, tâches, calendrier, création rapide, Room + outbox + WorkManager, notifications locales | Tests Compose + instrumentation ; APK de recette | ⏳ |
| **6 — Polish** | Drag & drop calendrier, animations, accessibilité (audit axe + TalkBack), dark mode fin, onboarding complet, statistiques, notifications & préférences | Audit a11y sans violation AA | ⏳ |
| **7 — Production** | Coolify + Cloudflare (`docs/deployment.md`), Sentry, backups vérifiés (restauration testée), passage de l'app OAuth Google en production, politique de confidentialité, AAB Play Store (test interne) | Checklist de mise en production signée | ⏳ |

## Risques principaux

| # | Risque | Impact | Mitigation |
|---|---|---|---|
| R1 | App OAuth Google en « Testing » ⇒ refresh token expiré après 7 jours | Sync cassée chaque semaine | Passer en « In production » dès la Phase 4 ; documenté dans `google-calendar.md` |
| R2 | Bugs de récurrence/DST | Tâches au mauvais moment | Moteur pur, tests exhaustifs (changements d'heure mars/octobre, 29 février, 31 du mois) |
| R3 | Doublons Google | Calendrier pollué, confiance perdue | IDs d'événements déterministes + extendedProperties + réconciliation |
| R4 | Conflits offline Android | Perte de coche / écrasement | Outbox idempotente + versions + « la complétion gagne » |
| R5 | Sur-ingénierie | Retard, maintenance | Worker dans le process API en V1, pas de WebSocket en V1, 1 fournisseur backend |
| R6 | Fuite inter-foyers | Grave (vie privée) | Guard de foyer + filtres Prisma systématiques + tests d'intégration dédiés |
| R8 | Serveur auto-hébergé : perte de disque | Perte des données | Dumps quotidiens + copie hors serveur, restauration testée (`deployment.md` §6) |
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

## Phase 2 — détail de ce qui est livré

- `packages/domain` (logique pure, sans I/O) : dates « murales » et fuseaux (conversion heure locale → UTC,
  changements d'heure : heure inexistante décalée, heure ambiguë = première occurrence), parseur quick add FR/EN.
- API :
  - `POST /households/:id/tasks` (seul le titre est obligatoire), `POST …/tasks/quick` et `POST …/quick-add/parse` (aperçu) ;
  - `GET …/occurrences` : vues `today`, `upcoming`, `overdue`, `unscheduled`, `done`, `all` + filtres personne
    (`me`, id, `together`, `unassigned`), catégorie, priorité, statut, visibilité, recherche ;
  - `PATCH …/occurrences/:id` avec concurrence optimiste (`version` → 409 `VERSION_CONFLICT` + état actuel),
    `POST …/complete` / `…/reopen` idempotents, `DELETE` (suppression douce) ;
  - `GET …/balance` : répartition de la semaine (par personne, à deux, à définir, minutes estimées),
    tâches personnelles exclues ;
  - catégories : créer, renommer, emoji, supprimer (les tâches perdent leur catégorie) ;
  - journal d'activité (noms de champs uniquement, jamais le contenu).
- Règles de vie privée : une tâche personnelle n'est visible, modifiable et comptée que pour son créateur ;
  seul le créateur peut changer la visibilité ; une référence (catégorie, responsable) d'un autre foyer est refusée.
- Web : dashboard (Aujourd'hui, À rattraper, Cette semaine, Répartition), quick add avec aperçu en puces
  (raccourci `N`), formulaire de tâche adaptatif (feuille sur mobile, dialogue sur desktop) avec gestion
  des conflits, cocher avec « Annuler », vue Tâches (9 onglets, filtres, recherche, URL partageable),
  gestion des catégories dans les Réglages.
- Rate limiting global relevé à 600 req/min/IP (`GLOBAL_RATE_LIMIT`) : les deux membres partagent souvent
  la même IP publique à la maison.

Vérifié : 48 tests domaine, 9 tests contracts, 43 tests API (dont vie privée, isolation inter-foyers,
conflit de version, fuseaux), 8 E2E Playwright (desktop + mobile).

Syntaxe du quick add : `demain`, `après-demain`, `lundi`…`dimanche [prochain]`, `dans 3 jours`, `le 12`,
`12/10`, `12 octobre`, `19h`, `19h30`, `19:30`, `midi`, `ce soir` (19:00), `pendant 45 min`, `30 min`,
`@grace`, `@nicolas`, `@nous`, `#courses`, `!` (haute), `!!` (urgente) — et l'équivalent anglais.
La récurrence (« chaque samedi ») arrive avec le moteur de la Phase 3.

## Phase 3 & 2b — détail de ce qui est livré

**Récurrence & rotation** (`packages/domain`, 81 tests, couverture 98,6 % des lignes, seuil 95 % en CI)
- Règles : chaque jour / tous les N jours, jours ouvrés, chaque semaine ou toutes les N semaines sur
  des jours choisis, chaque mois le J ou le dernier jour, tous les N mois, chaque année ; fin à une
  date ou après N fois. Les mois sans le 31 et les 29 février hors années bissextiles sont ignorés
  (RFC 5545).
- Rotation déterministe : fixe, à deux, chacun son tour, séquence personnalisée (G, G, N, N),
  selon le jour de la semaine, avance par occurrence ou par semaine ; reprise au même tour après un
  découpage de série.

**API des séries**
- Matérialisation **paresseuse** (horizon 90 jours, jusqu'à 400 jours à la demande) : avant chaque
  lecture, verrou consultatif PostgreSQL par série, génération idempotente. Remplace le job quotidien
  prévu (ADR-004) tant qu'aucune file de jobs n'existe ; un job BullMQ s'y ajoutera en Phase 4.
- Modifier / supprimer : *cette occurrence* (exception, jamais recalculée), *celle-ci et les
  suivantes* (la série est coupée, une nouvelle tâche prend le relais, l'historique reste intact),
  *toute la série* (régénération **en conservant les identifiants** des occurrences : indispensable
  pour ne pas recréer les événements Google en Phase 4).
- Liste des tâches récurrentes avec prochaine date, aperçu de rotation, conversion d'une tâche
  ponctuelle en tâche récurrente, concurrence optimiste.

**Compte & RGPD (2b)**
- Mot de passe oublié : lien à usage unique valable 30 min, les précédents invalidés, toutes les
  sessions révoquées après changement, aucune énumération des comptes.
- Google Sign-In (OIDC, code + PKCE, `state`, `nonce`, jeton d'identité vérifié) ; jamais de
  rattachement automatique par email, liaison explicite depuis les Réglages.
- Export JSON des données ; suppression immédiate du compte : données personnelles effacées,
  membre anonymisé (« Ancien membre ») dans les foyers partagés, propriété transférée, foyer
  supprimé si l'utilisateur en était le seul membre.

**Web**
- Formulaire : répétition (préréglages + personnalisé), jours de la semaine, fin, rotation
  (fixe, chacun son tour, personnalisée, selon le jour, par semaine) avec aperçu des 5 prochaines
  occurrences calculé par l'API ; choix de la portée à l'enregistrement et à la suppression.
- Onglet « Récurrentes », indicateur ↻ sur les tâches, vue **Calendrier** jour / semaine / mois
  (blocs horaires, chevauchements, ligne de l'heure actuelle, création en cliquant sur un créneau).
- Pages « Mot de passe oublié » et « Nouveau mot de passe », bouton « Continuer avec Google »,
  Réglages « Données & confidentialité » (lier Google, exporter, supprimer le compte).
- Sécurité : Next.js 15.5.26 et React 19.2.8 (correctif CVE-2025-66478).

Vérifié : 81 tests domaine, 12 contracts, 65 API (dont récurrence, portées, concurrence,
Google Sign-In simulé, RGPD, pas d'énumération des comptes), 14 E2E Playwright (desktop + mobile),
rejoués aussi contre les images Docker de production.

Trouvé et corrigé pendant les tests : le jour de répétition ne suivait pas la date choisie après
ouverture du formulaire ; « mot de passe oublié » révélait l'existence d'un compte (réponse 500 en
cas de panne SMTP, temps de réponse plus long) — tout le traitement est désormais en arrière-plan ;
la directive `# syntax=` des Dockerfiles, inutile, imposait un téléchargement Docker Hub à chaque
build (retirée).

Décision : le client API généré depuis l'OpenAPI est abandonné pour l'instant (les schémas Zod
de `packages/contracts` typent déjà le web ; l'OpenAPI actuel est pauvre car l'API valide par Zod
et non par classes). À réévaluer pour Android en Phase 5.

## Phase 4 — détail de ce qui est livré

**API** (`apps/api/src/calendar`)
- Client REST Google Calendar (sans le SDK `googleapis`, ~80 Mo pour 8 appels) avec délai
  maximal de 15 s et classification des erreurs (401, `invalid_grant`, 403 droits / quota, 404/410,
  409, 412, 429, 5xx, réseau).
- OAuth calendrier séparé du Google Sign-In : code + PKCE, `access_type=offline`, scopes minimaux,
  tokens chiffrés AES-256-GCM, refresh sérialisé par verrou PostgreSQL, révocation auprès de Google
  à la déconnexion et à la suppression du compte.
- Sélection du calendrier (jamais d'id codé en dur) : calendriers en lecture seule refusés avec
  un message clair ; changer de calendrier retire les événements de l'ancien.
- Synchronisation par balayage de la base (*outbox* `syncVersion`/`syncedVersion`), une occurrence
  ↔ un événement à id déterministe (anti-doublons même après un crash), fenêtre J−1 → J+60,
  rotation dans le titre (« Sortir les poubelles · Grace », « · à deux »), « ✓ » à la complétion,
  portées *cette occurrence / les suivantes / toute la série* répercutées.
- BullMQ + Redis comme déclencheur (regroupement 2 s, concurrence 1, balayage 10 min,
  réconciliation 6 h) ; backoff exponentiel avec jitter ; erreurs bloquantes ⇒ lien `INVALID`
  + notification ; réconciliation (orphelins, doublons, supprimés chez Google non recréés,
  manquants).

**Web**
- Réglages « Calendrier partagé » : connexion, choix du calendrier (« Commun G & N » présélectionné,
  calendriers en lecture seule grisés et expliqués), état (tâches synchronisées, en attente, en
  erreur, dernière synchro), *Synchroniser maintenant*, changer / délier / déconnecter.
- Case « Ajouter au calendrier partagé » (cochée par défaut pour une tâche datée quand un
  calendrier est lié), badge d'état par tâche, bannière sur l'accueil en cas de problème, étape
  « Connecter Google Calendar » dans l'onboarding.

**Déploiement** : service `redis` interne dans `docker-compose.prod.yml` ; configuration Google
pas à pas dans `deployment.md` §9.

Vérifié : 82 tests API (dont 16 synchro calendrier sur faux Google fidèle et 1 sur vraie file
BullMQ/Redis), E2E Playwright du parcours complet en mode démo (`GOOGLE_CALENDAR_FAKE=true`).

Trouvé et corrigé pendant les tests : un événement orphelin dont l'occurrence n'existe plus était
compté comme doublon ; l'état du calendrier dans Réglages ne se rafraîchissait pas après une
modification de tâche.

Reste à faire côté humain : créer le client OAuth, publier l'app « In production », connecter
Google et choisir « Commun G & N » (`deployment.md` §9), puis la recette de `google-calendar.md` §8.

