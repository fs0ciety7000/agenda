# Déploiement — Coolify (Docker Compose) + Cloudflare

> Cible : un serveur avec **Coolify** (proxy **Traefik**), le domaine **fs0ciety.org** chez
> **Cloudflare**, l'application servie sur **https://agenda.fs0ciety.org**.
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
Serveur Coolify ── Traefik :443 ── agenda.fs0ciety.org
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
| B. `agenda-api.fs0ciety.org` public en plus | API joignable directement | Surface d'attaque doublée, CORS + cookies cross-subdomain à régler |

Si un domaine d'API public devient nécessaire plus tard, utiliser un **sous-domaine à un seul
niveau** (`agenda-api.fs0ciety.org`, pas `api.agenda.fs0ciety.org`) : le certificat universel
gratuit de Cloudflare ne couvre que `*.fs0ciety.org`, pas les niveaux plus profonds.

## 2. Prérequis

- Serveur Coolify opérationnel (Traefik actif, ports 80/443 ouverts), accès au dépôt GitHub
  `fs0ciety7000/agenda` via la GitHub App Coolify (ou une deploy key).
- Zone `fs0ciety.org` gérée par Cloudflare.
- ≥ 2 Go de RAM libres pendant le build (le build Next.js est le plus gourmand), ~3 Go de disque pour les images.

## 3. Cloudflare

### 3.1 DNS

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| A | `agenda` | IP publique du serveur Coolify | **DNS only (nuage gris) au premier déploiement**, puis **Proxied (nuage orange)** |

Pourquoi gris d'abord : Traefik obtient le certificat Let's Encrypt par défi HTTP‑01. En mode
proxifié + « Full (strict) », Cloudflare refuserait le certificat auto-signé servi par Traefik
tant que le vrai n'est pas émis (erreur 526). Une fois `https://agenda.fs0ciety.org` servi avec
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
| Cache | Par défaut (le HTML et le JSON ne sont pas mis en cache) + **Cache Rule « Bypass »** pour `agenda.fs0ciety.org/v1/*` | Ne jamais servir une réponse d'API d'un autre utilisateur |

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
https://agenda.fs0ciety.org:3000
```

Le suffixe `:3000` indique à Traefik le **port du conteneur**. L'URL publique reste
`https://agenda.fs0ciety.org`. Ne mettre **aucun** domaine sur `api` ni `postgres`.
Aucun label Traefik dans le compose : Coolify génère tout le routage.

### 4.3 Variables d'environnement

Coolify détecte les `${VAR}` du compose et les affiche dans *Environment Variables*. Celles
marquées `:?` sont **obligatoires** : le déploiement échoue avec un message clair si elles
manquent. Modèle complet : `.env.prod.example`.

| Variable | Valeur | Génération |
|---|---|---|
| `WEB_ORIGIN` | `https://agenda.fs0ciety.org` | — |
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
| `SENTRY_DSN` | vide jusqu'en Phase 7 | — |

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
curl -s https://agenda.fs0ciety.org/healthz        # {"status":"ok","checks":{"database":"ok"}}
curl -sI https://agenda.fs0ciety.org/ | head -3     # 307 → /login
```

### 4.5 Déploiements suivants

- Activer *Auto Deploy* (webhook GitHub) : chaque push sur la branche redéploie.
- Les migrations sont appliquées automatiquement au démarrage de l'API (`migrate deploy`
  n'applique que des migrations versionnées, jamais de reset).
- **Rollback** : redéployer un commit précédent depuis Coolify. Les migrations sont *forward
  only* : une migration destructive (suppression de colonne) doit toujours être livrée en deux
  temps (code compatible d'abord, suppression ensuite) pour qu'un rollback de code reste sûr.

## 5. Premier démarrage

1. Ouvrir https://agenda.fs0ciety.org → **Créer un compte** (Nicolas, par exemple).
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

Coolify → service `backup` → *Terminal* : `backup.sh once`.

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
| **Brevo** (recommandé) | 300 emails/jour, sans carte bancaire | Société française, données dans l'UE (RGPD), SMTP simple | Interface un peu chargée |
| Resend | 3 000/mois (100/jour) | Très simple, bonne délivrabilité | Société américaine |
| Mailjet | 200/jour | Européen | Quota plus faible |
| Gmail + mot de passe d'application | 500/jour | Rien à créer | Lie l'app à un compte personnel, délivrabilité moyenne |

Pour un foyer (quelques emails par an), Brevo est largement suffisant.

### 8.1 Brevo, pas à pas

1. Créer un compte gratuit sur brevo.com.
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain** : `fs0ciety.org`.
3. Brevo affiche des enregistrements DNS (code Brevo, DKIM, DMARC). Les ajouter dans **Cloudflare →
   DNS** en **DNS only** (nuage gris : les TXT/CNAME de messagerie ne se proxifient pas), puis
   « Authenticate » dans Brevo. Si un enregistrement SPF (`v=spf1 …`) existe déjà sur `fs0ciety.org`,
   y ajouter `include:spf.brevo.com` plutôt que d'en créer un second.
4. **Senders** : ajouter l'expéditeur `no-reply@fs0ciety.org`.
5. **SMTP & API → SMTP** : générer une clé SMTP. Renseigner dans Coolify :

| Variable | Valeur |
|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | l'identifiant SMTP affiché par Brevo (`…@smtp-brevo.com`) |
| `SMTP_PASSWORD` | la clé SMTP |
| `EMAIL_FROM` | `Agenda G & N <no-reply@fs0ciety.org>` |

6. Redéployer, puis tester « Mot de passe oublié » avec votre adresse.

Resend : `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASSWORD=<clé API>`, après
vérification du domaine de la même façon.

## 9. Google Calendar et connexion Google

Un seul client OAuth pour les deux usages. Dans la **Google Cloud Console**, idéalement avec le
compte occmons@gmail.com :

1. Créer un projet (ex. « Agenda G & N ») ; **APIs & Services → Library** : activer
   **Google Calendar API**.
2. **OAuth consent screen** (*Google Auth Platform*) : type *External*, nom « Agenda G & N »,
   email d'assistance, domaine autorisé `fs0ciety.org`. **Data access** : ajouter les scopes
   `openid`, `email`, `profile`, `…/auth/calendar.calendarlist.readonly` et
   `…/auth/calendar.events` — rien de plus (pas `…/auth/calendar`).
   **Branding** : *Application privacy policy link* = `https://agenda.fs0ciety.org/privacy`
   (renseigner `PRIVACY_CONTACT_EMAIL` dans Coolify pour y afficher une adresse de contact).
3. **Audience → Publish app** : passer en **« In production »**. Indispensable : en *Testing*,
   Google invalide les autorisations au bout de 7 jours et la synchro s'arrêterait chaque semaine
   (risque R1). Sans vérification Google, l'écran de consentement affiche « Google n'a pas validé
   cette application » : cliquer *Paramètres avancés → Accéder à Agenda G & N* (normal pour une
   app personnelle, limite de 100 utilisateurs).
4. **Clients → Create client → Web application** :
   - Authorized JavaScript origins : `https://agenda.fs0ciety.org`
   - Authorized redirect URIs (exactement, sans barre finale) :
     - `https://agenda.fs0ciety.org/v1/calendar/google/callback` (calendrier)
     - `https://agenda.fs0ciety.org/v1/auth/google/callback` (connexion avec Google)
5. Renseigner `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans Coolify et redéployer.
6. Dans l'app : **Réglages → Calendrier partagé → Connecter Google Calendar**, autoriser, choisir
   **« Commun G & N »** → *Utiliser ce calendrier*. Un seul membre du foyer a besoin de connecter
   son compte, s'il a le droit « Apporter des modifications aux événements » sur ce calendrier.

Les URI de redirection sont dérivées de `WEB_ORIGIN` : aucune variable supplémentaire.

Sécurité : un compte Google n'est jamais rattaché automatiquement à un compte existant ayant la
même adresse (prise de contrôle possible). Pour lier Google à un compte créé avec un mot de passe :
**Réglages → Données & confidentialité → Lier Google**.

## 10. Surveillance et maintenance

- **Disponibilité** : le workflow GitHub `Disponibilité` (`.github/workflows/uptime.yml`) appelle
  `https://agenda.fs0ciety.org/healthz` (web → API → base) toutes les 10 minutes, **depuis
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
- **Logs** : Coolify → ressource → *Logs* (JSON structuré pino côté API ; aucun token ni cookie
  n'y figure).
- **Erreurs** : remontées dans les logs, et dans Sentry / GlitchTip si `SENTRY_DSN` est défini.

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
| 502 / 503 depuis Traefik | `web` pas encore *healthy*, ou domaine sans `:3000` | Logs Coolify ; vérifier `https://agenda.fs0ciety.org:3000` dans *Domains* |
| Connexion OK mais on revient sans cesse sur /login | Cookies `Secure` sur un accès HTTP | Toujours passer par `https://` (Always Use HTTPS) |
| Tout le monde reçoit « Trop de tentatives » | `CLIENT_IP_HEADER` absent, ou trafic ne passant pas par Cloudflare | `CLIENT_IP_HEADER=cf-connecting-ip`, nuage orange |
| `/v1/*` renvoie 500 « Internal Server Error » en texte brut | API injoignable depuis `web` | Vérifier que le service s'appelle bien `api` et qu'il est *healthy* |
| L'API redémarre en boucle | Variable manquante/invalide (message `Invalid environment`) ou migration en échec | Logs du service `api` |
| `redirect_uri_mismatch` chez Google | URI absente ou différente dans le client OAuth | Copier exactement `https://agenda.fs0ciety.org/v1/calendar/google/callback` (§9) |
| « La connexion avec Google a expiré ou a été ouverte dans un autre navigateur » | Cookie du flux absent : plus de 10 min sur l'écran Google, navigateur différent (ex. lien ouvert depuis une autre app), cookies bloqués | Relancer depuis le même navigateur, sans navigation privée |
| « Google a refusé la connexion » + log `TOKEN_ENCRYPTION_KEY must be 32 …` | Clé de chiffrement invalide (depuis ce correctif, l'API refuse de démarrer avec ce message) | `openssl rand -base64 32` → coller le résultat (44 caractères, finit par `=`) dans `TOKEN_ENCRYPTION_KEY`, redéployer, reconnecter Google |
| « Google n'a pas donné accès à votre calendrier » | Cases décochées sur l'écran de consentement Google | Relancer et cocher les deux cases |
| « Google a refusé la connexion » | Échange du code refusé : `GOOGLE_CLIENT_SECRET` erroné, client OAuth différent, API Calendar non activée | Logs `api` : ligne `Calendar connection failed: Google API 401 unauthorized (invalid_client)` ⇒ secret ; vérifier §9 |
| « Google Calendar n'est pas configuré » dans Réglages | `GOOGLE_CLIENT_ID`/`SECRET` vides | Les renseigner dans Coolify, redéployer |
| Synchro arrêtée au bout d'une semaine | App OAuth restée en *Testing* | La publier « In production », puis *Reconnecter* dans Réglages |
| Tâches « en attente » de synchro qui n'avancent pas | `redis` non *healthy*, ou quota Google | Logs `api` (`Calendar sync mode: queue`, `Sweep …`) ; le balayage reprend toutes les 10 min |
| Build `web` échoue sur `next/font` | Pas d'accès à `fonts.googleapis.com` pendant le build | Autoriser la sortie réseau du serveur pendant le build |
