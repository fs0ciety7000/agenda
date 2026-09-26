# Intégration Google Calendar

> Fonctionnalité centrale. Calendrier cible : **« Commun G & N »** (compte occmons@gmail.com),
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
> ouvrir le produit au public : vérification Google (quelques semaines) à planifier.

## 2. Flux de connexion

```
Web ──GET /v1/calendar/google/connect──▶ API
API: state = JWT signé {userId, householdId, nonce, PKCE verifier ref}, 10 min
API ──302──▶ accounts.google.com (scopes calendrier, PKCE S256)
Google ──302 /v1/calendar/google/callback?code&state──▶ API
API: vérifie state, échange code → tokens, lit l'id_token (sub, email)
     upsert GoogleConnection (refresh token chiffré AES-256-GCM)
API ──302──▶ Web /settings/calendar?connected=1
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
Google Calendar connecté · via occmons@gmail.com
```

## 3. Tokens

- Access token : conservé chiffré avec son expiration ; renouvelé si `expiresAt − 60 s < now`.
- Refresh : `oauth2.refreshAccessToken`. Réponse `invalid_grant` ⇒ autorisation révoquée ou expirée ⇒ `GoogleConnection.status = REVOKED`, toutes les synchros du foyer passent en `BLOCKED`, notification « Reconnectez Google Calendar ».
- Mutex de refresh par connexion (verrou Redis `SET NX PX`) pour éviter deux refresh concurrents.
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

| Méthode | Rôle |
|---|---|
| `createEvent(occ)` | `events.insert` avec id déterministe ; 409 ⇒ `updateEvent` |
| `updateEvent(occ)` | `events.patch` (ou `update`) ; 404/410 ⇒ recrée |
| `deleteEvent(link)` | `events.delete` ; 404/410 ⇒ considéré succès (idempotent) |
| `syncOccurrence(id)` | Décide create/update/delete selon l'état local ; point d'entrée du job |
| `syncTask(taskId)` / `syncSeries(seriesId)` | Enqueue `syncOccurrence` pour chaque occurrence dans la fenêtre |
| `reconcile(householdId)` | Liste nos événements (filtre `privateExtendedProperty`) sur la fenêtre, compare au local : manquants ⇒ recréés, orphelins (occurrence supprimée) ⇒ supprimés, doublons (même `gnOccurrenceId`, id différent — ne devrait jamais arriver) ⇒ gardés l'événement canonique, suppression des autres, supprimés côté Google ⇒ politique A7 |
| `retryFailedSyncs()` | Réenqueue les `ERROR` retryables dont `nextAttemptAt` est échu |

Chaque job : charge l'occurrence **à jour** (pas de payload périmé dans la file), compare
`syncVersion` vs `syncedVersion`, fait l'appel, puis écrit `syncedVersion`, `etag`, `lastSyncedAt`.
Concurrence : `jobId = occ:<id>` + verrou ⇒ un seul job actif par occurrence.

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
notification ; `retryFailedSyncs` réessaie toutes les heures les erreurs retryables.

## 7. Cas de droits (cahier des charges §37)

| Situation | Détection | Comportement |
|---|---|---|
| Grace possède le calendrier, Grace connecte | `accessRole = owner` | OK |
| Nicolas possède, Grace connecte | `accessRole = writer` si partagé avec « Apporter des modifications » | OK |
| Partagé en lecture seule | `accessRole = reader`/`freeBusyReader` | Calendrier affiché grisé à la sélection, non sélectionnable, explication |
| Pas partagé du tout | absent de `calendarList` | Aide : « Demandez au propriétaire de partager "Commun G & N" avec votre adresse Google, avec le droit "Apporter des modifications aux événements". » |
| Supprimé après liaison | 404 | lien `INVALID`, bannière, re-sélection |
| Autorisation révoquée | `invalid_grant` | connexion `REVOKED`, bouton « Reconnecter » (pour n'importe quel membre ayant les droits) |

## 8. Plan de test (Phase 4)

Faux client Google en mémoire (`FakeGoogleCalendarClient`) reproduisant ids client, 409, 404/410,
403, 429, `invalid_grant` ; puis tests manuels sur un calendrier de test, puis sur « Commun G & N ».
Tests nommés : création récurrente → N événements ; rotation reflétée dans les titres ;
modification d'une occurrence ; suppression d'une occurrence ; split de série ; crash entre
insert Google et commit local (⇒ 409 ⇒ pas de doublon) ; expiration du token ; révocation ;
reconnexion ; calendrier supprimé ; droits en lecture seule ; réconciliation d'un orphelin.
