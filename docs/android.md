# Application Android

Kotlin + Jetpack Compose (Material 3), minSdk 26, même API REST que le web. Aucune logique
métier propre à Android : les règles (récurrence, rotation, quick add) restent côté serveur.

![Aujourd'hui](screenshots/android/today.png)

## 1. Ce que fait l'app

| Onglet | Contenu |
|---|---|
| **Aujourd'hui** | « Bonjour Grace 👋 », en retard, aujourd'hui (x sur y faites), 7 prochains jours, tâches sans date, répartition de la semaine (tâches partagées, non compétitive) |
| **Tâches** | Recherche, filtres À faire / À venir / Sans date / Faites, « Les miennes », regroupement par jour |
| **Calendrier** | Mois (lundi → dimanche, pastilles = tâches à faire), liste du jour choisi, « Ajouter ce jour-là » ; **glisser-déposer** : appui long sur une tâche puis la lâcher sur un jour (heure conservée, cette occurrence seulement, « Annuler » dans le message ; TalkBack : actions « jour précédent / suivant ») |
| **Réglages** | Foyer et membres, état du calendrier partagé (Google), rappels, compte, déconnexion |

- **Ajout rapide** (bouton +) : « Sortir les poubelles mardi 20h Nicolas », aperçu analysé par l'API.
- **Formulaire** : titre, date, heure, durée, responsables, répétition simple (jour, semaine,
  2 semaines, mois) avec « chacun son tour », catégorie, priorité, notes, personnelle, calendrier
  partagé. Modifier / supprimer une tâche récurrente demande la portée (celle-ci, les suivantes, toute la série).
- **Rappels** : notification avant chaque tâche planifiée qui me concerne (moi, à deux, à définir),
  délai réglable, bouton **Fait** dans la notification (fonctionne hors ligne).
- **Widget « Aujourd'hui »** (appui long sur l'écran d'accueil → Widgets → Agenda G & N) : tâches
  en retard et du jour, à cocher directement (hors ligne compris, même file d'envoi que l'app),
  toucher une tâche l'ouvre, « + » ouvre l'ajout rapide. Mis à jour à chaque changement et au
  moins toutes les 30 minutes (passage à minuit).
- **Activité** : « Nicolas vous a attribué … » en notification système (si activé dans
  Réglages → Notifications sur le web), vérifié au retour dans l'app et à chaque synchronisation
  de fond ; la première vérification après installation ne notifie rien d'ancien.

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
| « Continuer avec Google » | Custom Tab sur le site + retour `be.agendagn.app://auth?code=…`, code à usage unique (2 min) échangé avec un verifier PKCE resté dans l'app | Aucun nouveau client OAuth ni URI dans la console Google ; une app qui intercepterait le lien ne peut rien en faire sans le verifier |
| Récurrence sur mobile | Préréglages + « chacun son tour » | Rotations avancées (séquences, jours fixes) restent sur le web |
| Base locale | Room, migration destructive | C'est un cache ; migrations obligatoires dès que le schéma change en production (sinon l'outbox non envoyée serait perdue) |
| Tests d'interface | Robolectric (JVM) | Pas d'émulateur en CI ; rendu natif réel + captures d'écran |

## 4. Construire et installer

**Installer sur le téléphone** : sur le site, **Réglages → Compte → Application Android →
Télécharger** (ou directement `https://agenda.fs0ciety.org/v1/app/android/agenda-gn.apk`), puis
*Installer* (autoriser Chrome à « installer des applications inconnues » la première fois).

**D'où vient l'APK** : à chaque mise à jour de `main`, le workflow `android-release.yml` publie
l'APK et un `version.json` dans la release GitHub `android-latest`. L'API les **relaie**
(`/v1/app/android/version.json`, `/v1/app/android/agenda-gn.apk`, cache 5 min) : l'app et le site
ne parlent qu'à `agenda.fs0ciety.org`, que le dépôt soit public ou privé.

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
  -storepass "MOT_DE_PASSE" -keypass "MOT_DE_PASSE" -dname "CN=Agenda G et N"
base64 -w0 agenda.jks   # → secret ANDROID_KEYSTORE_B64
```

GitHub → dépôt → *Settings* → *Secrets and variables* → *Actions* → *New repository secret* :
`ANDROID_KEYSTORE_B64` (sortie de `base64`) et `ANDROID_KEYSTORE_PASSWORD`. Sans ces secrets, le
workflow échoue explicitement et ne publie rien. Perdre la clé = désinstaller / réinstaller l'app.

**APK signé en local avec la même clé** :

```bash
cd apps/android
./gradlew assembleRelease -Pagenda.apiBaseUrl=https://agenda.fs0ciety.org/ \
  -Pagenda.keystore=/chemin/agenda.jks -Pagenda.keyAlias=agenda \
  -Pagenda.keystorePassword=… -Pagenda.keyPassword=…
```

Développement : `./gradlew installDebug` (émulateur ; l'API locale est vue en `10.0.2.2:4000`).

## 5. Tests

```bash
cd apps/android
./gradlew lintDebug testDebugUnitTest                 # ce que lance la CI
./gradlew testDebugUnitTest -Pscreenshots             # + captures dans docs/screenshots/android
./gradlew testDebugUnitTest -PliveApi=http://localhost:4000/   # + parcours contre une vraie API locale
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

Les noms de tests sont en ASCII : certains environnements ne savent pas écrire les classes
générées dont le nom contient des accents.

## 6. Limites connues

- Pas encore de widget, de raccourcis ni de glisser-déposer dans le calendrier (Phase 6).
- Les rappels sont locaux (pas de push serveur) : ils couvrent les 48 h suivantes et sont
  replanifiés au moins toutes les heures par WorkManager.
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
