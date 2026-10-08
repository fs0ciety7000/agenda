# Application Android

Kotlin + Jetpack Compose (Material 3), minSdk 26, même API REST que le web. Aucune logique
métier propre à Android : les règles (récurrence, rotation, quick add) restent côté serveur.

![Aujourd'hui](screenshots/android/today.png)

## 1. Ce que fait l'app

| Onglet | Contenu |
|---|---|
| **Aujourd'hui** | « Bonjour Grace 👋 », en retard, aujourd'hui (x sur y faites), 7 prochains jours, tâches sans date, répartition de la semaine (tâches partagées, non compétitive) |
| **Tâches** | Recherche, filtres À faire / À venir / Sans date / Faites, « Les miennes », regroupement par jour |
| **Courses** | Liste de courses permanente du foyer : ajout de plusieurs articles d'un coup (« lait, pain »), cocher au magasin, « Dans le panier (pris par Nicolas) », « Vider le panier ». **Hors ligne** (affiché tout de suite, envoyé au retour du réseau, sans doublon) et **en temps réel** (indicateur « En direct ») |
| **Calendrier** | Mois (lundi → dimanche, pastilles = tâches à faire), liste du jour choisi, « Ajouter ce jour-là » ; **glisser-déposer** : appui long sur une tâche puis la lâcher sur un jour (heure conservée, cette occurrence seulement, « Annuler » dans le message ; TalkBack : actions « jour précédent / suivant ») |
| **Dépenses** (depuis Réglages) | Qui doit quoi et « Enregistrer le remboursement », totaux du mois (communes, part de chacun, mes dépenses perso), liste par jour ; ajouter, modifier, supprimer (montant, quoi, date, payé par, pour qui : commune / pour l'autre / perso, catégorie, commentaire). Parts à la main, **Chaque mois** (charges fixes, à arrêter depuis la liste), **ticket** (photo ou PDF, ouvert par l'app adaptée). « Noter la dépense » après **Vider le panier** dans les Courses. En ligne seulement ; les proportions se règlent sur le site |
| **Réglages** | Foyer et membres, état du calendrier partagé (Google), rappels, compte, déconnexion |

- **Ajout rapide** (bouton +) : « Sortir les poubelles mardi 20h Nicolas », aperçu analysé par l'API.
- **Formulaire** : titre, date, heure, durée, responsables, répétition et tour de rôle (mêmes
  choix que sur le site, aperçu des prochaines dates), catégorie, priorité, notes, personnelle,
  calendrier partagé. Modifier / supprimer une tâche récurrente demande la portée (celle-ci, les suivantes, toute la série).
- **Rappels** : notification avant chaque tâche planifiée qui me concerne (moi, à deux, à définir),
  délai réglable, boutons **Fait**, **Demain** et **Ce week-end** dans la notification (hors ligne
  compris : le report part dès que le réseau revient).
- **Récapitulatif du matin** (8 h, désactivable dans Réglages → Notifications) : tâches du jour
  qui me concernent, nombre en retard et à faire cette semaine. Calculé sur le téléphone.
- **Échéance souple** : une tâche sans date peut être « à faire cette semaine », « ce mois-ci » ou
  avant une date ; section « À faire cette semaine » sur Aujourd'hui, en retard une fois dépassée.
  L'ajout rapide comprend « cette semaine », « ce mois-ci », « ce week-end ».
- **Raccourcis** (appui long sur l'icône) : Nouvelle tâche, Dicter, Courses, Aujourd'hui.
- **Dictée** : raccourci « Dicter » ou micro dans l'ajout rapide ; la reconnaissance vocale du
  téléphone remplit l'ajout rapide (« Sortir les poubelles demain 19 h Grace »), à valider.
  **Partager** un texte depuis une autre app vers Tandem l'ouvre aussi dans l'ajout rapide.
  Google Assistant : « Ok Google, ouvre Tandem » ; la capacité App Actions
  `CREATE_THING` (« crée … dans Tandem ») est déclarée et ne fonctionne qu'avec l'app
  publiée sur le Play Store.
- **Widget « Semaine »** : les 7 prochains jours, groupés par jour, à cocher (hors ligne compris).
- **Modèles de tâches** : dans l'ajout rapide (+), choisir un modèle et le jour (aujourd'hui,
  demain, ce week-end, sans date) crée toutes ses tâches. Les modèles se gèrent sur le site
  (Réglages → Modèles de tâches). Demande une connexion.
- **Historique** (tâche récurrente) : dans la fiche, les dernières fois et qui l'a faite.
- **Reporter en un geste** : « Demain » / « Ce week-end » dans la fiche, la notification de
  rappel et le widget (« → » : à demain).
- **Widget « Aujourd'hui »** (appui long sur l'écran d'accueil → Widgets → Tandem) : tâches
  en retard et du jour, à cocher directement (hors ligne compris, même file d'envoi que l'app),
  toucher une tâche l'ouvre, « + » ouvre l'ajout rapide. Mis à jour à chaque changement et au
  moins toutes les 30 minutes (passage à minuit).
- **Temps réel** : tant que l'app est à l'écran, elle écoute le flux du foyer
  (`GET /v1/households/:id/events`, Server-Sent Events) et recharge aussitôt ce que l'autre a
  changé (tâches, courses, notifications) ; à chaque reconnexion, tout est rechargé.
- **Widget « Courses »** : ce qu'il reste à acheter, à cocher depuis l'écran d'accueil (hors ligne
  compris), « + » ou le titre ouvre la liste.
- **Activité** : « Nicolas vous a attribué … » en notification système (si activé dans
  Réglages → Notifications sur le web). **Instantanée** si Firebase est configuré (§4.1), sinon
  vérifiée au retour dans l'app et à chaque synchronisation de fond ; la première vérification
  après installation ne notifie rien d'ancien.
- **Listes / sous-tâches** (ex. « Courses ») : dans le formulaire d'une tâche, ajouter des éléments
  (touche Entrée), les cocher à deux, les retirer ; progression « liste 1/3 » dans les lignes.
  Demande une connexion (comme modifier une tâche).
- **Suggestion de répartition** : tâche partagée « à définir » → « Suggestion : Nicolas, la moins
  chargée cette semaine » avec un bouton pour la lui confier.

## 2. Hors ligne (ADR-007, tel qu'implémenté)

```
UI (Compose) ──▶ ViewModel ──▶ AgendaRepository
                                  │ lit : Room (cache)          écrit : outbox Room
                                  ▼                               ▼
                               SyncEngine ◀── WorkManager (réseau requis, backoff, toutes les heures)
                                  │ 1. vérifie le compte  2. rejoue l'outbox  3. recharge le cache
                                  ▼
                               API /v1
```

- **Lectures** : toujours depuis Room. Cache rechargé : occurrences de J−30 à J+60, tous les retards,
  toutes les tâches sans date, foyer, membres, catégories.
- **Cocher / décocher / créer / ajout rapide** : immédiats à l'écran, enregistrés dans l'outbox,
  envoyés dans l'ordre dès que le réseau revient. Cocher est idempotent côté serveur ; les créations
  portent une `Idempotency-Key` : un rejeu après une réponse perdue ne crée jamais de doublon.
  Une tâche créée hors ligne peut être cochée avant son envoi (l'identifiant est remappé).
- **Modifier / supprimer** : en ligne uniquement (message clair sinon). Concurrence optimiste :
  si la tâche a changé ailleurs, la version à jour est rechargée et affichée.
- **Refus définitif** (tâche supprimée entre-temps) : l'action est abandonnée et signalée ; erreur
  serveur persistante : abandonnée après 10 tentatives pour ne pas bloquer la file.
- **Autre compte** sur le téléphone : le compte est vérifié avant tout envoi ; l'ancien cache et
  ses actions sont effacés sans être envoyés. Déconnexion volontaire : tout est effacé.
- **Rappels** : AlarmManager (`setAndAllowWhileIdle`, pas de permission d'alarme exacte),
  reprogrammés à chaque changement du cache ou des préférences, et après un redémarrage.

## 3. Décisions

| Sujet | Choix | Pourquoi |
|---|---|---|
| Injection de dépendances | Manuelle (`AppContainer`) | Une dizaine d'objets ; Hilt n'apporterait que du code généré |
| Google Calendar (connexion, choix du calendrier) | Sur le site (bouton « Gérer sur le site ») | Même flux OAuth sécurisé que le web, aucun secret dans l'APK |
| Inscription, mot de passe oublié | Ouvrent le site (Custom Tab) | Mêmes écrans, e-mails et protections anti-énumération |
| « Continuer avec Google » | Custom Tab sur le site + retour `app.tandem.foyer://auth?code=…`, code à usage unique (2 min) échangé avec un verifier PKCE resté dans l'app | Aucun nouveau client OAuth ni URI dans la console Google ; une app qui intercepterait le lien ne peut rien en faire sans le verifier |
| Récurrence sur mobile | Préréglages + « chacun son tour » | Rotations avancées (séquences, jours fixes) restent sur le web |
| Base locale | Room, migration destructive | C'est un cache ; migrations obligatoires dès que le schéma change en production (sinon l'outbox non envoyée serait perdue) |
| Tests d'interface | Robolectric (JVM) + émulateur | Robolectric à chaque PR Android (rapide, captures) ; émulateur à la demande (SQLite, Keystore, lancement réels) |

## 4. Construire et installer

**Installer sur le téléphone** : sur le site, **Réglages → Compte → Application Android →
Télécharger** (ou directement `https://tandem-agenda.app/v1/app/android/tandem.apk`), puis
*Installer* (autoriser Chrome à « installer des applications inconnues » la première fois).

**D'où vient l'APK** : à chaque mise à jour de l'app sur `main`, le workflow `android-release.yml`
publie dans la release GitHub `android-latest` (mise à jour sur place, jamais supprimée) un APK
propre à la version (`tandem-46.apk`, les deux derniers sont gardés), une copie
`tandem.apk` et, en dernier, `version.json`, qui désigne l'APK de la version. L'API les **relaie**
(`/v1/app/android/version.json`, `/v1/app/android/tandem.apk?v=46`, cache 5 min côté API ; l'APK part en `Cache-Control: no-store` pour que Cloudflare ne serve jamais une ancienne version) : l'app et le site
ne parlent qu'à `tandem-agenda.app`, que le dépôt soit public ou privé.

**Dépôt privé** : créer un jeton GitHub *fine-grained* (GitHub → *Settings* → *Developer settings*
→ *Fine-grained tokens*) limité à ce dépôt, permission **Contents : Read-only**, et le renseigner
dans Coolify : `GITHUB_RELEASES_TOKEN` (puis redéployer). Sans jeton, un dépôt privé rend le
lien de téléchargement et les mises à jour indisponibles (404, sans erreur dans l'app).

**Mises à jour automatiques** : l'app consulte `version.json` au lancement, au retour dans l'app et
toutes les heures (WorkManager). Nouvelle version ⇒ notification + bandeau « Nouvelle version
disponible » ⇒ « Mettre à jour » : téléchargement, contrôle SHA-256, installeur Android par-dessus
(données conservées). Android impose une confirmation « Installer » (pas de mise à jour silencieuse
hors Play Store) et, la première fois, l'autorisation « installer des applications » pour l'app.
Le numéro de version (`versionCode`) est celui de l'exécution du workflow + 10 : toujours croissant.

**Clé de signature (secrète)** : Android n'installe une mise à jour que si elle est signée par la
même clé. Le dépôt étant public, la clé n'y est jamais : elle vit dans les secrets GitHub.

```bash
# Une seule fois (JDK : keytool). Conserver le fichier et le mot de passe (gestionnaire de mots de passe).
keytool -genkeypair -keystore agenda.jks -alias agenda -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "MOT_DE_PASSE" -keypass "MOT_DE_PASSE" -dname "CN=Tandem"
base64 -w0 agenda.jks   # → secret ANDROID_KEYSTORE_B64
```

GitHub → dépôt → *Settings* → *Secrets and variables* → *Actions* → *New repository secret* :
`ANDROID_KEYSTORE_B64` (sortie de `base64`) et `ANDROID_KEYSTORE_PASSWORD`. Sans ces secrets, le
workflow échoue explicitement et ne publie rien. Perdre la clé = désinstaller / réinstaller l'app.

**APK signé en local avec la même clé** :

```bash
cd apps/android
./gradlew assembleRelease -Ptandem.apiBaseUrl=https://tandem-agenda.app/ \
  -Ptandem.keystore=/chemin/agenda.jks -Ptandem.keyAlias=agenda \
  -Ptandem.keystorePassword=… -Ptandem.keyPassword=…
```

**Google Play** : la même CI produit `tandem-play.aab` (build `play`, sans mise à jour
automatique) ; publication pas à pas dans [play-store.md](play-store.md).

Développement : `./gradlew installDebug` (émulateur ; l'API locale est vue en `10.0.2.2:4000`).

### 4.1 Notifications instantanées (Firebase, facultatif)

Sans configuration, l'app relève ses notifications à l'ouverture et lors de la synchronisation de
fond (jusqu'à ~15 min de délai). Avec Firebase Cloud Messaging (gratuit), le serveur **réveille**
le téléphone dès qu'il y a du nouveau. Le message ne contient **aucune donnée** (ni titre, ni
nom) : l'app relit ensuite ses notifications auprès de l'API, avec les mêmes règles et préférences.

1. https://console.firebase.google.com → *Ajouter un projet* (ex. `agenda-gn`), Google Analytics
   **désactivé**.
2. *Ajouter une application* → **Android**, nom du package `app.tandem.foyer` → télécharger
   `google-services.json` (inutile de l'ajouter au projet : on n'en reprend que 4 valeurs).
3. GitHub → *Settings → Secrets and variables → Actions → **Variables*** (pas des secrets : ce sont
   des identifiants publics, déjà présents dans tout APK Firebase) :

   Recopier les **valeurs** (pas les chemins) depuis `google-services.json` :

   ```jsonc
   {
     "project_info": {
       "project_number": "123456789012",        // → FCM_SENDER_ID = 123456789012
       "project_id": "agenda-gn"                // → FCM_PROJECT_ID = agenda-gn
     },
     "client": [{
       "client_info": {
         "mobilesdk_app_id": "1:123456789012:android:0a1b2c3d4e5f6a7b"  // → FCM_APP_ID
       },
       "api_key": [{ "current_key": "AIzaSy…" }]                        // → FCM_API_KEY
     }]
   }
   ```

   Le workflow *Android release* vérifie le format de ces valeurs et échoue avec un message clair
   si l'une d'elles est mal copiée.

4. Firebase → ⚙ *Paramètres du projet → Comptes de service* → **Générer une nouvelle clé privée**
   (fichier JSON). Coolify → variable `FCM_SERVICE_ACCOUNT` = contenu du fichier (tel quel, ou en
   base64 sur une ligne : `base64 -w0 fichier.json`) → redéployer. **C'est un secret** : ne jamais
   le committer ; supprimer le fichier téléchargé une fois copié.
5. Relancer le workflow *Android release* (*Actions → Run workflow*) : la nouvelle version de l'app
   est proposée automatiquement ; après la mise à jour, ouvrir l'app une fois (enregistrement du
   téléphone).

Vérifier : l'autre personne vous confie une tâche → la notification arrive en quelques secondes,
téléphone verrouillé. En cas de doute : logs de l'API (`FCM …`).

## 5. Tests

```bash
cd apps/android
./gradlew lintDebug testDebugUnitTest                 # ce que lance la CI
./gradlew testDebugUnitTest -Pscreenshots             # + captures dans docs/screenshots/android
./gradlew testDebugUnitTest -PliveApi=http://localhost:4000/   # + parcours contre une vraie API locale
./gradlew connectedDebugAndroidTest                   # sur un émulateur / téléphone branché
```

- `AgendaTest`, `TaskPayloadsTest`, `RemindersTest` : règles d'affichage, corps JSON conformes à
  `packages/contracts`, rappels (fuseau du foyer, qui est concerné).
- `SyncEngineTest` : vraie base Room + faux serveur : cocher hors ligne puis en ligne, ordre des
  actions, création rejouée après réponse perdue (une seule tâche), tâche supprimée ailleurs,
  erreur serveur, changement de compte.
- `ViewModelsTest` : fuseau du foyer, rafraîchissement au retour du réseau, ajout rapide,
  validations du formulaire, portées, hors ligne et conflit.
- `ScreensTest` : écrans réels (FR, clair/sombre), libellés d'accessibilité, captures.
- `LiveApiTest` : connexion, synchro, créations hors ligne rejouées, série « les suivantes »,
  conflit, suppression — contre la vraie API.

**Sur émulateur** (`app/src/androidTest`, workflow `android-emulator.yml`, API 34) : ce que
Robolectric simule seulement. Une dizaine de minutes de runner, donc **à la demande** : onglet
*Actions → Android (émulateur) → Run workflow*, ou étiquette `emulateur` sur la PR (à poser avant
une version qui touche la base, les fichiers ou le démarrage de l'app).

- `DeviceMigrationTest` : base installée en v1, toutes les migrations jusqu'à la dernière sur le
  SQLite de l'appareil, puis ouverture par Room ; actions hors ligne conservées.
- `LaunchTest` : premier lancement réel (Room, WorkManager, DataStore chiffré par le Keystore),
  écran de connexion, erreur réseau affichée sans plantage quand le serveur est injoignable.
- `AttachmentProviderTest` : le FileProvider des pièces jointes et photos partage bien les
  fichiers du cache.

Les noms de tests sont en ASCII : certains environnements ne savent pas écrire les classes
générées dont le nom contient des accents.

## 6. Limites connues

- Les rappels sont locaux : ils couvrent les 48 h suivantes et sont replanifiés au moins toutes
  les heures par WorkManager (Firebase ne sert qu'aux notifications d'activité).
- Listes, déplacement et modification demandent le réseau ; cocher une tâche et créer marchent
  hors ligne.
- Pas de vérification sur appareil physique dans la CI : faire la recette §7 à chaque version.

## 7. Recette manuelle (téléphone réel)

1. Installer l'APK, se connecter, vérifier « Aujourd'hui » face au site.
2. Mode avion : cocher 2 tâches, en créer une (formulaire) et une par l'ajout rapide ; la bannière
   indique « Hors ligne · 4 modifications en attente ».
3. Réseau rétabli : la bannière disparaît, le site montre les mêmes changements, sans doublon ;
   l'ajout rapide a bien été analysé (date, heure, personne).
4. Modifier une tâche récurrente « celle-ci et les suivantes » ; vérifier sur le site et dans
   Google Calendar.
5. Tâche dans 20 min avec rappel à 15 min : la notification arrive, « Fait » la coche.
