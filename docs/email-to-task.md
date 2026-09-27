# Tâches par e-mail

Chaque membre a une **adresse personnelle** du type `3f9c…@tasks.fs0ciety.org`. Un e-mail
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
Gmail, Outlook…  ──►  Resend (MX de tasks.fs0ciety.org)  ──►  webhook email.received  ──►  POST /v1/inbound/resend
                                                                                             └► GET api.resend.com/emails/receiving/{id}
```

- La réception se fait sur un **sous-domaine** dédié : les e-mails de `fs0ciety.org` (et les
  enregistrements utilisés par Resend pour l'envoi) ne changent pas.
- Le webhook est vérifié par sa **signature** (Svix, secret `whsec_…`, horodatage de moins de
  5 minutes). Il ne contient pas le message : l'API le lit ensuite avec la clé Resend.
- Un même e-mail livré deux fois ne crée qu'une tâche. Adresse inconnue ou désactivée : ignoré.
  API Resend indisponible : erreur, Resend réessaie plus tard.
- Pièces jointes ignorées. L'API ne garde que la tâche créée.

## Installation (une fois)

1. **Resend → Domains → Add domain** : `tasks.fs0ciety.org`, puis activer la **réception**
   (*Receiving*). Resend affiche les enregistrements DNS à créer, dont un **MX** pour
   `tasks.fs0ciety.org`.
2. **Cloudflare → fs0ciety.org → DNS → Records** : ajouter exactement ces enregistrements
   (proxy désactivé, « DNS only »). Rien à faire dans *Email Routing* de Cloudflare. De retour
   dans Resend : *Verify*.
3. **Resend → Webhooks → Add endpoint** :
   - URL : `https://agenda.fs0ciety.org/v1/inbound/resend` ;
   - événement : **`email.received`** uniquement ;
   - copier le **Signing secret** (`whsec_…`).
4. **Resend → API Keys → Create API key** : nom « Agenda — réception », permission
   **Full access** (une clé « Sending access » ne peut pas lire les e-mails reçus).
5. **Coolify** (service `api`), puis **Redeploy** :
   - `INBOUND_EMAIL_ADDRESS` = `{token}@tasks.fs0ciety.org` (littéralement `{token}`) ;
   - `RESEND_WEBHOOK_SECRET` = le secret `whsec_…` ;
   - `RESEND_API_KEY` = la clé créée à l'étape 4.

   La section « Ajouter par e-mail » apparaît alors dans les Réglages.
6. Tester : Réglages → Ajouter par e-mail → *Créer mon adresse*, puis transférer un e-mail à
   cette adresse. La tâche apparaît en quelques secondes.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Pas de section dans les Réglages | Une des trois variables manque dans Coolify (ou pas redéployé) |
| Resend → Webhooks : réponses `401` | `RESEND_WEBHOOK_SECRET` différent du *Signing secret* de l'endpoint |
| Réponses `502` | `RESEND_API_KEY` invalide ou en « Sending access » |
| Réponses `403` ou page Cloudflare | Règle WAF / *Bot Fight Mode* qui bloque les POST de Resend : autoriser `/v1/inbound/resend` |
| Réponse `{"ignored":"address"}` | Adresse remplacée ou désactivée dans les Réglages |
| Rien dans Resend → *Receiving* | MX de `tasks.fs0ciety.org` absent ou non vérifié |
