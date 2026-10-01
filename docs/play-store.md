# Publication sur Google Play

L'app Android existe en **deux versions construites à chaque mise à jour de `main`**
(`android-release.yml`, release GitHub `android-latest`) :

| Fichier | Pour | Mises à jour |
|---|---|---|
| `tandem.apk` | Installation depuis le site (Réglages → Application Android) | L'app se met à jour elle-même (docs/android.md §4) |
| `tandem-play.aab` | Google Play (build `play`) | Par le Play Store. Pas de mise à jour automatique ni de permission « installer des applications », que Google Play interdit |

La version Play est la même que la release (même code, même API, mêmes notifications Firebase).
Seule différence : `UPDATE_MANIFEST_URL` est vide et `src/play/AndroidManifest.xml` retire
`REQUEST_INSTALL_PACKAGES` et le `FileProvider` des mises à jour.

## 1. Quelle piste choisir ?

- **Test interne (recommandé)** : jusqu'à 100 testeurs invités par e-mail, disponible en quelques
  minutes, sans exigence de test préalable. Idéal pour un foyer : Grace et Nicolas installent
  l'app depuis le Play Store et reçoivent les mises à jour comme n'importe quelle app.
- **Production (public)** : un compte développeur **personnel** créé après novembre 2023 doit
  d'abord faire un **test fermé avec au moins 12 testeurs pendant 14 jours**. Ça n'a d'intérêt que
  pour ouvrir l'app à d'autres foyers.

## 2. Clé de signature : garder la compatibilité avec l'APK du site

Android n'installe une mise à jour que si elle est signée par la même clé. Par défaut, Google Play
re-signe l'app avec **sa propre clé** : la version Play et l'APK du site ne pourraient pas se
remplacer (il faudrait désinstaller l'une pour installer l'autre, et perdre les données locales
non synchronisées).

Pour passer de l'une à l'autre sans désinstaller, lors de la première publication, choisir dans
*Configuration → Intégrité de l'application → Signature d'application* l'option **« Utiliser une
clé existante : exporter et importer depuis un keystore Java »** et importer `agenda.jks`
(celui du secret `ANDROID_KEYSTORE_B64`, cf. docs/android.md §4) avec l'outil PEPK fourni par
la console. La **clé d'importation** peut être la même (`agenda.jks`, alias `agenda`) : c'est
elle qui signe `tandem-play.aab` dans la CI.

Les numéros de version (`versionCode` = exécution du workflow + 10) sont communs aux deux
versions et toujours croissants.

## 3. Étapes dans la Play Console

1. **Compte développeur** : [play.google.com/console](https://play.google.com/console),
   25 $ une fois, vérification d'identité (quelques jours).
2. **Créer l'application** : nom *Tandem*, langue par défaut *Français – fr-FR*,
   *Application*, *Gratuite*. Nom du paquet : `app.tandem.foyer` (fixé au premier envoi).
3. **Configurer l'application** (tableau de bord → *Configurer votre application*) :
   - **Règles de confidentialité** : `https://tandem-agenda.app/privacy`
   - **Accès à l'application** : *Tout ou partie des fonctionnalités sont restreintes* → fournir
     un compte de démonstration (créer un compte `demo…` sur le site, un foyer et quelques tâches ;
     identifiants saisis uniquement dans la console, jamais dans le dépôt).
   - **Annonces** : *Non, mon application ne contient pas d'annonces*.
   - **Classification du contenu** : catégorie *Tous les autres types d'applications*, réponses
     « non » partout (pas de violence, de contenu généré public, de jeux d'argent…) → PEGI 3.
   - **Public cible** : *18 ans et plus* (évite les exigences « Familles »). L'app n'attire pas
     les enfants.
   - **Application d'actualités, gouvernementale, financière, santé** : non.
   - **Sécurité des données** : voir §4.
   - **Suppression de compte** : URL `https://tandem-agenda.app/privacy` (section « Vos
     droits » : Réglages → Données & confidentialité → Supprimer mon compte). Suppression
     immédiate ; sauvegardes effacées sous 14 jours (serveur) et 30 jours (hors serveur).
4. **Fiche Play Store** (*Présence sur le Store → Fiche principale*) : copier les textes et
   images de `apps/android/fastlane/metadata/android`
   (`fr-FR`, puis `en-US` et `nl-NL` en traduction ; `nl-NL` n'a pas d'images propres : reprendre
   celles de `en-US`) :

   | Champ | Fichier | Limite |
   |---|---|---|
   | Nom | `title.txt` | 30 |
   | Description courte | `short_description.txt` | 80 |
   | Description complète | `full_description.txt` | 4000 |
   | Icône 512 × 512 | `images/icon.png` | PNG 32 bits |
   | Image de présentation 1024 × 500 | `images/featureGraphic.png` | |
   | Captures de téléphone (5) | `images/phoneScreenshots/*.png` | 1080 × 2160 |
   | Notes de version | `changelogs/default.txt` | 500 |

   Catégorie : **Productivité**. Coordonnées : une adresse e-mail de contact (obligatoire,
   visible publiquement) et le site `https://tandem-agenda.app`.
5. **Premier envoi (manuel)** : *Tester → Test interne → Créer une release* → importer
   `tandem-play.aab` depuis la release GitHub `android-latest` → notes de version → *Enregistrer*
   → *Publier*. Onglet *Testeurs* : créer une liste avec les adresses Google de Grace et Nicolas,
   puis leur envoyer le **lien d'inscription** : ils acceptent, puis installent depuis le Play Store.

## 4. Sécurité des données (réponses)

*Votre application collecte-t-elle ou partage-t-elle des données ?* **Oui**. Chiffrées en
transit : **oui** (HTTPS). Les utilisateurs peuvent demander la suppression : **oui**.
Aucune donnée n'est **partagée** : Firebase et l'hébergeur sont des prestataires, et la
publication dans Google Calendar est un transfert demandé par l'utilisateur. Ces deux cas sont
exclus de la notion de partage.

| Type de données | Collectée | Finalité | Facultative |
|---|---|---|---|
| Informations personnelles → **Nom** (prénom) | Oui | Fonctionnement de l'app, gestion du compte | Non |
| Informations personnelles → **Adresse e-mail** | Oui | Fonctionnement de l'app, gestion du compte ; **communications du développeur** (réponse à un signalement, seulement si l'utilisateur l'accepte) | Non |
| Activité dans l'app → **Autres contenus générés par l'utilisateur** (tâches, notes, listes) | Oui | Fonctionnement de l'app | Non |
| Infos et performances de l'app → **Journaux de plantage**, **Diagnostics** | Oui | Analyse (correction des erreurs) | Non |
| Infos et performances de l'app → **Autres informations sur les performances** (informations techniques d'un signalement : version, Android, modèle, langue, écran) | Oui | Fonctionnement de l'app (assistance) | Oui (case décochée par défaut, contenu affiché avant l'envoi) |
| Messages → **Autres messages dans l'app** (texte d'un signalement envoyé à l'administrateur) | Oui | Fonctionnement de l'app (assistance) | Oui |
| Identifiants de l'appareil → **Autres identifiants** (jeton de notification Firebase) | Oui | Fonctionnement de l'app (notifications) | Oui |
| Photos et vidéos → **Photos** (photo jointe à une tâche ou capture jointe à un signalement, prise ou choisie par l'utilisateur) | Oui | Fonctionnement de l'app | Oui |
| Fichiers et documents → **Fichiers et documents** (pièces jointes) | Oui | Fonctionnement de l'app | Oui |

La capture d'un signalement passe par le **sélecteur de photos du système** : l'app ne demande
aucune permission de stockage ou de galerie.

Non collectés : position, contacts, agenda de l'appareil (l'app ne lit pas le calendrier du
téléphone), données financières, santé, historique de navigation, publicité. Les photos et
fichiers ne sont jamais lus en arrière-plan : seulement ceux que l'utilisateur joint lui-même.

## 5. Automatiser les envois suivants (facultatif)

Avec le secret `PLAY_SERVICE_ACCOUNT_JSON`, chaque mise à jour de `main` envoie aussi l'AAB en
**test interne** (`android-release.yml`, action `r0adkll/upload-google-play`, notes de version
`changelogs/default.txt`, fichier de désobfuscation R8 inclus) :

1. Google Cloud Console (projet de votre choix) → *IAM → Comptes de service → Créer* → onglet
   *Clés* → *Ajouter une clé → JSON* (fichier téléchargé : **secret**, ne jamais le committer).
2. Activer l'API **Google Play Android Developer API** dans ce projet.
3. Play Console → *Utilisateurs et autorisations* → *Inviter* l'adresse du compte de service →
   application *Tandem* → droits **Publier dans les canaux de test** (et *Afficher les
   informations sur l'application*).
4. GitHub → *Settings → Secrets and variables → Actions* → `PLAY_SERVICE_ACCOUNT_JSON` = contenu
   du fichier JSON.

Le premier envoi doit rester manuel (§3.5) : l'API refuse une app qui n'a encore aucune release.

**Choisir la piste** : par défaut, les envois vont en **test interne**. Pour envoyer directement
chaque nouvelle version à la piste de votre **test fermé**, créez la variable GitHub
*Settings → Secrets and variables → Actions → Variables* → `PLAY_TRACK` = `alpha`. C'est
l'identifiant de la piste « Test fermé – Alpha » créée par défaut ; pour une piste fermée
personnalisée, mettez son nom exact tel qu'affiché dans la Play Console. Autres valeurs :
`internal`, `beta` (test ouvert), `production`. Un lancement manuel du workflow (*Actions →
Android — APK à installer → Run workflow*) permet aussi de choisir la piste pour cet envoi-là.

Une version déjà envoyée en test interne se passe au test fermé sans nouvel envoi : Play Console
→ *Tester → Test interne* → la release → **Promouvoir la release → Test fermé** → *Enregistrer*
→ *Envoyer pour examen*. Les pistes de test fermé passent par l'examen de Google (quelques heures
à quelques jours), contrairement au test interne.

## 6. Mettre à jour la fiche et les captures

- Textes : modifier les fichiers `fastlane/metadata/android/<langue>/…`, puis les recopier dans la
  console. Leur format est celui de `fastlane supply`, donc utilisable tel quel si on adopte
  fastlane plus tard.
- Notes de version (« Nouveautés », 500 caractères max par langue) :
  `fastlane/metadata/android/<langue>/changelogs/default.txt`. À mettre à jour avant chaque
  envoi : la CI les joint à l'envoi automatique et les recopie sur la page de la release
  `android-latest`, au format `<fr-FR>…</fr-FR>` à coller tel quel dans la Play Console.
- Néerlandais : une fois la traduction *Néerlandais – nl-NL* ajoutée à la fiche (*Fiche principale →
  Gérer les traductions*), créer la variable de dépôt `PLAY_LISTING_NL=true` (GitHub → Settings →
  Secrets and variables → Actions → Variables) : la CI joindra alors aussi les notes `nl-NL`.
  Avant, Google Play refuserait l'envoi (langue absente de la fiche).
- Captures (rendues depuis les vrais écrans, données fictives) :

  ```bash
  cd apps/android
  ./gradlew testDebugUnitTest --tests '*StoreScreenshots*' -Pscreenshots
  ```

- Icône 512 × 512 et image de présentation 1024 × 500 (`images/icon.png`,
  `images/featureGraphic.png`, les deux langues) : générées depuis le logo, avec les autres icônes.
  Les textes de la bannière sont dans `FEATURE_TEXT` du script. Sans marque tierce (pas de
  « Google » dans les visuels, règle de Google Play).

  ```bash
  pip install pillow && python3 scripts/generate-icons.py
  ```

## 7. Vérifications avant envoi

- [ ] `targetSdk` 36, AAB signé avec la clé d'importation (fait par la CI)
- [ ] Pas de `REQUEST_INSTALL_PACKAGES` dans la version Play (vérifié par le build `play`)
- [ ] Permission de notification demandée à l'exécution (Android 13+) : oui, dans l'app
- [ ] Politique de confidentialité en ligne et à jour
- [ ] Compte de démonstration valide (connexion possible sans Google)
- [ ] Recette rapide sur téléphone de la version installée depuis le Play Store (docs/android.md §7)

Avertissement attendu, sans conséquence : « Cet App Bundle contient du code natif, et vous n'avez
pas importé de symboles de débogage ». Le seul code natif vient de deux bibliothèques AndroidX
(`libandroidx.graphics.path.so`, `libdatastore_shared_counter.so`), livrées par Google déjà
dépouillées de leurs symboles : il n'existe rien à importer (`debugSymbolLevel` n'y change rien).
L'app n'a pas de code natif propre ; ses plantages Kotlin restent lisibles grâce au fichier de
correspondance R8, inclus dans chaque AAB (`BUNDLE-METADATA`).
