# Vérification Google de l'app OAuth

## 1. En avez-vous besoin ?

| Situation | Vérification |
|---|---|
| Seuls Grace et Nicolas connectent Google Calendar | **Non.** App en *In production* non vérifiée : écran « Google n'a pas validé cette application » → *Paramètres avancés → Accéder à Tandem*. Limite : 100 comptes. |
| D'autres foyers doivent connecter Google Calendar | **Oui**, sinon l'avertissement fait fuir et le plafond de 100 comptes s'applique. |
| Seulement « Se connecter avec Google » (`openid email profile`) | Scopes non sensibles : une simple **vérification de la marque** (nom, logo, domaine) suffit, en quelques jours. |

Les scopes calendrier utilisés (`calendar.calendarlist.readonly`, `calendar.events`) sont
**sensibles**, pas **restreints** : pas d'audit de sécurité CASA payant. Il faut une
vérification de la marque et des scopes, avec une vidéo de démonstration. Délai habituel :
quelques jours à quelques semaines, selon les allers-retours par e-mail.

## 2. Prérequis (côté dépôt : faits)

| Exigence Google | Où |
|---|---|
| Page d'accueil publique, sur le domaine, qui décrit l'app sans connexion | `https://agenda.fs0ciety.org/about` |
| Politique de confidentialité publique, qui détaille l'usage des données Google et mentionne la *Limited Use* | `https://agenda.fs0ciety.org/privacy` |
| Lien de la page d'accueil vers la politique | Oui (et depuis l'écran de connexion) |
| Nom identique partout (écran de consentement, page d'accueil, app) | « Tandem » |
| Scopes minimaux | cf. [google-calendar.md](google-calendar.md) §1 |
| Suppression du compte et révocation des jetons | Réglages → Données & confidentialité |

À renseigner dans Coolify : `PRIVACY_CONTACT_EMAIL` (adresse de contact affichée dans la
politique ; Google vérifie qu'on peut vous joindre).

## 3. Étapes (Google Cloud Console, compte propriétaire du projet)

1. **Vérifier le domaine** `fs0ciety.org` dans
   [Google Search Console](https://search.google.com/search-console) : *Ajouter une propriété →
   Domaine* → copier l'enregistrement **TXT** → Cloudflare → *DNS* → ajouter ce TXT (nuage gris,
   sans importance pour un TXT) → *Vérifier*. Le compte qui vérifie doit être **propriétaire ou
   éditeur** du projet Google Cloud.
2. **Google Auth Platform → Branding** :
   - *App name* : `Tandem` ;
   - *User support email* : une adresse surveillée ;
   - *App logo* : facultatif. `docs/brand/play-store-icon-512.png` réduit à **120 × 120**. Un
     logo ajoute une vérification : pour aller plus vite, n'en mettez pas ;
   - *Application home page* : `https://agenda.fs0ciety.org/about` ;
   - *Application privacy policy link* : `https://agenda.fs0ciety.org/privacy` ;
   - *Application terms of service link* : laisser vide (facultatif) ;
   - *Authorized domains* : `fs0ciety.org` ;
   - *Developer contact information* : votre adresse.
3. **Data access** : exactement `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile`,
   `…/auth/calendar.calendarlist.readonly` et `…/auth/calendar.events`. Retirer tout autre scope :
   un scope déclaré mais inutilisé fait refuser la demande.
4. **Justifications** : pour chaque scope sensible, coller le texte du §4 (en anglais, langue des
   examinateurs).
5. **Vidéo de démonstration** (§5) : la mettre sur YouTube en **non répertoriée** et coller le lien.
6. **Verification Center → Prepare for verification → Submit**. Surveiller la boîte de
   l'adresse de contact : Google répond par e-mail (souvent pour demander une précision) et
   attend une réponse **dans le même fil**.
7. Une fois validé : l'avertissement disparaît et le plafond de 100 comptes est levé. Toute
   modification ultérieure du nom, du logo, des domaines ou des scopes relance une vérification.

## 4. Textes de justification

**`https://www.googleapis.com/auth/calendar.events`**

> Tandem is a shared household task manager. When a user connects Google Calendar, the app
> publishes the household's tasks as events in one calendar the user explicitly selects
> (typically a calendar shared by the two members of the household). The app creates an event
> when a task is created, updates it when the task's title, date, time or assignee changes, and
> deletes it when the task is deleted. It only reads and modifies the events it created itself
> (identified by a private extended property); it never reads, modifies or deletes other events.
> The narrower `calendar.events.owned` scope is not sufficient because the shared calendar is often
> owned by the other household member, who has only granted "make changes to events" access.

**`https://www.googleapis.com/auth/calendar.calendarlist.readonly`**

> Used once, right after the user connects Google Calendar, to list the user's calendars so they
> can choose which calendar the household's tasks are published to. The app stores only the
> selected calendar's ID and name. No event data is read with this scope.

**Usage des données** (champ « How will the scopes be used? », si demandé)

> Google user data is used only to provide the calendar publishing feature the user turned on. It
> is not sold, shared with third parties, used for advertising, or read by humans. OAuth tokens are
> encrypted at rest (AES-256-GCM) and revoked when the user disconnects Google Calendar or deletes
> their account. The app's use of information received from Google APIs adheres to the Google API
> Services User Data Policy, including the Limited Use requirements.

## 5. Scénario de la vidéo (2 à 3 minutes)

Enregistrer l'écran d'un ordinateur (OBS, ou l'enregistreur intégré de macOS ou de Windows).
Mettre l'interface en **anglais** : navigateur en anglais, l'app suit la langue du navigateur.
La **barre d'adresse doit rester visible** du début à la fin.

1. Ouvrir `https://agenda.fs0ciety.org/about`, faire défiler : nom de l'app, description,
   section Google, lien vers la politique de confidentialité.
2. Se connecter avec un compte de démonstration (e-mail et mot de passe).
3. *Settings → Shared calendar → Connect Google Calendar*.
4. Sur l'écran de consentement Google, **zoomer sur l'URL** pour montrer le `client_id` en entier
   (il doit correspondre au projet soumis), puis montrer le nom de l'app et la liste des
   autorisations demandées. Accepter.
5. De retour dans l'app : la liste des calendriers s'affiche (**usage de
   `calendarlist.readonly`**). Choisir le calendrier partagé → *Use this calendar*.
6. Créer une tâche datée avec la case « Add to the shared calendar » cochée. Ouvrir Google Calendar dans un
   autre onglet : l'événement apparaît (**usage de `calendar.events` : création**).
7. Modifier le titre ou la date de la tâche dans l'app → rafraîchir Google Calendar (**mise à
   jour**). Supprimer la tâche → l'événement disparaît (**suppression**).
8. Montrer qu'un autre événement du calendrier, créé à la main, n'est ni lu ni modifié.
9. *Settings → Shared calendar → Remove access* : les jetons sont révoqués. Montrer
   `https://myaccount.google.com/permissions` : l'app n'y figure plus.

## 6. Refus fréquents

| Motif de Google | Correction |
|---|---|
| *Homepage not accessible / requires login* | Donner `/about`, jamais `/` (qui renvoie vers la connexion) |
| *Privacy policy does not disclose Google data use* | Section « Données Google » de `/privacy` (déjà présente) |
| *App name mismatch* | Même nom partout : « Tandem » |
| *Domain not verified* | §3.1, avec un compte propriétaire ou éditeur du projet |
| *Video does not show the OAuth client ID / the consent screen* | Refaire l'étape 4 du §5 en zoomant sur l'URL |
| *Requesting more scopes than needed* | Aucun scope en plus de ceux du §3.3 |
