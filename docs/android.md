# Application Android

Kotlin + Jetpack Compose (Material 3), minSdk 26, même API REST que le web. Aucune logique
métier propre à Android : les règles (récurrence, rotation, quick add) restent côté serveur.

![Aujourd'hui](screenshots/android/today.png)

## 1. Ce que fait l'app

| Onglet | Contenu |
|---|---|
| **Aujourd'hui** | « Bonjour Grace 👋 », en retard, aujourd'hui (x sur y faites), 7 prochains jours, tâches sans date, répartition de la semaine (tâches partagées, non compétitive) |
| **Tâches** | Recherche, filtres À faire / À venir / Sans date / Faites, « Les miennes », regroupement par jour |
| **Calendrier** | Mois (lundi → dimanche, pastilles = tâches à faire), liste du jour choisi, « Ajouter ce jour-là » |
| **Réglages** | Foyer et membres, état du calendrier partagé (Google), rappels, compte, déconnexion |

- **Ajout rapide** (bouton +) : « Sortir les poubelles mardi 20h Nicolas », aperçu analysé par l'API.
- **Formulaire** : titre, date, heure, durée, responsables, répétition simple (jour, semaine,
  2 semaines, mois) avec « chacun son tour », catégorie, priorité, notes, personnelle, calendrier
  partagé. Modifier / supprimer une tâche récurrente demande la portée (celle-ci, les suivantes, toute la série).
- **Rappels** : notification avant chaque tâche planifiée qui me concerne (moi, à deux, à définir),
  délai réglable, bouton **Fait** dans la notification (fonctionne hors ligne).

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
| Connexion Google / choix du calendrier | Sur le site (bouton « Gérer sur le site ») | Même flux OAuth sécurisé que le web, aucun secret dans l'APK |
| Inscription, mot de passe oublié | Ouvrent le site (Custom Tab) | Mêmes écrans, e-mails et protections anti-énumération |
| Google Sign-In natif | Non (Phase 7 si besoin) | Un compte Google seul peut définir un mot de passe via « Mot de passe oublié » |
| Récurrence sur mobile | Préréglages + « chacun son tour » | Rotations avancées (séquences, jours fixes) restent sur le web |
| Base locale | Room, migration destructive | C'est un cache ; migrations obligatoires dès que le schéma change en production (sinon l'outbox non envoyée serait perdue) |
| Tests d'interface | Robolectric (JVM) | Pas d'émulateur en CI ; rendu natif réel + captures d'écran |

## 4. Construire et installer

**Installer sur le téléphone (le plus simple)** : à chaque mise à jour de `main`, le workflow
`android-release.yml` publie l'APK à une adresse fixe :

> GitHub → dépôt → **Releases** → « Android — dernière version » → **agenda-gn.apk**
> (`https://github.com/fs0ciety7000/agenda/releases/tag/android-latest`)

Sur le téléphone, ouvrir ce lien dans Chrome en étant connecté à GitHub (dépôt privé), toucher
`agenda-gn.apk`, puis *Installer* ; la première fois, autoriser Chrome à « installer des applications
inconnues ». Pour mettre à jour : même lien, l'app s'installe par-dessus (données conservées).

Il pointe vers `https://agenda.fs0ciety.org/` (variable de dépôt `AGENDA_API_BASE_URL` pour changer)
et il est signé avec la **clé de recette** versionnée (`apps/android/app/signing/recette.jks`) :
même signature à chaque version, donc mises à jour sans désinstaller. Cette clé est dans le dépôt
(privé) : elle ne doit jamais servir au Play Store (Phase 7 : clé secrète, ci-dessous).

**APK signé avec votre propre clé** (Play Store, Phase 7) :

```bash
# Une seule fois ; conserver le fichier et les mots de passe (gestionnaire de mots de passe).
keytool -genkeypair -v -keystore ~/agenda-release.jks -alias agenda -keyalg RSA -keysize 4096 -validity 10000

cd apps/android
./gradlew assembleRelease \
  -Pagenda.apiBaseUrl=https://agenda.fs0ciety.org/ \
  -Pagenda.keystore=$HOME/agenda-release.jks -Pagenda.keyAlias=agenda \
  -Pagenda.keystorePassword=… -Pagenda.keyPassword=…
# → app/build/outputs/apk/release/app-release.apk
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
