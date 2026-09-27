# Tâches par e-mail

Chaque membre a une **adresse personnelle** du type `agenda+3f9c…@fs0ciety.org`. Un e-mail
transféré à cette adresse devient une tâche du foyer, créée au nom de ce membre :

- le **sujet** (sans « Fwd: », « TR: »…) passe par l'ajout rapide : « Payer la facture vendredi »
  donne une tâche datée de vendredi ;
- l'**expéditeur**, le sujet et le **message** (texte brut, 5 000 caractères au plus) vont dans
  les notes ;
- sans sujet, la première ligne du message sert de titre.

L'adresse se crée dans **Réglages → Ajouter par e-mail**, où l'on peut aussi la remplacer
(l'ancienne cesse de fonctionner) ou la désactiver. Elle est **secrète** : quiconque la connaît
peut ajouter des tâches au foyer.

## Fonctionnement

```
Gmail, Outlook…  ──►  Cloudflare Email Routing  ──►  Worker « agenda-email »  ──►  POST /v1/inbound/email
                      (MX de fs0ciety.org)            (infra/email-worker)          (secret partagé)
```

- Le Worker lit le message (MIME, encodages, HTML → texte) et l'envoie à l'API avec
  `Authorization: Bearer <INBOUND_EMAIL_SECRET>`. Pièces jointes ignorées ; message de plus de
  5 Mo refusé.
- Adresse inconnue ou désactivée : l'e-mail est **refusé** (l'expéditeur reçoit un avis de
  non-remise). API indisponible : échec temporaire, le serveur d'envoi réessaie plus tard.
- Rien n'est stocké par Cloudflare ; l'API ne garde que la tâche créée.

## Installation (une fois)

> ⚠️ Email Routing remplace les enregistrements **MX** du domaine. Si `fs0ciety.org` reçoit
> déjà des e-mails ailleurs (Gmail, OVH…), utilisez un **sous-domaine** dédié
> (ex. `taches.fs0ciety.org`, proposé par Email Routing) et l'adresse
> `agenda+{token}@taches.fs0ciety.org`.

1. **Coolify** (service `api`) :
   - `INBOUND_EMAIL_ADDRESS` = `agenda+{token}@fs0ciety.org` (littéralement `{token}`) ;
   - `INBOUND_EMAIL_SECRET` = le résultat de `openssl rand -hex 32` ;
   - redéployer. La section « Ajouter par e-mail » apparaît dans les Réglages.
2. **Cloudflare → votre domaine → Email → Email Routing** : *Enable* (Cloudflare ajoute les
   enregistrements MX et SPF). Onglet *Settings* : activer **Subaddressing** (les adresses
   `agenda+…@` sont alors livrées à la règle de `agenda@`).
3. **Déployer le Worker** (depuis un ordinateur avec Node) :

   ```bash
   cd infra/email-worker
   npx wrangler@4 login
   npx wrangler@4 secret put INBOUND_EMAIL_SECRET   # même valeur que dans Coolify
   npx wrangler@4 deploy
   ```

   Si l'app n'est pas sur `agenda.fs0ciety.org`, modifier `API_URL` dans `wrangler.toml`.
4. **Email Routing → Routing rules → Create address** : adresse `agenda@fs0ciety.org`, action
   **Send to a Worker**, Worker `agenda-email`.
5. Tester : Réglages → Ajouter par e-mail → *Créer mon adresse*, puis transférer un e-mail à
   cette adresse. La tâche apparaît en quelques secondes (temps réel).

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Pas de section dans les Réglages | `INBOUND_EMAIL_ADDRESS` ou `INBOUND_EMAIL_SECRET` absent (ou secret de moins de 32 caractères) |
| Avis de non-remise « Adresse inconnue » | Adresse remplacée ou désactivée ; ou subaddressing non activé |
| Rien n'arrive, pas d'avis | Règle Email Routing absente ; voir *Workers → agenda-email → Logs* |
| `API 401` dans les logs du Worker | Secret différent entre Coolify et le Worker |
