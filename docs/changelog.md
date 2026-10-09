---
title: Nouveautés
description: Historique des changements de Tandem — nouvelles fonctions, améliorations et corrections, du plus récent au plus ancien.
toc_max_heading_level: 2
---

# Nouveautés

Les changements visibles, du plus récent au plus ancien. Chaque entrée renvoie à sa demande de
fusion (PR) sur le dépôt. Le site se met à jour au déploiement ; l'app Android se met à jour
d'elle-même (ou via Google Play).

**Légende** : ✨ nouveau · 🛠 amélioration · 🐞 correction · 🔒 sécurité et confidentialité ·
⚙️ technique

## 9 octobre 2026

### Site plus rapide au démarrage (#93)

- 🛠 La page de connexion charge presque deux fois moins de code au démarrage (153 Ko au lieu de 267 Ko), et
  l'accueil un tiers de moins (191 Ko au lieu de 314 Ko).
- ⚙️ Chaque modification est mesurée par Lighthouse (performance et accessibilité) avant d'être
  acceptée.

### Lire un ticket (#92)

- ✨ **Lire un ticket** : dans une nouvelle dépense, prenez le ticket en photo ; le montant, la
  date et le commerçant sont proposés, à vérifier. Sur le site et dans l'app Android.
- 🔒 La photo est lue sur le serveur de Tandem, sans service extérieur, puis effacée ; elle n'est
  gardée que jointe à la dépense.

### Bord à bord et tiroir vérifiés sur émulateur (#92)

- 🐞 App Android : l'écran de connexion ne passe plus sous les barres système ni sous le clavier.
- ⚙️ Tests sur émulateur (Android 14 et 15) du tiroir « Plus » (toucher, geste, retour) et du
  bord à bord.

### Audit du 9 octobre (#92)

- 🐞 Site vitrine : l'en-tête ne se tasse plus entre 768 et 1279 px (menu repliable).
- 🛠 Page Tâches : le filtre s'appelle « Filtrer les tâches », distinct de la recherche globale.
- 🛠 Au clavier, fermer une fenêtre (recherche…) rend le focus au bouton qui l'avait ouverte.
- 🛠 Menus : plus de bouton grisé « Tout est déjà dans les courses » quand la semaine est vide.
- 🛠 App Android : une icône par type de date importante, comme sur le site.
- 🐞 App Android : une dépense trouvée par la recherche ouvre son mois, plus le mois en cours.
- 🛠 Recherche ouverte avec « / » : à la fermeture, le focus revient au bouton « Rechercher ».

### Notes et dates hors ligne sur Android (#92)

- 🛠 App Android : les **notes** et les **dates importantes** restent lisibles sans réseau (la
  dernière version vue) ; les modifications demandent toujours une connexion.
- 🔒 Cette copie est effacée à la déconnexion, comme le reste des données du téléphone.

### Recherche globale (#92)

- ✨ **Rechercher partout** (loupe, ou **/** sur ordinateur) : tâches, notes, dates importantes,
  dépenses et courses en une seule recherche, sur le site et sur Android. Un résultat ouvre
  directement la tâche ou la page.

### Partager vers Tandem, tuile « Ajouter une tâche » (#92)

- ✨ **Partager vers Tandem** (Android) : un texte ou un lien partagé depuis une autre app devient,
  au choix, une tâche, une note ou des articles de courses.
- ✨ **Tuile « Ajouter une tâche »** dans les réglages rapides d'Android : l'ajout rapide d'un
  geste, depuis n'importe où.

### États vides illustrés (#92)

- 🛠 **Écrans vides illustrés** (Aujourd'hui, Courses, Menus, Dépenses, Notes, Dates) : un petit
  dessin au trait, le même sur le site et sur Android, en clair comme en sombre.

### Finitions Android (#92)

- ✨ **Budgets par catégorie** réglables dans l'app Android (Dépenses → Budgets par catégorie).
- 🛠 Notes sur Android : **Annuler** juste après une suppression, et icônes punaise, copier et
  modifier comme sur le site.

## 8 octobre 2026

### Affichage bord à bord sans API obsolètes (#91)

- ⚙️ App Android : l'affichage sous les barres système n'utilise plus les fonctions qu'Android 15
  a rendues obsolètes (avertissements de Google Play). Rien ne change à l'écran.

### Tiroir « Plus » et déconnexion des autres appareils (#90)

- 🛠 **Barre du bas** (téléphone, site et Android) : **Plus** ouvre un tiroir avec toutes les
  autres pages en tuiles (Dépenses, Notes, Dates importantes…, Réglages en dernier). On peut aussi
  tirer la barre vers le haut.
- 🔒 **Déconnecter les autres appareils** (Réglages → Compte → Appareils connectés) : un seul
  geste ferme toutes les autres connexions, celle-ci reste ouverte.

### Appareils connectés (#89)

- 🔒 **Appareils connectés** (Réglages → Compte, site et Android) : où votre compte est ouvert, la
  dernière activité de chaque appareil, et **Déconnecter** pour un téléphone perdu ou un ordinateur
  partagé, sans toucher aux autres.
- ⚙️ App Android : bibliothèque `androidx.fragment` à jour (avertissement de Google Play).

### Budget par catégorie (#89)

- ✨ **Budget par catégorie** (Dépenses) : un budget mensuel par catégorie en plus du budget global,
  une jauge chacun, et une alerte à 80 % et à 100 % (« Courses · octobre : 80 % atteint »). Réglage
  sur le site, jauges aussi sur Android.

### Dates importantes (#89)

- ✨ **Dates importantes** (site et Android, dans « Plus ») : anniversaires, fêtes, entretiens
  annuels, avec l'âge si l'année est connue. Rappel à tout le foyer le jour choisi (la veille,
  7 jours avant…), et rubrique « Bientôt » sur Aujourd'hui.

### Notes partagées (#89)

- ✨ **Notes** (site et Android, dans « Plus ») : codes Wi-Fi, mesures, idées cadeaux. Épingler,
  copier en un geste, modifier à deux ; si l'autre a modifié entre-temps, sa version s'affiche.
- 🐞 Android : les boutons flottants (« + », « Dépense ») prennent la couleur de Tandem au lieu
  d'un violet par défaut.

### Qui fait quoi cette semaine (#88)

- ✨ **Tableau « Qui fait quoi »** sur Aujourd'hui (site et Android) : les 7 prochains jours,
  une ligne par personne, le nombre de tâches par case ; une case touchée affiche ses tâches.

### Audit UI/UX et corrections (#88)

- 🛠 **Lisibilité** : les initiales des pastilles de membre, les boutons « Supprimer » et les coches
  sont lisibles en sombre ; trois couleurs de membre un peu plus foncées en clair.
- 🛠 **Répartition** : une seule couleur neutre pour chacun (on informe, on ne classe pas), et
  plus aucun nom coupé, même en néerlandais sur petit écran.
- 🐞 Courses : le nom du rayon n'est plus coupé sur chaque article (seul son emoji s'affiche).
- 🐞 Tâches : les filtres ne sont plus coupés sur les très petits écrans.
- 🛠 Android : « À rattraper » au lieu de « En retard », et seule la priorité est en couleur.
- 🐞 Site vitrine : tout le contenu s'affiche même sans JavaScript ; plus de défilement horizontal.
- ⚙️ Rapport d'audit et plan de travail suivi dans la roadmap.
- ✨ **Mode magasin** (Courses, site et Android) : la liste en plein écran, en gros caractères,
  rangée par rayon, et l'écran qui reste allumé.
- ✨ **Échange de tour** (site et Android) : « Peux-tu prendre ma vaisselle jeudi ? » depuis la
  fiche d'une tâche, avec un mot si besoin ; l'autre accepte ou refuse en un geste depuis
  Aujourd'hui, et la tâche change de responsable.
- ✨ **Sur grand écran**, Aujourd'hui passe en deux colonnes : la liste à gauche ; répartition,
  courses à acheter et budget du mois à droite. Les Menus s'affichent en deux colonnes.
- ✨ **Raccourcis clavier** : « / » pour chercher une tâche, « T » pour revenir à Aujourd'hui (en
  plus de « N »).
- ✨ Calendrier sur téléphone : changer une tâche de jour en deux touches depuis le mois.
- 🛠 Champs de saisie mieux délimités ; titres de tâche sur deux lignes au lieu d'être coupés ;
  barre d'onglets lisible sur les très petits écrans.
- 🛠 **Android, même allure que le site** : cases de tâche rondes avec une coche animée, tâches
  regroupées en cartes, titre « Tâches », et les mêmes mots partout (« Tous les deux »,
  « À définir »).
- ✨ **Calendrier sur téléphone** (site) : le mois montre un point par tâche et la liste du jour
  touché, avec « Ajouter ce jour-là » ; la semaine devient une vue de 3 jours lisible ; l'astuce
  parle de gestes, plus de raccourcis clavier.

### Dépenses (#86)

- ✨ **Dépenses** : qui a payé quoi, la date, le montant, la catégorie et un commentaire. Une
  dépense est **commune** (partagée moitié-moitié, ou selon des proportions comme 60 / 40),
  **avancée pour l'autre**, ou **perso** (visible de vous seul).
- ✨ **Qui doit quoi** : « Nicolas doit 42,50 € à Grace », et **Enregistrer le remboursement**
  pour remettre les compteurs à zéro.
- ✨ Totaux du mois : dépenses communes, ce que chacun a payé et sa part, mes dépenses perso,
  par catégorie. Sur le site et dans l'app Android (Plus → Dépenses).
- 🛠 Sur téléphone, le dernier onglet du site devient **Plus** : Dépenses, Menus, Bilan, Revue,
  Journal et Réglages.
- 🔒 Les dépenses perso ne sont visibles que de leur auteur ; toutes les dépenses font partie de
  l'export de vos données.

### Dépenses : parts à la main, charges fixes, tickets (#86)

- ✨ **Parts à la main** : « 30 € pour Grace, 60 € pour Nicolas », avec ce qu'il reste à répartir.
- ✨ **Charges fixes** : cochez **Chaque mois** (loyer, abonnements) ; la dépense est ajoutée
  seule chaque mois, et s'arrête d'un geste.
- ✨ **Ticket** : une photo ou un PDF joint à la dépense, à rouvrir à tout moment.
- ✨ **Noter la dépense** après avoir vidé le panier des courses, ou en cochant une tâche de
  paiement (sur le site).
- ⚙️ Workflow « Google Play — mettre à jour la fiche » : descriptions et captures envoyées
  d'un clic, dans les trois langues.

### Dépenses : budget, évolution, export (#87)

- ✨ **Budget commun du mois** : une jauge « 85 € sur 100 € », et une notification au foyer à
  80 % puis à 100 % (réglable dans Réglages → Notifications).
- ✨ **Sur 6 mois** : les dépenses communes mois par mois, avec le budget en repère.
- ✨ **Exporter** en tableur (CSV pour Excel, LibreOffice ou Google Sheets), dans la langue de
  votre compte, avec la part de chacun. Sur Android, le fichier se partage vers l'app de votre
  choix.
- 🛠 Android : l'onglet **Réglages** devient **Plus**, comme sur le site : Dépenses, Journal,
  Absences et Signaler un problème en tête, puis les réglages.

### Instructions de travail

- ⚙️ Fichier `CLAUDE.md`, déroulé de travail et grille d'audit UI/UX (site, app web, Android),
  appliqués à chaque modification.

## 1er octobre 2026

### Passkeys plus robustes

- 🐞 Une erreur dans `WEBAUTHN_RP_ID` ou `WEBAUTHN_ORIGINS` (faute de frappe, `https://` oublié)
  empêchait de créer une passkey. L’origine sans schéma est maintenant complétée, et un domaine
  incohérent est ignoré au profit de l’adresse du site, avec un message dans les journaux.

## 30 septembre 2026

### Néerlandais (#79)

- ✨ Tandem est disponible en néerlandais (tutoiement, « je ») : app web, app Android, e-mails,
  notifications, site vitrine (`/nl/`) et fiche Google Play. Un navigateur ou un téléphone en
  néerlandais l’affiche directement ; sinon, Réglages → Langue → **Nederlands**.
- ✨ L’ajout rapide comprend le néerlandais : « Vuilnis buitenzetten morgen 19u Grace ».

### Abonnement iCal (#79)

- ✨ Réglages → Calendrier : un lien privé à ajouter dans Apple Calendrier, Outlook ou toute app
  de calendrier. Vos tâches datées y apparaissent et se mettent à jour seules (lecture seule).
- 🔒 Le lien est secret et personnel : il se renouvelle ou se désactive en un clic, et disparaît
  avec votre compte.

### « Merci » et revue de la semaine (#79)

- ✨ Un cœur sur une tâche faite par l’autre pour lui dire merci ; il reçoit une notification.
- ✨ Revue de la semaine : ce qui a été fait (par qui, combien de temps, combien de mercis), ce qui
  a glissé, et la semaine à venir. Bandeau le dimanche sur le site, notification à 19 h sur
  Android (désactivable dans les Réglages).

### Menus de la semaine (#79)

- ✨ Nouvelle page **Repas** : midi et soir pour chaque jour, avec les ingrédients. Un geste les
  ajoute à la liste de courses, sans doublon avec ce qui y est déjà. Sur Android, la carte
  « Repas de la semaine » est en haut des Courses.

### Passkeys (#79)

- ✨ Connexion sans mot de passe, avec l’empreinte, le visage ou le code de l’appareil :
  Réglages → Compte → **Ajouter une passkey**, puis **Se connecter avec une passkey**.
- 🔒 Seule la clé publique est enregistrée ; l’empreinte ou le visage ne quittent jamais
  l’appareil.

## 29 septembre 2026

### Choisir sa langue (web et Android)

- ✨ Sélecteur de langue (Français, English) sur la page de connexion et dans les Réglages de
  l’app web. Sur Android, il est dans Réglages → Langue, avec aussi l’option « Langue du téléphone ».
  Le choix est enregistré dans votre compte et vaut aussi pour les e-mails.
- 🐞 Un téléphone ou un navigateur réglé dans une autre langue que le français ou l’anglais
  (espagnol, allemand…) affichait Tandem en français : il l’affiche désormais en anglais.
- 🛠 Nouveau compte : les e-mails arrivent dans la langue utilisée pour s’inscrire.

### Anglais partout et vidéo de présentation

- ✨ Site vitrine : une vidéo de 20 secondes présente Tandem : cocher, répéter, glisser-déposer.
  Elle est muette par défaut, avec un bouton pour le son, et ne se lance pas seule si vous
  préférez réduire les animations.
- 🛠 Site vitrine : un navigateur réglé dans une autre langue que le français arrive sur la
  version anglaise ; votre choix de langue est ensuite mémorisé.
- 🛠 App web : la description de la page et la page d’erreur de dernier recours sont traduites
  en anglais. L’app Android et les e-mails l’étaient déjà.

### Site vitrine (#74)

- ✨ Nouveau site de présentation de Tandem, en français et en anglais : fonctionnalités, étapes,
  répartition, captures de l’app, confidentialité et questions fréquentes, avec animations et
  mode sombre. Mêmes couleurs et composants que l’app.
- ✨ Visiteur non connecté sur tandem-agenda.app : redirigé vers le site vitrine (si configuré).

## 28 septembre 2026

### App Google Play : plus de plantage à l’ouverture (#73)

- 🐞 La version installée depuis Google Play se fermait dès la connexion : elle vérifiait si elle
  pouvait installer une mise à jour, une permission volontairement absente de cette version
  (les mises à jour y passent par le Play Store).

### Plantages de l’app lisibles dans les journaux (#72, #73)

- ⚙️ Les plantages de l’app Android (et erreurs du site) apparaissent dans les journaux de l’API
  avec le début de leur pile d’appels, même sans Sentry : `docker logs … | grep -A 20 "Client error"`.
- 🐞 L’app envoie son plantage aussitôt (et plus seulement au lancement suivant) : un plantage à
  chaque ouverture n’empêche plus le rapport d’arriver.

### E-mails aux couleurs de Tandem (#71)

- ✨ Les e-mails (mot de passe oublié, accusés de réception, réponses aux signalements, alertes)
  portent le logo, une mise en page soignée et un pied avec les liens Confidentialité, Aide,
  Signaler un problème et Réglages, ainsi que l’adresse de contact.

### Logo dans l’app et fiche Google Play (#70)

- ✨ Le logo Tandem apparaît après la connexion : barre latérale et haut des pages du site,
  écran « Aujourd’hui » de l’app Android.
- 🛠 Fiche Google Play refaite avec le nouveau logo : icône, bannière et captures d’écran.

### Connexion avec Google pendant le changement d’adresse (#69)

- 🐞 « La connexion avec Google n’a pas abouti » quand elle était lancée depuis l’ancienne
  adresse : elle repart désormais automatiquement de tandem-agenda.app.

### Nouvelle adresse : tandem-agenda.app (#67)

- ✨ Le site déménage sur **[tandem-agenda.app](https://tandem-agenda.app)** et la documentation
  sur **docs.tandem-agenda.app**. L’ancienne adresse reste active le temps de la transition.
- ⚙️ L’app Android prend son identifiant définitif, `app.tandem.foyer`, en vue de Google Play.
  La prochaine mise à jour installe **Tandem** à côté de l’ancienne app : connectez-vous dans
  Tandem, puis désinstallez « Agenda G & N ».
- ⚙️ Dernières traces de l’ancien nom retirées (fichiers d’installation `tandem.apk`, export
  `tandem-export/1`, en-têtes techniques) ; les anciennes valeurs restent acceptées.

### Mise à jour Android fiable (#62)

- 🐞 « Le téléchargement a échoué » pendant la mise à jour de l’app : Cloudflare gardait en
  cache l’ancien APK (4 h), dont l’empreinte ne correspondait plus à la nouvelle version ; et la
  release était supprimée puis recréée à chaque publication. L’APK n’est plus mis en cache, son
  adresse contient la version, la release est mise à jour sur place et l’API sert la dernière
  version valide pendant une republication.

## 27 septembre 2026

### Agenda G & N devient Tandem

- ✨ Nouveau nom, **Tandem**, nouveau slogan — *L’équilibre parfait pour votre foyer* — et nouveau
  logo, sur le site, l’app Android, les e-mails, les notifications et la documentation.
- ⚙️ Rien ne change pour vos données ni vos comptes.

### Signaler un problème (#61)

- ✨ **Signaler un problème** depuis le site et l'app Android : bug, idée ou question, capture
  d'écran facultative, suivi de l'état et **réponse de l'administrateur** dans l'app.
- ✨ Administration → **Signalements** : à traiter, répondre, changer l'état ; alerte e-mail et
  notification à chaque nouveau signalement.
- 🔒 Informations techniques et contact par e-mail **décochés par défaut**, contenu affiché avant
  l'envoi ; conservation limitée (180 jours après résolution), retrait à tout moment, export RGPD.
- 🔒 Politique de confidentialité et « Sécurité des données » Google Play mises à jour
  (signalements, commentaires, notifications du navigateur, pièces jointes des e-mails).
- 🛠 Réglages → **Aide** : signaler, documentation, état du service ; bouton *Signaler ce
  problème* sur les pages d'erreur.

### Documentation, API et CI (#58)

- ✨ **Site de documentation** : guide d'utilisation complet, confidentialité & RGPD (registre
  des traitements), technique, nouveautés, recherche.
- ✨ **Référence de l'API** (Swagger) générée depuis le code : chaque route documentée avec ses
  paramètres, son corps et sa réponse ; fichier OpenAPI 3 téléchargeable.
- 🔒 Section « Sécurité des données » de Google Play complétée (photos et fichiers joints).
- ⚙️ CI plus sobre en minutes GitHub Actions : l'app Android et la doc ont leurs propres
  workflows, tests sur émulateur à la demande, surveillance GitHub toutes les 2 h.

### Surveillance et tests sur émulateur (#56, #57)

- ✨ **Page publique « État du service »** (`/status`) : état de chaque composant, disponibilité
  sur 90 jours, incidents.
- ✨ **Alertes automatiques** aux administrateurs (e-mail et notification) en cas d'incident, et
  à son retour à la normale.
- ✨ Administration → **Surveillance** : trafic, erreurs, temps de réponse, routes les plus lentes.
- ✨ Métriques **Prometheus** (`/metrics`) et guide **Uptime Kuma**.
- 🐞 Android : **« Prendre une photo »** et **ouvrir une pièce jointe** plantaient l'app.
- 🐞 « Chacun son tour » pouvait rester « à définir » quand le foyer se chargeait en différé.
- ⚙️ Tests sur un vrai émulateur Android (migrations de la base, premier lancement, fichiers).

### Administration (#55)

- ✨ **Page d'administration** : chiffres clés, comptes (créer, désactiver, déconnecter partout,
  lien de mot de passe, supprimer), foyers, **sauvegarde à la demande**, e-mail et notification
  de test.

### Courses malignes (#54)

- ✨ Articles rangés **par rayon** (appris quand on corrige), **quantités** (« 2 kg de pommes »,
  « lait x6 »), **souvent achetés** en un geste.

### Notifications du site (#53)

- ✨ **Notifications du navigateur** (Web Push), même site fermé, sur ordinateur et mobile.

### Commentaires (#52)

- ✨ **Commentaires sur une tâche**, en temps réel, avec notification à l'autre (sans le texte).

### Mode absence (#51)

- ✨ « Grace est absente du 3 au 10 » : ses tâches partagées passent à l'autre, tours de rôle
  compris.

### Répétition « après la dernière fois » (#50)

- ✨ La suivante est prévue X jours / semaines / mois **après le jour où c'est fait** (détartrer,
  changer un filtre), avec « fait il y a 5 semaines par Grace ».

### Lot Android et données (#49)

- ✨ Android : **photo** jointe à une tâche, **journal d'activité** et **corbeille**.
- 🔒 **Export des données** complété (pièces jointes, commentaires) ; accusé de réception
  e-mail désactivable.

### Pièces jointes et e-mail (#46, #47, #48)

- ✨ **Ajouter une tâche par e-mail** : un e-mail transféré à son adresse personnelle devient une
  tâche, avec ses **pièces jointes** et un **accusé de réception**.
- ✨ **Pièces jointes** sur les tâches (factures, photos).
- ✨ **Site hors ligne** : consulter, cocher, ajouter et faire les courses sans réseau.
- 🛠 Passe visuelle complète (site et app), icône Android thématique.

### Corbeille et journal (#45)

- ✨ **Annuler** après avoir coché ou supprimé, **corbeille** de 30 jours, **journal d'activité**
  exportable en CSV.

### Échéances souples, modèles, raccourcis (#44)

- ✨ **Échéance souple** (« cette semaine », « ce mois-ci »), **reporter en un geste**,
  **récapitulatif du matin** à 8 h.
- ✨ **Modèles de tâches** et **historique « fait par »** des tâches récurrentes.
- ✨ Android : **raccourcis**, **dictée**, **partage** vers l'app, widget **Semaine**.

### Courses en temps réel (#43)

- ✨ **Liste de courses partagée** en temps réel, hors ligne sur Android, widget **Courses**.
- ✨ **Temps réel** : ce que l'autre change apparaît aussitôt.

## 26 septembre 2026

### Android complet et Google Play (#34 à #42)

- ✨ Android : **répétition et tour de rôle** complets dans le formulaire.
- ✨ **Notifications instantanées** Android (Firebase) et diagnostic dans les réglages.
- ✨ **Synchronisation Google Agenda → app** (déplacements et renommages repris).
- ✨ App prête pour **Google Play** (fiche, captures, version sans auto-mise à jour).
- 🐞 Une configuration Firebase invalide ne bloque plus le démarrage du serveur.

### Listes, répartition, maintenance (#24)

- ✨ **Sous-tâches / listes** dans une tâche, **suggestion de répartition** (la personne la moins
  chargée).
- ⚙️ Dependabot et surveillance de disponibilité.

### Statistiques, notifications, accessibilité (#21 à #23)

- ✨ **Bilan** (7 / 30 jours), **centre de notifications** et préférences, **glisser-déposer**
  dans le calendrier (souris, doigt, clavier), assistant de **premier lancement**.
- ✨ Android : glisser-déposer dans le calendrier, widget **Aujourd'hui**.
- 🔒 Audit d'accessibilité WCAG 2.2 AA sans violation (clair et sombre).
- 🐞 « @21h » dans l'ajout rapide n'est plus pris pour une personne ; glisser au doigt fiabilisé.

### Exploitation (#19, #20)

- 🔒 **Sauvegardes** nocturnes restaurées et vérifiées, copie hors serveur ; suivi des erreurs ;
  **politique de confidentialité**.
- ✨ Android : **connexion Google**, **mises à jour automatiques**, clé de signature secrète.

### Compte et identité visuelle (#12 à #17)

- ✨ **Logo** et icônes (Android, favicon, écran d'accueil), APK à adresse fixe.
- ✨ **Changer son mot de passe**, **délier Google**.
- 🐞 Logo et icônes absents en production.

### Application Android (#11)

- ✨ **App Android** native : hors ligne, calendrier, rappels, widgets.

### Google Agenda (#6 à #10)

- ✨ **Publication des tâches dans un Google Agenda partagé**, messages d'erreur précis,
  créations sans doublon.
- 🔒 Clé de chiffrement des jetons vérifiée au démarrage.

### Récurrence, calendrier, compte (#4)

- ✨ **Répétitions et tours de rôle**, **calendrier** (mois, semaine, jour).
- ✨ **Mot de passe oublié**, **connexion Google**, **export et suppression** des données.

### Tâches (#3)

- ✨ Tâches, **ajout rapide** en langage naturel, écran **Aujourd'hui**, vue **Tâches**,
  catégories.

### Mise en ligne (#1)

- ⚙️ Déploiement Coolify (Docker Compose) derrière Cloudflare.
