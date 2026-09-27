# Intégration Google Calendar

> Fonctionnalité centrale. Calendrier cible : **« Commun G & N »** (compte Google du foyer),
> **jamais** codé en dur : l'utilisateur le sélectionne, on stocke son `calendarId`.

## 1. Deux usages de Google, deux flux séparés

| | Google Sign-In (authentification) | Google Calendar (intégration) |
|---|---|---|
| But | Se connecter à l'app | Écrire dans le calendrier partagé |
| Scopes | `openid email profile` | `calendar.calendarlist.readonly` + `calendar.events` |
| Stockage | `AuthIdentity (provider, sub)` | `GoogleConnection` (refresh token chiffré) |
| Révocation | N'affecte pas le calendrier | N'affecte pas le login |

Un utilisateur connecté par email/mot de passe peut connecter Google Calendar, et inversement.
Le flux calendrier utilise l'**autorisation incrémentale** (`include_granted_scopes=true`) avec
`access_type=offline` et `prompt=consent` (garantit un refresh token).

### Scopes minimaux

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` — lister les calendriers pour sélectionner « Commun G & N ».
- `https://www.googleapis.com/auth/calendar.events` — créer/modifier/supprimer des événements (y compris sur un calendrier partagé dont on n'est pas propriétaire).

On **n'utilise pas** `calendar` (accès total, inutile) ni `calendar.events.owned` (exclurait
un calendrier possédé par l'autre membre).

> ⚠️ **Risque R1 — statut de l'app OAuth.** Ces scopes sont « sensibles ». En statut *Testing*,
> Google **expire les refresh tokens après 7 jours**. Il faut passer le projet Google Cloud en
> *In production*. Sans vérification Google, l'écran de consentement affiche un avertissement
> « application non vérifiée » (acceptable pour un usage personnel, < 100 utilisateurs). Pour
> ouvrir le produit au public : vérification Google, cf.
> [google-oauth-verification.md](google-oauth-verification.md).

## 2. Flux de connexion

```
Web ──GET /v1/calendar/google/connect──▶ API
API: cookie signé httpOnly `gn_cal_oauth` {userId, state, PKCE verifier, next}, 10 min,
     restreint au chemin /v1/calendar/google
API ──302──▶ accounts.google.com (scopes calendrier, PKCE S256, access_type=offline, prompt=consent)
Google ──302 /v1/calendar/google/callback?code&state──▶ API
API: vérifie state, échange code → tokens, lit l'id_token (sub, email)
     upsert GoogleConnection (refresh token chiffré AES-256-GCM)
API ──302──▶ Web <next>?calendar=connected   (ou ?calendarError=<code>)
Web ──GET /v1/households/:id/calendar/available──▶ liste calendarList (accessRole ≥ writer en tête)
Utilisateur choisit « Commun G & N »
Web ──PUT /v1/households/:id/calendar/link {connectionId, calendarId}──▶
API: vérifie accessRole ∈ {owner, writer} via calendarList.get, enregistre HouseholdCalendarLink
     enqueue sync de toutes les occurrences futures éligibles
```

Android : Custom Tab vers la même URL `connect`, retour via App Link `https://<domaine>/oauth/done`.
Le refresh token n'est **jamais** envoyé au client.

Interface attendue :
```
Calendrier partagé
✓ Commun G & N
Google Calendar connecté · via foyer@example.be
```

## 3. Tokens

- Access token : conservé chiffré avec son expiration ; renouvelé si `expiresAt − 60 s < now`.
- Refresh : `POST oauth2.googleapis.com/token`. Réponse `invalid_grant` ⇒ autorisation révoquée ou expirée ⇒ `GoogleConnection.status = REVOKED`, lien du foyer `INVALID` (`GOOGLE_REVOKED`), notification « Reconnectez Google Calendar ». Une reconnexion réactive automatiquement le lien.
- Mutex de refresh par connexion : verrou consultatif PostgreSQL (`pg_advisory_xact_lock`) — pas besoin de Redis, et le verrou suit la transaction qui écrit le nouveau token.
- Déconnexion / suppression de compte : `oauth2.revokeToken` puis suppression des tokens.

## 4. Stratégie de synchronisation **[ADR-009]**

| Option | + | − |
|---|---|---|
| A. Série ↔ **événement récurrent Google** (RRULE) + exceptions | Peu d'événements | La rotation change le titre/description par occurrence ⇒ une exception par occurrence ; « cette occurrence et les suivantes » impose de scinder aussi côté Google ; mapping des instances fragile ; nos règles (rotation par semaine) non exprimables |
| B. **Une occurrence ↔ un événement simple** sur une fenêtre glissante | Mapping 1:1 trivial, idempotent, chaque occurrence peut avoir son responsable, ses modifs, son statut ; scinder une série = opérations locales | Plus d'appels API (négligeable : ~30 événements/semaine pour un couple, quota 1 M req/jour) ; l'utilisateur Google ne voit pas « événement récurrent » |
| C. Hybride | — | Complexité des deux |

**Choix : B.** Fenêtre de synchro : occurrences de `aujourd'hui − 1 j` à `aujourd'hui + 60 j`
(inférieure à l'horizon de matérialisation de 90 j). Le passé n'est jamais réécrit (historique
Google préservé).

### Sens Google → app

Toutes les 5 minutes (et au clic sur « Synchroniser maintenant »), l'API relit **uniquement les
événements qu'elle a créés** pour le foyer et modifiés depuis la relève précédente
(`privateExtendedProperty=gnHouseholdId=…` + `updatedMin`) : les autres événements du calendrier
ne sont jamais lus.

| Modifié dans Google | Effet dans l'app |
|---|---|
| Date, heure, durée (glisser l'événement, l'allonger), journée entière | Reportés sur la tâche ; dans une série : cette occurrence seulement (exception) |
| Titre | Reporté (sans le « ✓ » ni le « · Grace » que l'app ajoute elle-même) |
| Supprimé | La tâche reste dans l'app, elle n'est plus republiée (cf. A7) |
| Description, rappels, couleur, invités | Ignorés (réécrits à la prochaine publication) |

- **Pas d'écho** : l'`etag` de chaque événement publié par l'app est mémorisé ; seuls les
  événements dont l'etag a changé ailleurs sont traités, et reporter une modification Google ne
  republie rien.
- **Conflit** : si la même occurrence a aussi été modifiée dans l'app et pas encore publiée,
  **l'app l'emporte** (elle republie sa version).
- Première relève après connexion : point de départ, l'historique n'est pas rejoué.
- Pas de notifications *push* de Google (webhooks `events.watch`) : elles exigent un domaine
  vérifié et un renouvellement des canaux ; 5 minutes suffisent pour un foyer.

### Idempotence & anti-doublons (triple protection)

1. **ID d'événement déterministe** : Google accepte un `id` fourni par le client (caractères base32hex `a–v0–9`, 5–1024). On utilise `"gn" + uuidOccurrenceSansTirets` (hex ⊂ base32hex). Recréer ⇒ `409 Conflict` ⇒ on bascule en `update` : **impossible de créer deux fois le même événement**, même après un crash entre l'appel Google et l'écriture en base.
2. **extendedProperties.private** : `{ gnOccurrenceId, gnTaskId, gnHouseholdId, gnApp: "agenda-gn" }` → la réconciliation retrouve nos événements via `privateExtendedProperty=gnHouseholdId=…`, sans jamais se fier au titre.
3. **Unicité en base** `(googleCalendarId, googleEventId)` et `occurrenceId` unique dans `CalendarEventLink`.

Note : un événement supprimé chez Google conserve son id (statut `cancelled`) ; un `insert` avec
le même id renvoie 409 → on fait un `update` avec `status: "confirmed"` pour le restaurer si l'app
le souhaite.

### Contenu de l'événement

```
summary:     "Nettoyer la salle de bain · Nicolas"     (format configurable par foyer)
description: "Catégorie : Ménage\nResponsable : Nicolas\n\nOuvrir dans l'app : https://…/o/<id>"
start:       { dateTime: "2026-10-03T10:00:00", timeZone: "Europe/Brussels" }
end:         { dateTime: "2026-10-03T10:45:00", timeZone: "Europe/Brussels" }
(ou date/date pour « journée entière »)
reminders:   { useDefault: false, overrides: [] }       // les rappels viennent de l'app
transparency:"transparent"                              // ne bloque pas la disponibilité
extendedProperties.private: {...}
```
Tâche **terminée** : l'événement est conservé, préfixé « ✓ » (option : supprimer à la complétion).
Tâche **personnelle** : jamais synchronisée dans le calendrier partagé.

## 5. `GoogleCalendarSyncService`

**Implémenté (Phase 4) : un balayage par foyer plutôt qu'un job par occurrence.** La base est la
file d'attente (*outbox*) : toute mutation incrémente `syncVersion` dans sa transaction ; le
balayage traite chaque occurrence de la fenêtre dont `syncVersion ≠ syncedVersion` (ou dont
l'événement doit disparaître). BullMQ ne sert que de **déclencheur** — perdre un job n'a aucune
conséquence, le balayage périodique rattrape tout.

| Méthode | Rôle |
|---|---|
| `sweep(householdId)` | Étend l'horizon des séries, puis pour chaque occurrence éligible : `upsertEvent` / `deleteEvent`. Renvoie `{created, updated, deleted, failed, blocked?, retryInMs?}` |
| `upsertEvent` | `events.insert` avec id déterministe ; 409 ⇒ `patch` ; `patch` 404/410 ⇒ `insert` |
| `deleteEvent` | `events.delete` ; 404/410 ⇒ succès (idempotent) |
| `reconcile(householdId)` | Liste nos événements (filtre `privateExtendedProperty=gnHouseholdId=…`, `showDeleted`) : orphelins ⇒ supprimés, doublons ⇒ l'événement canonique est gardé, supprimés côté Google ⇒ politique A7 (marqués `DELETED_IN_GOOGLE`, **non recréés**), manquants ⇒ remis en attente |
| `removeAllEvents(linkId)` | Retire nos événements (changement de calendrier, déliaison, déconnexion) |

Déclenchement (`CalendarQueueService`) :
- Mutation d'une tâche ⇒ événement de domaine `householdChanged` ⇒ balayage du foyer regroupé
  sur 2 s (`jobId = sweep:<foyer>:<tranche>`), exécuté **hors requête** (jamais de latence Google
  pour l'utilisateur).
- File `calendar-sync` à **concurrence 1** : deux balayages ne se chevauchent jamais.
- Planifications BullMQ : balayage de tous les foyers liés toutes les **10 min**, réconciliation
  toutes les **6 h** ; bouton « Synchroniser maintenant » = réconciliation + balayage.
- Modes (`CALENDAR_SYNC_MODE`) : `queue` si `REDIS_URL` est défini (production), `inline`
  (minuteries en mémoire, développement sans Redis), `off` (tests : appels directs).

### Édition d'une occurrence récurrente (cohérence avec Google)

| Choix utilisateur | Local | Google |
|---|---|---|
| Uniquement cette occurrence | occurrence `isException = true`, `syncVersion++` | `patch` de cet événement |
| Cette occurrence et les suivantes | split de série (cf. `database.md`) | anciens événements futurs supprimés, nouveaux créés (ids déterministes des nouvelles occurrences) |
| Toute la série | mise à jour de la série, régénération des occurrences futures non‑exception non terminées | `patch` des événements futurs ; passés intacts |
| Supprimer cette occurrence | statut `CANCELLED` | `delete` |

## 6. Erreurs Google → comportement → message utilisateur

| Réponse Google | Cause | Retry ? | Statut | Message (FR, clé i18n) |
|---|---|---|---|---|
| 401 | access token expiré | refresh puis 1 retry | — | — |
| `invalid_grant` (refresh) | accès révoqué / mot de passe changé | non | `BLOCKED`, connexion `REVOKED` | « L'accès à Google Calendar a été retiré. Reconnectez votre compte Google. » |
| 403 `forbidden` / `requiredAccessLevel` | pas de droit d'écriture | non | `BLOCKED` | « Impossible de synchroniser cette tâche avec Google Calendar. Le compte connecté n'a pas les droits d'écriture sur "Commun G & N". » |
| 404 sur le calendrier | calendrier supprimé / plus partagé | non | lien `INVALID` | « Le calendrier "Commun G & N" est introuvable. Il a peut-être été supprimé ou n'est plus partagé avec vous. » |
| 403 `rateLimitExceeded` / `userRateLimitExceeded`, 429 | quotas | oui, backoff exp. + jitter | `PENDING` | (silencieux) |
| 5xx, timeout, réseau | Google indisponible | oui, backoff | `PENDING` | « Synchronisation en attente » si > 15 min |
| 409 sur insert | l'événement existe déjà | → update | — | — |
| 404/410 sur update/delete | supprimé côté Google | update → recrée ; delete → succès | — | — |
| 412 (etag) | modifié côté Google entre-temps | relire, appliquer, retry | — | — |

Backoff : `délai = min(2^tentative × 1 s, 1 h) ± 20 % jitter`, 8 tentatives, puis `ERROR` +
notification. Une erreur bloquante (droits, calendrier supprimé, révocation) arrête le balayage
du foyer, passe le lien en `INVALID` et notifie les membres ; le quota (429 / `rateLimitExceeded`)
arrête le balayage et le replanifie après le délai de backoff.

## 7. Cas de droits (cahier des charges §37)

| Situation | Détection | Comportement |
|---|---|---|
| Grace possède le calendrier, Grace connecte | `accessRole = owner` | OK |
| Nicolas possède, Grace connecte | `accessRole = writer` si partagé avec « Apporter des modifications » | OK |
| Partagé en lecture seule | `accessRole = reader`/`freeBusyReader` | Calendrier affiché grisé à la sélection, non sélectionnable, explication |
| Pas partagé du tout | absent de `calendarList` | Aide : « Demandez au propriétaire de partager "Commun G & N" avec votre adresse Google, avec le droit "Apporter des modifications aux événements". » |
| Supprimé après liaison | 404 | lien `INVALID`, bannière, re-sélection |
| Autorisation révoquée | `invalid_grant` | connexion `REVOKED`, bouton « Reconnecter » (pour n'importe quel membre ayant les droits) |

## 8. Tests (Phase 4)

Faux client Google en mémoire (`apps/api/src/calendar/fake-google-calendar.ts`) fidèle aux ids
client, 409, 404/410, 403 lecture seule, 429, `invalid_grant`, expiration des access tokens.
`apps/api/test/calendar.int.test.ts` (16 tests) : OAuth + chiffrement des tokens ; listing et
calendrier en lecture seule refusé ; isolation entre foyers ; tâche récurrente → N événements avec
la rotation dans les titres ; modification d'une occurrence ; « ✓ » à la complétion ; suppressions ;
« celle-ci et les suivantes » ; tâches personnelles / non cochées jamais envoyées ; **crash entre
l'insert Google et l'écriture locale ⇒ aucun doublon** ; expiration du token ; révocation puis
reconnexion ; calendrier supprimé ; quota et erreur transitoire ; réconciliation (orphelin, doublon,
supprimé chez Google, manquant) ; déliaison ; déconnexion. `calendar-queue.int.test.ts` : vraie file
BullMQ sur Redis. E2E Playwright `calendar.spec.ts` (parcours complet avec `E2E_FAKE_GOOGLE=1`).

### Mode démo (développement)

`GOOGLE_CALENDAR_FAKE=true` (refusé si `NODE_ENV=production`) remplace Google par le faux client,
avec trois calendriers : « Commun G & N » (writer), un calendrier principal (owner) et « Jours
fériés » (reader). Le bouton « Connecter Google Calendar » revient directement sur l'application.

### Recette manuelle (à faire une fois en production)

1. Réglages → **Connecter Google Calendar** avec le compte Google du foyer (écran « application non
   vérifiée » : *Paramètres avancés → Accéder à Tandem*).
2. Choisir **« Commun G & N »** (présélectionné) → **Utiliser ce calendrier**.
3. Créer une tâche datée avec « Ajouter au calendrier partagé » ; vérifier l'événement dans Google
   Calendar (titre « Tâche · Prénom »), puis la cocher (« ✓ »), la déplacer, la supprimer.
4. Créer une tâche récurrente avec rotation ; modifier « cette occurrence » puis « toute la série ».
5. Supprimer un événement à la main dans Google : il n'est **pas** recréé (A7).
