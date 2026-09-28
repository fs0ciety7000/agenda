# Déploiement — Coolify (Docker Compose) + Cloudflare

> Cible : un serveur avec **Coolify** (proxy **Traefik**), le domaine **tandem-agenda.app** chez
> **Cloudflare**, l'application servie sur **https://tandem-agenda.app**.
> Fichiers concernés : `docker-compose.prod.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`,
> `.env.prod.example`.

## 1. Vue d'ensemble

```
Navigateur / Android
      │  HTTPS
      ▼
Cloudflare (DNS proxifié, TLS, IP client → CF-Connecting-IP)
      │  HTTPS (Full strict)
      ▼
Serveur Coolify ── Traefik :443 ── tandem-agenda.app
                                        │
                                        ▼
                       web (Next.js :3000) ── /v1/*, /healthz ──▶ api (NestJS :4000)
                                                                     │
                                                      ┌──────────────┼──────────────┐
                                                      ▼              ▼              ▼
                                         postgres (:5432)    redis (:6379)   Google Calendar API
```

| Service | Exposition | Rôle |
|---|---|---|
| `web` | **seul service public** (domaine Coolify) | Pages + proxy same-origin `/v1/*` → API |
| `api` | interne (réseau Docker) | API REST ; applique les migrations au démarrage |
| `postgres` | interne | Données (volume `agenda_postgres_data`) |
| `backup` | interne | Sauvegarde nuitière vérifiée par restauration (`agenda_postgres_backups`, copie R2) |
| `redis` | interne | File BullMQ de la synchro Google Calendar (volume `agenda_redis_data`) |

Redis ne contient que des déclencheurs : l'état de synchronisation vit dans PostgreSQL. Perdre
Redis (ou son volume) ne perd aucune donnée ; il n'est donc **pas** à sauvegarder.

### Pourquoi un seul domaine public ?

| Option | + | − |
|---|---|---|
| **A. Web public, API interne (proxy `/v1/*`)** — retenue | Cookies first-party (`SameSite=Lax` suffit), pas de CORS, une seule entrée à protéger, un seul certificat, Android et OAuth Google utilisent le même domaine | Un saut réseau interne de plus (négligeable) |
| B. `api.tandem-agenda.app` public en plus | API joignable directement | Surface d'attaque doublée, CORS + cookies cross-subdomain à régler |

Si un domaine d'API public devient nécessaire plus tard, utiliser un **sous-domaine à un seul
niveau** (`api.tandem-agenda.app`, pas `v1.api.tandem-agenda.app`) : le certificat universel
gratuit de Cloudflare ne couvre que `*.tandem-agenda.app`, pas les niveaux plus profonds.

## 2. Prérequis

- Serveur Coolify opérationnel (Traefik actif, ports 80/443 ouverts), accès au dépôt GitHub
  `fs0ciety7000/agenda` via la GitHub App Coolify (ou une deploy key).
- Zone `tandem-agenda.app` gérée par Cloudflare.
- ≥ 2 Go de RAM libres pendant le build (le build Next.js est le plus gourmand), ~3 Go de disque pour les images.

## 3. Cloudflare

### 3.1 DNS

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| A | `@` (apex `tandem-agenda.app`) | IP publique du serveur Coolify | **DNS only (nuage gris) au premier déploiement**, puis **Proxied (nuage orange)** |

Pourquoi gris d'abord : Traefik obtient le certificat Let's Encrypt par défi HTTP‑01. En mode
proxifié + « Full (strict) », Cloudflare refuserait le certificat auto-signé servi par Traefik
tant que le vrai n'est pas émis (erreur 526). Une fois `https://tandem-agenda.app` servi avec
un certificat Let's Encrypt valide, passer le nuage en orange. Les renouvellements passent
ensuite sans problème à travers Cloudflare.

### 3.2 Réglages de la zone

| Réglage | Valeur | Raison |
|---|---|---|
| SSL/TLS → mode | **Full (strict)** | Chiffrement de bout en bout, certificat d'origine vérifié |
| Always Use HTTPS | On | Cookies `Secure` |
| Minimum TLS | 1.2 | |
| Rocket Loader | **Off** | Réécrit les scripts : casse l'hydratation React |
| Email Address Obfuscation | **Off** (ou règle de configuration sur ce hostname) | Modifie le HTML : erreurs d'hydratation |
| Cache | Par défaut (le HTML et le JSON ne sont pas mis en cache) + **Cache Rule « Bypass »** pour `tandem-agenda.app/v1/*` | Ne jamais servir une réponse d'API d'un autre utilisateur |

### 3.3 IP réelle du client

Cloudflare pose `CF-Connecting-IP` ; l'API l'utilise pour le rate limiting
(`CLIENT_IP_HEADER=cf-connecting-ip`). Sans cela, l'API ne verrait que l'IP du conteneur web
et **tous** les utilisateurs partageraient la même limite.

Cet en-tête n'est fiable que si le trafic passe par Cloudflare. **Recommandé** : pare-feu du
serveur limitant 80/443 aux [plages IP Cloudflare](https://www.cloudflare.com/ips/) (après
l'émission du premier certificat), en gardant le port d'administration de Coolify accessible
depuis votre IP.

## 4. Coolify

### 4.1 Créer la ressource

1. **Projects → + New → Resource → Private Repository (GitHub App)** → `fs0ciety7000/agenda`.
2. Branche : `main` (ou la branche de déploiement choisie).
3. **Build Pack : Docker Compose**.
4. **Docker Compose Location : `/docker-compose.prod.yml`** (le `docker-compose.yml` de la racine
   sert au développement local uniquement).
5. Enregistrer : Coolify lit le compose et liste les services `web`, `api`, `postgres`.

### 4.2 Domaine

Dans la ressource → service **web** → *Domains* :

```
https://tandem-agenda.app:3000
```

Le suffixe `:3000` indique à Traefik le **port du conteneur**. L'URL publique reste
`https://tandem-agenda.app`. Ne mettre **aucun** domaine sur `api` ni `postgres`.

Service **docs** (site de documentation, facultatif) → *Domains* :
`https://docs.tandem-agenda.app:80` — voir §13.
Aucun label Traefik dans le compose : Coolify génère tout le routage.

### 4.3 Variables d'environnement

Coolify détecte les `${VAR}` du compose et les affiche dans *Environment Variables*. Celles
marquées `:?` sont **obligatoires** : le déploiement échoue avec un message clair si elles
manquent. Modèle complet : `.env.prod.example`.

| Variable | Valeur | Génération |
|---|---|---|
| `WEB_ORIGIN` | `https://tandem-agenda.app` | — |
| `POSTGRES_PASSWORD` | secret | `openssl rand -hex 24` |
| `JWT_SECRET` | secret ≥ 32 caractères | `openssl rand -base64 48` |
| `TOKEN_ENCRYPTION_KEY` | 32 octets en base64 | `openssl rand -base64 32` |
| `CLIENT_IP_HEADER` | `cf-connecting-ip` | défaut |
| `REGISTRATION_ENABLED` | `true`, puis **`false`** après vos deux inscriptions | cf. §5 |
| `AUTH_RATE_LIMIT` | `10` | défaut (connexion, inscription, refresh) |
| `GLOBAL_RATE_LIMIT` | `600` | défaut (toute l'API, par IP) |
| `POSTGRES_USER` / `POSTGRES_DB` | `agenda` | défaut |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | active Google Calendar et « Continuer avec Google » | cf. §9 |
| `SMTP_*`, `EMAIL_FROM` | facultatif : active « Mot de passe oublié » | cf. §8 |
| `GITHUB_RELEASES_TOKEN` | vide si le dépôt est public ; sinon jeton GitHub lecture seule (Contents) | cf. [`android.md`](android.md) §4 |
| `SENTRY_DSN` | facultatif : suivi des erreurs (§10) | DSN Sentry / GlitchTip |
| `FCM_SERVICE_ACCOUNT` | facultatif : notifications instantanées Android | JSON du compte de service Firebase (docs/android.md §4.1) |
| `INBOUND_EMAIL_ADDRESS`, `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY` | facultatif : tâches par e-mail (réception par Resend) | cf. [`email-to-task.md`](email-to-task.md) |
| `ADMIN_EMAILS` | facultatif : accès à la page d'administration | adresses e-mail séparées par des virgules ; reçoivent aussi les alertes de surveillance |
| `METRICS_TOKEN` | facultatif : `GET /metrics` (Prometheus) | secret d'au moins 16 caractères, cf. `monitoring.md` |
| `DOCS_URL` | facultatif : adresse du site de documentation (build) | `https://docs.tandem-agenda.app` par défaut, cf. §13 |
| `BACKUP_HEARTBEAT_URL` | facultatif : battement de cœur des sauvegardes | URL « Push » d'Uptime Kuma / Healthchecks.io |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` | facultatif : notifications du site (navigateur) | paire de clés VAPID, voir ci-dessous |
| `WEB_PUSH_SUBJECT` | facultatif | contact pour les services de push (`mailto:…` ou `https://…`) ; défaut : `WEB_ORIGIN` |

**Clés VAPID (notifications du site).** À générer une seule fois : Coolify → service `api` →
*Terminal* → `node -e "console.log(require('web-push').generateVAPIDKeys())"`, puis copier
`publicKey` dans `WEB_PUSH_PUBLIC_KEY` et `privateKey` dans `WEB_PUSH_PRIVATE_KEY` (secrète, sans
*Available at Buildtime*) et redéployer. Chaque personne active ensuite les notifications dans
Réglages → Notifications → « Activer sur ce navigateur ». Changer les clés oblige chacun à les
réactiver.

`REDIS_URL` est fixée par le compose (`redis://redis:6379`) : rien à définir.

⚠️ **`TOKEN_ENCRYPTION_KEY` ne doit jamais changer** une fois Google Calendar connecté : les
tokens chiffrés deviendraient illisibles (il faudrait reconnecter Google). Conservez-la dans un gestionnaire de
mots de passe. Changer `JWT_SECRET` déconnecte simplement tout le monde.

Cocher *Is Build Variable?* n'est nécessaire pour aucune de ces variables : la seule valeur de
build (`API_URL=http://api:4000`) est fixée dans le compose.

### 4.4 Déployer

**Deploy.** Séquence attendue (logs Coolify) :

1. Build des images `api` et `web` (≈ 2–4 min au premier build).
2. `postgres` devient *healthy*.
3. `api` démarre : `prisma migrate deploy` applique les migrations (« All migrations have been successfully applied »), puis *healthy* via `/health/ready`.
4. `web` démarre après l'API, *healthy* via `/login`.

Vérifications :

```bash
curl -s https://tandem-agenda.app/healthz        # {"status":"ok","checks":{"database":"ok"}}
curl -sI https://tandem-agenda.app/ | head -3     # 307 → /login
```

### 4.5 Déploiements suivants

- Activer *Auto Deploy* (webhook GitHub) : chaque push sur la branche redéploie.
- Les migrations sont appliquées automatiquement au démarrage de l'API (`migrate deploy`
  n'applique que des migrations versionnées, jamais de reset).
- **Rollback** : redéployer un commit précédent depuis Coolify. Les migrations sont *forward
  only* : une migration destructive (suppression de colonne) doit toujours être livrée en deux
  temps (code compatible d'abord, suppression ensuite) pour qu'un rollback de code reste sûr.

## 5. Premier démarrage

1. Ouvrir https://tandem-agenda.app → **Créer un compte** (Nicolas, par exemple).
2. Onboarding : créer le foyer « G & N » → **Générer un lien d'invitation** → l'envoyer à Grace.
3. Grace ouvre le lien → crée son compte → **Rejoindre**.
4. Dans Coolify : `REGISTRATION_ENABLED=false` → **Redeploy**. Les comptes existants continuent
   de se connecter ; toute nouvelle inscription reçoit « Les inscriptions sont fermées ».

## 6. Sauvegardes

Le service **`backup`** du compose s'en charge, sans configuration dans Coolify :

- chaque nuit (`BACKUP_HOUR`, UTC, défaut 2 h 15) et au premier démarrage : `pg_dump` compressé
  dans le volume `agenda_postgres_backups`, conservé 14 jours (`BACKUP_RETENTION_DAYS`) ;
- **chaque dump est restauré dans une base temporaire** et contrôlé (comptes, foyers,
  occurrences) : un dump inutilisable est signalé le jour même (`ÉCHEC` dans les logs) ;
- copie **hors serveur** si configurée (ci-dessous), conservée 30 jours ;
- le conteneur passe **unhealthy** sans sauvegarde réussie depuis 26 h : activer les
  notifications Coolify (*Settings → Notifications*, e-mail ou Discord) pour être prévenu.

Logs : Coolify → service `backup` → *Logs*, ligne
`backup: OK …/agenda-AAAA-MM-JJTHHMM.dump (…) — restauration vérifiée : N comptes, …`.

### 6.1 Copie hors serveur (recommandé) — Cloudflare R2

Un disque qui lâche ou un serveur perdu emporte aussi les dumps locaux.

1. Cloudflare → **R2** → *Create bucket* `agenda-backups` (région automatique, privé). Le plan
   gratuit (10 Go) suffit largement (un dump fait quelques centaines de Ko).
2. R2 → *Manage API tokens* → *Create API token* : permission **Object Read & Write**, limité au
   bucket `agenda-backups`. Noter *Access Key ID*, *Secret Access Key* et l'*endpoint*
   (`https://<id-compte>.r2.cloudflarestorage.com`).
3. Dans Coolify (variables de la ressource), puis redéployer :

| Variable | Valeur |
|---|---|
| `BACKUP_OFFSITE_REMOTE` | `offsite:agenda-backups` |
| `BACKUP_S3_ENDPOINT` | `https://<id-compte>.r2.cloudflarestorage.com` |
| `BACKUP_S3_ACCESS_KEY_ID` | clé du jeton |
| `BACKUP_S3_SECRET_ACCESS_KEY` | secret du jeton |

Autre stockage S3 (Backblaze B2, Scaleway…) : `BACKUP_S3_PROVIDER` (valeur rclone) + mêmes variables.
Vérifier dans les logs : `copie hors serveur : offsite:agenda-backups/agenda-….dump`.

### 6.2 Sauvegarde immédiate

Site → Réglages → **Administration** → « Sauvegarder maintenant » (compte listé dans
`ADMIN_EMAILS`) : le service `backup` la prend en charge dans la minute ; l'historique (nuit,
démarrage, manuelles, avec taille, contrôle de restauration et copie hors serveur) s'affiche au
même endroit. Sans accès au site : Coolify → service `backup` → *Terminal* : `backup.sh once`.

### 6.3 Restauration

```sh
# Coolify → service backup → Terminal
ls /backups
backup.sh restore /backups/agenda-AAAA-MM-JJTHHMM.dump
```

Puis redémarrer le service `api`. Depuis R2 : télécharger le fichier
(`rclone copy offsite:agenda-backups/agenda-….dump /backups/`) puis même commande.

## 7. Android

L'app parle au **même domaine** que le web (le proxy `/v1/*` est public) : rien à déployer côté
serveur. APK de recette publié par la CI, ou APK signé avec votre clé : voir
[`android.md`](android.md) §4.

## 8. Emails (mot de passe oublié)

L'API envoie ses emails en **SMTP standard** : n'importe quel fournisseur convient, sans changer
le code. Sans `SMTP_HOST`, rien n'est envoyé (le lien « Mot de passe oublié » est alors masqué).

| Fournisseur | Offre gratuite | + | − |
|---|---|---|---|
| **Resend** (utilisé) | 3 000/mois (100/jour) | Très simple, bonne délivrabilité, même compte que la **tâche par e-mail** (réception) | Société américaine |
| Brevo | 300 emails/jour, sans carte bancaire | Société française, données dans l'UE | Interface un peu chargée |
| Mailjet | 200/jour | Européen | Quota plus faible |
| Gmail + mot de passe d'application | 500/jour | Rien à créer | Lie l'app à un compte personnel, délivrabilité moyenne |

Pour un foyer (quelques emails par an), l'offre gratuite de Resend suffit largement.

### 8.1 Resend, pas à pas

1. Créer un compte sur resend.com (celui de la tâche par e-mail s'il existe déjà).
2. **Domains → Add Domain** : `tandem-agenda.app`, région **Ireland (eu-west-1)** (données dans
   l'UE).
3. Resend affiche les enregistrements DNS à créer. Deux façons de faire :
   - bouton **Auto configure** (connexion à Cloudflare) : Resend crée lui-même les enregistrements ;
   - ou à la main dans **Cloudflare → DNS**, en **DNS only** (nuage gris : les enregistrements de
     messagerie ne se proxifient pas), en recopiant exactement nom et valeur :
     - `TXT` `resend._domainkey` : la clé DKIM ;
     - `MX` `send` : le serveur de retour (`feedback-smtp.eu-west-1.amazonses.com`, priorité 10) ;
     - `TXT` `send` : le SPF (`v=spf1 include:amazonses.com ~all`).

   Ces enregistrements portent sur le sous-domaine `send` : ils ne gênent ni un autre SPF à la
   racine, ni le sous-domaine `tasks` de la réception.
4. Recommandé : `TXT` `_dmarc` = `v=DMARC1; p=none;` (améliore la délivrabilité ; durcir plus
   tard en `p=quarantine`).
5. **Verify DNS Records**, attendre l'état **Verified** (quelques minutes).
6. **API Keys → Create API Key** : nom « Tandem SMTP », permission **Sending access**, domaine
   `tandem-agenda.app`. Renseigner dans Coolify :

| Variable | Valeur |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `resend` |
| `SMTP_PASSWORD` | la clé API (`re_…`) — secret, jamais dans le dépôt |
| `EMAIL_FROM` | `Tandem <no-reply@tandem-agenda.app>` |

Les e-mails reprennent le logo (chargé depuis `WEB_ORIGIN/icons/icon-192.png`) et un pied avec
les liens Confidentialité, Aide (`DOCS_URL`), Signaler un problème et Réglages ; l'adresse
`PRIVACY_CONTACT_EMAIL`, si elle est renseignée, y apparaît aussi.

7. Redéployer, puis tester « Mot de passe oublié » avec votre adresse. **Emails** (tableau de bord
   Resend) montre chaque envoi et, en cas d'échec, la raison.

Cette clé d'envoi est distincte de `RESEND_API_KEY` (tâche par e-mail, qui lit les messages
reçus) : une clé par usage, révocable séparément.

**Brevo** (alternative) : *Domains → Add a domain*, enregistrements DKIM/DMARC dans Cloudflare,
expéditeur `no-reply@tandem-agenda.app`, puis `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`,
`SMTP_USER` = identifiant `…@smtp-brevo.com`, `SMTP_PASSWORD` = clé SMTP Brevo.

## 9. Google Calendar et connexion Google

Un seul client OAuth pour les deux usages. Dans la **Google Cloud Console**, idéalement avec le
compte Google du foyer :

1. Créer un projet (ex. « Tandem ») ; **APIs & Services → Library** : activer
   **Google Calendar API**.
2. **OAuth consent screen** (*Google Auth Platform*) : type *External*, nom « Tandem »,
   email d'assistance, domaine autorisé `tandem-agenda.app`. **Data access** : ajouter les scopes
   `openid`, `email`, `profile`, `…/auth/calendar.calendarlist.readonly` et
   `…/auth/calendar.events` — rien de plus (pas `…/auth/calendar`).
   **Branding** : *Application privacy policy link* = `https://tandem-agenda.app/privacy`
   (renseigner `PRIVACY_CONTACT_EMAIL` dans Coolify pour y afficher une adresse de contact).
3. **Audience → Publish app** : passer en **« In production »**. Indispensable : en *Testing*,
   Google invalide les autorisations au bout de 7 jours et la synchro s'arrêterait chaque semaine
   (risque R1). Sans vérification Google, l'écran de consentement affiche « Google n'a pas validé
   cette application » : cliquer *Paramètres avancés → Accéder à Tandem* (normal pour une
   app personnelle, limite de 100 utilisateurs). Pour ouvrir l'app à d'autres foyers : faire
   vérifier l'app, cf. [google-oauth-verification.md](google-oauth-verification.md).
4. **Clients → Create client → Web application** :
   - Authorized JavaScript origins : `https://tandem-agenda.app`
   - Authorized redirect URIs (exactement, sans barre finale) :
     - `https://tandem-agenda.app/v1/calendar/google/callback` (calendrier)
     - `https://tandem-agenda.app/v1/auth/google/callback` (connexion avec Google)
5. Renseigner `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans Coolify et redéployer.
6. Dans l'app : **Réglages → Calendrier partagé → Connecter Google Calendar**, autoriser, choisir
   **« Commun G & N »** → *Utiliser ce calendrier*. Un seul membre du foyer a besoin de connecter
   son compte, s'il a le droit « Apporter des modifications aux événements » sur ce calendrier.

Les URI de redirection sont dérivées de `WEB_ORIGIN` : aucune variable supplémentaire.

Sécurité : un compte Google n'est jamais rattaché automatiquement à un compte existant ayant la
même adresse (prise de contrôle possible). Pour lier Google à un compte créé avec un mot de passe :
**Réglages → Données & confidentialité → Lier Google**.

## 10. Surveillance et maintenance

Vue complète (sondes internes, page `/status`, alertes, Uptime Kuma, Prometheus) :
[`monitoring.md`](monitoring.md).

- **Disponibilité** : le workflow GitHub `Disponibilité` (`.github/workflows/uptime.yml`) appelle
  `https://tandem-agenda.app/healthz` (web → API → base) toutes les 2 heures, **depuis
  l'extérieur du serveur**. Après 3 échecs d'affilée, il ouvre un ticket « Site indisponible »
  (étiquette `panne`) : GitHub vous prévient par email / sur l'appli mobile (*Watch* le dépôt ou
  être propriétaire suffit). Le ticket se ferme tout seul au retour du site.
  - Autre adresse : variable de dépôt `UPTIME_URL` (*Settings → Secrets and variables → Actions →
    Variables*).
  - GitHub peut retarder les tâches planifiées de quelques minutes, et les suspend après 60 jours
    sans activité sur le dépôt (un clic sur *Enable workflow* les relance).
  - Alternative avec alerte SMS / appli dédiée : UptimeRobot ou Better Stack (gratuits) sur la
    même URL `/healthz`. Uptime Kuma est possible, mais **sur une autre machine** : installé sur le
    même serveur, il tomberait avec lui.
- **Sauvegardes** : service `backup` *unhealthy* s'il n'y a pas eu de sauvegarde réussie depuis
  26 h → activer les notifications Coolify (*Settings → Notifications*, email ou Telegram).
- **Mises à jour des dépendances** : Dependabot (`.github/dependabot.yml`) ouvre chaque lundi un
  PR groupé par écosystème (npm, Gradle, images Docker ; actions GitHub chaque mois) pour les
  versions mineures et correctifs, et un PR par version majeure. Activer aussi *Settings → Code
  security → Dependabot security updates* : une faille connue ouvre un PR immédiatement. La CI
  valide chaque PR ; fusionner quand elle est verte (les majeures : lire le changelog).
  Majeures ignorées volontairement (à migrer à la main, de façon coordonnée) :
  - **OkHttp 5** : Retrofit 3 et MockWebServer reposent encore sur OkHttp 4 ;
  - **PostgreSQL** : l'image de `backup` doit avoir la même majeure que le serveur (un dump
    `pg_dump` 17+ contient `transaction_timeout`, que PostgreSQL 16 ne sait pas restaurer).
    Changer de majeure = migrer la base (dump / restauration) puis les deux images ensemble ;
  - **Node** : versions LTS paires uniquement, mises à jour à la main.

  Android : depuis AGP 9, Kotlin est intégré au plugin Android (plus de plugin
  `org.jetbrains.kotlin.android`) et les bibliothèques AndroidX récentes exigent `compileSdk` 37.
  `targetSdk` reste une décision séparée (exigence Google Play).
- **Logs** : Coolify → ressource → *Logs* (JSON structuré pino côté API ; aucun token ni cookie
  n'y figure).
- **Erreurs (Sentry, facultatif)** : sans configuration, les erreurs du serveur, du site et de
  l'app Android sont déjà écrites dans les logs de `api` (message `client error` / `server error`).
  Pour être alerté par email avec le détail (pile d'appels, navigateur, version de l'app) :
  1. Créer un compte gratuit sur https://sentry.io (offre *Developer*, suffisante pour deux
     personnes ; ou GlitchTip, compatible, auto-hébergeable).
  2. *Create Project* → plateforme **Node.js** → nom `agenda`. Copier le **DSN** affiché
     (`https://…@o….ingest.sentry.io/…`).
  3. Coolify → variable `SENTRY_DSN` = ce DSN → redéployer. Un seul DSN suffit : le site et l'app
     Android envoient leurs erreurs à l'API (`/v1/client-errors`), qui les transmet.
  4. Vérifier : Sentry → *Issues* ; les alertes email sont actives par défaut.
  Aucune donnée personnelle n'est envoyée (ni email, ni contenu des tâches, ni jetons).

## 11. Checklist de sécurité

- [ ] Nuage orange actif, SSL **Full (strict)**, Always Use HTTPS.
- [ ] Seul `web` a un domaine ; `api`, `postgres` et `redis` n'ont ni domaine ni port publié.
- [ ] App OAuth Google en « In production », scopes limités à ceux du §9.
- [ ] Secrets générés aléatoirement, stockés uniquement dans Coolify (+ gestionnaire de mots de passe).
- [ ] `REGISTRATION_ENABLED=false` après l'inscription du foyer (vaut aussi pour Google Sign-In).
- [ ] Domaine d'envoi authentifié (DKIM/SPF/DMARC) si les emails sont activés.
- [ ] Pare-feu : 80/443 limités aux IP Cloudflare ; SSH par clé uniquement.
- [ ] Dump quotidien actif **et** copie hors serveur ; restauration testée une fois.
- [ ] Mises à jour de sécurité du serveur et de Coolify planifiées.

## 12. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| 526 Invalid SSL certificate | Nuage orange avant l'émission du certificat Let's Encrypt | Repasser en DNS only, attendre le certificat, remettre Proxied |
| 502 / 503 depuis Traefik | `web` pas encore *healthy*, ou domaine sans `:3000` | Logs Coolify ; vérifier `https://tandem-agenda.app:3000` dans *Domains* |
| Connexion OK mais on revient sans cesse sur /login | Cookies `Secure` sur un accès HTTP | Toujours passer par `https://` (Always Use HTTPS) |
| Tout le monde reçoit « Trop de tentatives » | `CLIENT_IP_HEADER` absent, ou trafic ne passant pas par Cloudflare | `CLIENT_IP_HEADER=cf-connecting-ip`, nuage orange |
| `/v1/*` renvoie 500 « Internal Server Error » en texte brut | API injoignable depuis `web` | Vérifier que le service s'appelle bien `api` et qu'il est *healthy* |
| L'API redémarre en boucle | Variable manquante/invalide (message `Invalid environment`) ou migration en échec | Logs du service `api` |
| `redirect_uri_mismatch` chez Google | URI absente ou différente dans le client OAuth | Copier exactement `https://tandem-agenda.app/v1/calendar/google/callback` (§9) |
| « La connexion avec Google a expiré ou a été ouverte dans un autre navigateur » | Cookie du flux absent : plus de 10 min sur l'écran Google, navigateur différent (ex. lien ouvert depuis une autre app), cookies bloqués | Relancer depuis le même navigateur, sans navigation privée |
| « Google a refusé la connexion » + log `TOKEN_ENCRYPTION_KEY must be 32 …` | Clé de chiffrement invalide (depuis ce correctif, l'API refuse de démarrer avec ce message) | `openssl rand -base64 32` → coller le résultat (44 caractères, finit par `=`) dans `TOKEN_ENCRYPTION_KEY`, redéployer, reconnecter Google |
| « Google n'a pas donné accès à votre calendrier » | Cases décochées sur l'écran de consentement Google | Relancer et cocher les deux cases |
| « Google a refusé la connexion » | Échange du code refusé : `GOOGLE_CLIENT_SECRET` erroné, client OAuth différent, API Calendar non activée | Logs `api` : ligne `Calendar connection failed: Google API 401 unauthorized (invalid_client)` ⇒ secret ; vérifier §9 |
| « Google Calendar n'est pas configuré » dans Réglages | `GOOGLE_CLIENT_ID`/`SECRET` vides | Les renseigner dans Coolify, redéployer |
| Synchro arrêtée au bout d'une semaine | App OAuth restée en *Testing* | La publier « In production », puis *Reconnecter* dans Réglages |
| Tâches « en attente » de synchro qui n'avancent pas | `redis` non *healthy*, ou quota Google | Logs `api` (`Calendar sync mode: queue`, `Sweep …`) ; le balayage reprend toutes les 10 min |
| Build `web` échoue sur `next/font` | Pas d'accès à `fonts.googleapis.com` pendant le build | Autoriser la sortie réseau du serveur pendant le build |

## 13. Site de documentation

Le service `docs` du compose sert ce site (Docusaurus construit, servi par nginx) : guide
d'utilisation, technique, confidentialité, nouveautés et référence de l'API. Il est **statique**
et indépendant : il n'a accès ni à l'API ni à la base.

1. **Cloudflare → DNS** : enregistrement `A` `docs` vers l'IP du serveur (nuage gris au
   premier déploiement, puis orange, comme en §3.1). `docs.tandem-agenda.app` est à **un seul niveau**
   sous `tandem-agenda.app` : il est couvert par le certificat Cloudflare gratuit.
2. **Coolify** → service **docs** → *Domains* : `https://docs.tandem-agenda.app:80`.
3. Autre adresse : variable `DOCS_URL` (utilisée au build pour les liens et le plan du site),
   puis redéployer.

Le site est public : il ne contient ni secret ni donnée, seulement la documentation du dépôt.
Pour le réserver au foyer, placer le domaine derrière **Cloudflare Access** (Zero Trust →
Access → Applications, gratuit jusqu'à 50 utilisateurs, connexion par code e-mail).

En local : `cd apps/docs && npm ci && npm start`. Le contenu est le dossier `docs/` du dépôt ;
la référence de l'API (`apps/docs/static/openapi.json`) est régénérée par
`pnpm --filter @agenda/api openapi` après une modification de l'API (vérifié en CI).

## 14. Passer sur `tandem-agenda.app` : procédure complète

Le site passe de l'ancien domaine à **tandem-agenda.app** et l'app Android prend son identifiant
définitif **`app.tandem.foyer`** (au lieu de `be.agendagn.app` ; un identifiant ne peut plus
changer après le premier envoi sur Google Play). Le code est prêt : les étapes ci-dessous sont
toutes **hors dépôt** (consoles), dans cet ordre. Compter une soirée, surtout de l'attente DNS.

> Règle d'or : **ne rien retirer de l'ancien domaine** avant la fin de l'étape 13. Les apps
> Android déjà installées l'appellent en dur.

### 14.1 Domaine et DNS (Cloudflare)

1. Acheter `tandem-agenda.app` (Cloudflare Registrar le fait au prix coûtant : la zone est alors
   créée d'office). Chez un autre registraire : Cloudflare → *Add a site* →
   `tandem-agenda.app` (offre Free), puis remplacer chez le registraire les serveurs de noms par
   les deux indiqués par Cloudflare. Attendre l'e-mail « active » (quelques minutes à 24 h).
2. **DNS → Records** :

   | Type | Nom | Contenu | Proxy |
   |---|---|---|---|
   | A | `@` | IP du serveur Coolify | gris, puis orange (§3.1) |
   | A | `docs` | IP du serveur Coolify | gris, puis orange |
   | A | `status` | IP du serveur Uptime Kuma (si page de statut, [monitoring.md](monitoring.md)) | gris, puis orange |

   Les enregistrements e-mail (Resend : envoi et `tasks`) viennent aux étapes 14.4 et 14.5.
3. Reprendre **tous les réglages de zone** du §3.2 (Full strict, Always HTTPS, Rocket Loader off,
   Email Obfuscation off, **Cache Rule « Bypass » sur `tandem-agenda.app/v1/*`**) et §3.3.
4. `.app` est un domaine « HTTPS obligatoire » (HSTS préchargé dans les navigateurs) : aucun test
   possible en HTTP ; un certificat valide est indispensable dès le premier accès.

### 14.2 Coolify

1. Service **web** → *Domains* : `https://tandem-agenda.app:3000,https://<ancien domaine>:3000`
   (les deux, séparés par une virgule : l'ancien reste servi pendant la transition).
2. Service **docs** → *Domains* : `https://docs.tandem-agenda.app:80` (l'ancien peut être retiré).
3. **Environment Variables** (§4.3) :

   | Variable | Nouvelle valeur |
   |---|---|
   | `WEB_ORIGIN` | `https://tandem-agenda.app` (sans barre finale) |
   | `EMAIL_FROM` | `Tandem <no-reply@tandem-agenda.app>` (après 14.4) |
   | `PRIVACY_CONTACT_EMAIL` | une adresse `@tandem-agenda.app` si vous en créez une |
   | `INBOUND_EMAIL_ADDRESS` | `{token}@tasks.tandem-agenda.app` (après 14.5) |
   | `WEB_PUSH_SUBJECT` | vide (= `WEB_ORIGIN`) ou `mailto:…@tandem-agenda.app` |
   | `DOCS_URL` | vide (défaut `https://docs.tandem-agenda.app`) |

   `WEB_ORIGIN` fixe CORS, les liens des e-mails et notifications, les adresses de retour Google
   et l'adresse de l'APK : c'est **la** valeur à changer.
4. **Redeploy**. Vérifier `https://tandem-agenda.app/healthz` et
   `https://docs.tandem-agenda.app`, puis passer les nuages en orange.

### 14.3 GitHub (variables du dépôt)

*Settings → Secrets and variables → Actions → Variables* :

- `AGENDA_API_BASE_URL` : `https://tandem-agenda.app/` (ou supprimer : c'est la valeur par défaut) ;
- `UPTIME_URL` : `https://tandem-agenda.app/healthz` (ou supprimer, idem).

### 14.4 E-mails sortants (Resend, §8.1)

1. Resend → **Domains → Add Domain** : `tandem-agenda.app` (région Ireland), puis **Auto configure**
   ou recopier dans Cloudflare, nuage gris : `TXT resend._domainkey` (DKIM), `MX send` et
   `TXT send` (SPF), et si possible `TXT _dmarc` = `v=DMARC1; p=none;`.
2. **Verify DNS Records** → état **Verified**.
3. **API Keys** : si la clé actuelle (`SMTP_PASSWORD`) est limitée à l'ancien domaine, en créer une
   nouvelle (*Sending access*, domaine `tandem-agenda.app`) et remplacer `SMTP_PASSWORD` ; une clé
   « tous domaines » peut rester telle quelle. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` ne changent pas.
4. Seulement alors, changer `EMAIL_FROM` en `Tandem <no-reply@tandem-agenda.app>` (14.2) et
   redéployer : un expéditeur sur un domaine non vérifié est refusé par Resend (erreur 403,
   visible dans *Emails* et dans les journaux de l'API).
5. Tester « Mot de passe oublié » : le lien reçu doit pointer vers
   `https://tandem-agenda.app/reset-password…`.
6. Plus tard (fin de transition), supprimer l'ancien domaine dans Resend.

### 14.5 Tâche par e-mail (si utilisée, [email-to-task.md](email-to-task.md))

1. Resend → *Domains* : ajouter `tasks.tandem-agenda.app` et **activer la réception** ; recopier
   dans Cloudflare le **MX** et les TXT affichés (nuage gris).
2. Resend → *Webhooks* : modifier l'URL en `https://tandem-agenda.app/v1/inbound/resend`
   (événement `email.received`, le secret `whsec_…` ne change pas).
3. Changer `INBOUND_EMAIL_ADDRESS`, redéployer. Chaque membre retrouve sa nouvelle adresse dans
   *Réglages* ; les anciennes adresses cessent de fonctionner quand l'ancien sous-domaine est
   retiré de Resend.

### 14.6 Google (connexion avec Google et Google Calendar, §9)

Dans la **Google Cloud Console**, projet de l'app :

1. **Search Console** (https://search.google.com/search-console) : *Ajouter une propriété* →
   *Domaine* `tandem-agenda.app` → enregistrement TXT à ajouter dans Cloudflare → *Valider*.
   Même compte Google que la Cloud Console.
2. **Google Auth Platform → Branding** :
   - *Authorized domains* : ajouter `tandem-agenda.app` (garder l'ancien pendant la transition) ;
   - *Application home page* : `https://tandem-agenda.app/about` ;
   - *Privacy policy* : `https://tandem-agenda.app/privacy` ;
   - *Terms of service* (si renseigné) : `https://tandem-agenda.app/privacy`.
3. **Clients** → le client *Web application* :
   - *Authorized JavaScript origins* : **ajouter** `https://tandem-agenda.app` ;
   - *Authorized redirect URIs* : **ajouter**
     `https://tandem-agenda.app/v1/auth/google/callback` et
     `https://tandem-agenda.app/v1/calendar/google/callback` (exactement, sans barre finale).
   - Garder les anciennes entrées jusqu'à la fin de la transition, puis les retirer.
   Le client et son secret ne changent pas (`GOOGLE_CLIENT_ID`/`SECRET` inchangés).
4. Si l'écran de consentement était **validé** par Google : un changement de domaine ou de liens
   relance une vérification ([google-oauth-verification.md](google-oauth-verification.md)) ;
   l'app reste utilisable pendant l'examen.
5. Tester : *Se connecter avec Google* sur le site et dans l'app Android, puis *Réglages →
   Calendrier partagé* (la connexion existante continue ; au besoin *Reconnecter*).

L'app Android n'a **rien** à déclarer chez Google pour la connexion : elle passe par le
navigateur puis revient via `app.tandem.foyer://auth`.

### 14.7 Firebase (notifications instantanées Android, [android.md](android.md) §4.1)

1. Console Firebase → le projet existant → *Paramètres du projet* → *Ajouter une application* →
   Android, package **`app.tandem.foyer`**, surnom « Tandem ».
2. Télécharger le nouveau `google-services.json` (ne pas le committer) et remplacer les variables
   du dépôt **`FCM_APP_ID`** (`mobilesdk_app_id`) et **`FCM_API_KEY`** (`current_key`).
   `FCM_PROJECT_ID` et `FCM_SENDER_ID` ne changent pas, ni `FCM_SERVICE_ACCOUNT` côté API.
3. Garder l'ancienne application Firebase tant que l'ancienne app circule.

### 14.8 Android : nouvelle version

1. Lancer **Actions → « Android — APK à installer » → Run workflow** (ou attendre le prochain
   changement Android sur `main`). La release publie `tandem.apk` et `tandem-play.aab`, construits
   pour `https://tandem-agenda.app/`.
2. Même clé de signature qu'avant (secrets inchangés).

### 14.9 Google Play ([play-store.md](play-store.md))

1. Play Console → *Créer une application* : nom « Tandem », puis au premier envoi l'identifiant
   est lu dans l'AAB : **`app.tandem.foyer`** (définitif).
2. *Règles relatives aux applis → Règles de confidentialité* :
   `https://tandem-agenda.app/privacy` ; *Suppression des données* :
   `https://tandem-agenda.app/privacy` (section suppression du compte) ; site web :
   `https://tandem-agenda.app/about` ; e-mail de contact.
3. Donner l'accès au compte de service (`PLAY_SERVICE_ACCOUNT_JSON`) pour l'envoi automatique en
   test interne.

### 14.10 Surveillance ([monitoring.md](monitoring.md))

Uptime Kuma : remplacer les URL des sondes (`/healthz`, `/v1/status`…) par
`https://tandem-agenda.app/…`, déplacer la page de statut sur `status.tandem-agenda.app`.

### 14.11 Vérification finale

- [ ] `https://tandem-agenda.app` : connexion par mot de passe et par Google, création d'une tâche.
- [ ] E-mail « Mot de passe oublié » reçu, lien vers le nouveau domaine.
- [ ] Notifications web : *Réglages → Notifications* → réactiver sur le nouveau domaine, tester.
- [ ] `https://tandem-agenda.app/v1/app/android/version.json` : `apkUrl` en `tandem-agenda.app/…/tandem.apk`.
- [ ] Nouvelle app Android installée : connexion, notification instantanée (FCM) reçue.
- [ ] Tâche par e-mail vers `…@tasks.tandem-agenda.app` (si utilisée).
- [ ] `https://docs.tandem-agenda.app` et la page de statut répondent.

### 14.12 Pendant la transition, puis après

- *Site* : les cookies, le cache hors ligne et les notifications web sont liés au domaine :
  chacun se reconnecte **une fois** sur `tandem-agenda.app` et réactive les notifications du
  navigateur. Une fois la vérification 14.11 passée, rediriger l'ancien domaine
  (Cloudflare, zone de l'ancien domaine → *Rules → Redirect Rules* → 301 vers
  `https://tandem-agenda.app` en conservant chemin et paramètres), **en excluant `/v1/*`**.
- *App Android déjà installée* (`be.agendagn.app`) : elle interroge l'ancien domaine
  (`/v1/…`, d'où l'exclusion ci-dessus). Sa prochaine « mise à jour » installe **Tandem à côté**
  (autre identifiant, même signature) : se connecter dans Tandem, puis désinstaller l'ancienne
  app. L'API accepte encore l'ancien en-tête CSRF et les jetons émis avant le renommage.
- *Fin de transition* (quand plus personne n'utilise l'ancienne app) : retirer l'ancien domaine
  de Coolify et de Google (domaines autorisés, URI de redirection), l'ancienne app Firebase et
  l'ancien sous-domaine de réception Resend.

## 15. Site vitrine

Le service `site` du compose sert la page de présentation de Tandem (français sur `/`, anglais
sur `/en/`) : pages statiques Next.js, animations Motion, mêmes design tokens que l'app. Il est
**statique** et indépendant : ni API, ni base, ni cookie, ni traceur.

1. **Cloudflare → DNS** : enregistrement `A` `decouvrir` vers l'IP du serveur (nuage gris au
   premier déploiement, puis orange, comme en §3.1). Un seul niveau sous `tandem-agenda.app` :
   couvert par le certificat Cloudflare gratuit.
2. **Coolify** → service **site** → *Domains* : `https://decouvrir.tandem-agenda.app:80`.
3. Variables (facultatives, lues **au build**, puis *Redeploy*) :

   | Variable | Rôle | Défaut |
   |---|---|---|
   | `SITE_URL` | adresse publique du site (liens canoniques, Open Graph, plan du site) | `https://decouvrir.tandem-agenda.app` |
   | `PLAY_URL` | lien « Télécharger pour Android » vers la fiche Google Play, une fois publique | APK de l'app (`/v1/app/android/tandem.apk`) |
   | `PRIVACY_CONTACT_EMAIL` | lien « Contact » du pied de page | absent |

   `WEB_ORIGIN` et `DOCS_URL` (déjà définies) servent aux liens vers l'app et la documentation.

Autre sous-domaine (ex. `www`) : changer le domaine dans Coolify **et** `SITE_URL`, puis
redéployer. En local : `pnpm --filter @agenda/site dev` (port 3100).

