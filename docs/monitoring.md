# Surveillance

Trois niveaux, du plus simple au plus complet. Les deux premiers fonctionnent sans rien
installer ; le troisième ajoute des alertes rapides depuis l'extérieur.

| Niveau | Ce qu'il voit | Où | Alerte |
|---|---|---|---|
| 1. Sondes internes | Base, Redis, synchro Google, SMTP, sauvegardes (chaque minute) | page publique `/status`, Administration → Surveillance | e-mail + notification navigateur aux `ADMIN_EMAILS` |
| 2. Workflow GitHub `Disponibilité` | le site entier depuis Internet (toutes les 2 h) | onglet *Actions* | ticket « Site indisponible » (e-mail GitHub) |
| 3. Uptime Kuma (recommandé) | le site, l'état détaillé, le certificat, les sauvegardes (chaque minute) | son tableau de bord | Telegram, e-mail, ntfy, Discord, SMS… |

> Les sondes internes tournent **dans** l'API : si le serveur s'arrête, elles s'arrêtent aussi.
> C'est le rôle des niveaux 2 et 3, qui regardent depuis l'extérieur.

## 1. Sondes internes (intégrées)

Toutes les minutes, l'API vérifie :

| Composant | Sonde | Incident si |
|---|---|---|
| API | le processus répond | — |
| Base de données | `SELECT 1` | 2 échecs d'affilée → **panne** |
| Redis | la file de synchronisation répond | 2 échecs → perturbé |
| Synchronisation Google | moins de 200 tâches en attente | 2 échecs → perturbé |
| Envoi d'e-mails | connexion au serveur SMTP (toutes les 15 min) | 2 échecs → perturbé |
| Sauvegardes | dernière sauvegarde réussie de moins de 26 h, et pas d'échec depuis | 1 échec → perturbé |

Un composant non configuré (pas de Redis, pas de SMTP, service `backup` pas encore déployé)
n'apparaît pas.

- **Incidents** : ouverts automatiquement, fermés au retour. Chaque ouverture et chaque retour
  envoient un e-mail (« 🔴 Incident : Sauvegardes » / « ✅ Résolu ») et une notification aux
  navigateurs abonnés des administrateurs (`ADMIN_EMAILS`).
- **Page publique** `https://agenda.fs0ciety.org/status` : état de chaque composant, barres de
  disponibilité sur 90 jours, incidents (sans détail technique). À partager, ou à mettre en
  favori sur le téléphone.
- **Administration → Surveillance** : requêtes par quart d'heure sur 24 h, erreurs 5xx, temps de
  réponse, réponses de plus d'une seconde, routes les plus lentes, mémoire, dernière sonde de
  chaque composant avec son détail, historique des incidents.
- Historique : sondes détaillées 7 jours, requêtes 8 jours, disponibilité par jour 400 jours.

### Prometheus / Grafana (facultatif)

Définir `METRICS_TOKEN` (au moins 16 caractères, secret) dans Coolify : `GET /metrics` renvoie
les métriques au format Prometheus (`agenda_component_up`, latences, requêtes, erreurs, mémoire,
boucle d'événements), avec l'en-tête `Authorization: Bearer <METRICS_TOKEN>`. Sans jeton,
`/metrics` n'existe pas. Note : `/metrics` est servi par l'API (port 4000, réseau interne) ; pour
un Prometheus externe, l'exposer via Coolify ou le scraper depuis le même réseau Docker.

## 2. Workflow GitHub `Disponibilité`

Déjà en place (`.github/workflows/uptime.yml`, cf. `deployment.md` §10) : rien à faire. Il passe
toutes les 2 heures seulement : sur un dépôt privé, chaque passage consomme une minute du quota
GitHub Actions (2 000 min/mois en offre gratuite). C'est un filet de sécurité ; l'alerte rapide
vient d'Uptime Kuma. Une fois Uptime Kuma en place, le workflow peut être désactivé (*Actions →
Disponibilité → ⋯ → Disable workflow*).

## 3. Uptime Kuma (recommandé)

### Installation — sur une autre machine

`infra/uptime-kuma/docker-compose.yml` : `docker compose up -d` sur un petit VPS, un Raspberry Pi
ou un NAS, puis `http://<machine>:3001` → créer le compte administrateur. Dans Coolify (autre
serveur) : *New resource → Service → Uptime Kuma*.

Alternative sans rien héberger : **Better Stack** ou **UptimeRobot** (offres gratuites) avec les
mêmes moniteurs.

### Moniteurs à créer

| Nom | Type | Réglages |
|---|---|---|
| Site | HTTP(s) | `https://agenda.fs0ciety.org/healthz`, intervalle 60 s, 3 essais avant alerte |
| État détaillé | HTTP(s) – Json Query | `https://agenda.fs0ciety.org/v1/status`, expression `status`, valeur attendue `operational` |
| Sauvegardes | Push | intervalle **90 000 s** (25 h) ; copier l'URL « Push » dans la variable Coolify `BACKUP_HEARTBEAT_URL` (service `backup`) puis redéployer |
| Page de connexion | HTTP(s) – Keyword | `https://agenda.fs0ciety.org/login`, mot-clé `Tandem` |

**Certificat HTTPS** : ce n'est pas un type de moniteur mais une option du moniteur « Site ».
Dans son formulaire, section *Advanced*, cocher *Certificate Expiry Notification* : Uptime Kuma
prévient avant l'expiration (jours réglables dans *Settings → Notifications → TLS Certificate
Expiry*, 7/14/21 j par défaut). Derrière Cloudflare, c'est le certificat Cloudflare qui est
vérifié.

« État détaillé » passe au rouge dès qu'un composant interne est perturbé (SMTP, sauvegardes…),
« Site » seulement si plus rien ne répond : deux niveaux de gravité.

### Notifications

*Settings → Notifications* : Telegram (le plus simple sur téléphone), e-mail SMTP (Resend
fonctionne), ntfy, Discord… Cocher *Default enabled* pour les appliquer à tous les moniteurs.

### Page de statut Uptime Kuma (facultatif)

L'app a déjà sa page `/status`. Uptime Kuma peut en publier une seconde, hébergée ailleurs (donc
visible même serveur arrêté) : *Status Pages → New* ; pour `status.fs0ciety.org`, un
enregistrement DNS Cloudflare vers la machine d'Uptime Kuma.
