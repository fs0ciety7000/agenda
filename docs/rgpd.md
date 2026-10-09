---
title: Confidentialité & RGPD
description: Données traitées, finalités, bases légales, durées de conservation, prestataires, sécurité et droits — registre des traitements de Tandem.
---

# Confidentialité & RGPD

Tandem est une application **privée et non commerciale** : ni publicité, ni revente, ni
pistage, ni mesure d'audience. Cette page est la version détaillée (registre des traitements) de
la [politique de confidentialité](https://tandem-agenda.app/privacy) affichée dans l'app ; en
cas de doute, c'est la politique en ligne qui fait foi pour les utilisateurs.

## Responsable du traitement

L'administrateur qui héberge l'instance (un membre du foyer, sur son propre serveur, derrière
Cloudflare). Contact : l'adresse affichée sur la page `/privacy` (variable
`PRIVACY_CONTACT_EMAIL`), à défaut l'administrateur du foyer.

## Registre des traitements

| Traitement | Données | Finalité | Base légale | Conservation |
|---|---|---|---|---|
| **Compte** | prénom, e-mail, mot de passe **haché (Argon2id)**, langue, identité Google liée (identifiant, e-mail vérifié) | se connecter, retrouver son foyer | exécution du service | tant que le compte existe |
| **Sessions** | appareil (en-tête User-Agent : navigateur et système, ou version de l'app Android et d'Android, sans le modèle du téléphone), date de connexion, dernière activité, jeton de rafraîchissement **haché**, fin d'ouverture du coffre des notes sensibles (5 minutes après le mot de passe) | rester connecté, « Appareils connectés » et déconnexion à distance | exécution du service | 60 jours d'inactivité |
| **Foyer et tâches** | foyer, membres, catégories, tâches, notes, dates, responsables, répétitions, sous-tâches, commentaires, demandes d'échange de tour (et le mot laissé), liste de courses, notes partagées (titre, contenu, auteur, marque « sensible » ; les 20 versions précédentes de chacune, avec leur auteur et leur date, effacées avec la note), dates importantes (titre, jour, mois, année facultative, rappel ; peuvent concerner des proches, ex. un anniversaire) | le service lui-même | exécution du service | tant que le foyer existe ; tâche supprimée : **30 jours** en corbeille |
| **Pièces jointes** | fichiers joints (PDF, photos), taille, type | joindre une facture, une photo | exécution du service | supprimées avec la tâche ; 10 Mo / fichier, 200 Mo / foyer |
| **Journal d'activité** | qui a fait quoi, quand, champs modifiés (pas les valeurs) | transparence entre membres, annuler | intérêt légitime (vie commune) | **1 an** |
| **Dépenses** (si utilisées) | montant, date, libellé, catégorie, commentaire, qui a payé, part de chacun, charges fixes (montant, jour du mois), ticket joint (photo ou PDF), budget mensuel commun du foyer ; photo lue par « Lire un ticket » (traitée en mémoire sur le serveur par Tesseract, aucun prestataire, effacée aussitôt, conservée seulement si l'utilisateur la joint à la dépense) ; une dépense **perso** n'est visible que de son auteur | partager les frais du foyer, calculer qui doit quoi | exécution du service | tant que le foyer existe ; dépenses perso effacées avec le compte, dépenses communes conservées (membre anonymisé) pour les soldes |
| **Absences** | membre absent, dates | réattribuer les tâches partagées | exécution du service | supprimées avec le foyer |
| **Notifications** | notifications de l'app, préférences ; jeton Firebase (Android) ; abonnement Web Push (navigateur) | prévenir d'une tâche confiée, d'un commentaire | exécution du service ; activation volontaire | jeton / abonnement supprimés à la déconnexion ou s'ils expirent |
| **Tâches par e-mail** (si activé) | expéditeur, sujet, texte et pièces jointes des e-mails transférés à l'adresse personnelle | créer une tâche depuis un e-mail | action de l'utilisateur | comme la tâche créée |
| **Google Agenda** (si connecté) | liste des agendas, événements créés par l'app ; jetons OAuth **chiffrés AES-256-GCM** | publier les tâches dans l'agenda commun | **consentement** (révocable) | jusqu'à la déconnexion de Google Agenda |
| **Signalements** | type, titre, description, capture d'écran (facultative), choix d'être recontacté ; informations techniques **seulement si l'utilisateur coche la case** (version, navigateur ou modèle, système, langue, fuseau, écran, page) | traiter un bug, une idée, une question | action de l'utilisateur ; contact par e-mail : **consentement** | tant qu'ouvert, puis **180 jours** après résolution ; retirable à tout moment ; effacé avec le compte |
| **Passkeys** (si ajoutées) | clé **publique** de chaque passkey, nom de l'appareil, dates d'ajout et de dernière utilisation ; défi à usage unique | se connecter sans mot de passe | action de l'utilisateur | jusqu'à sa suppression (Réglages) ou celle du compte ; défi : 5 minutes |
| **Abonnement iCal** (si créé) | jeton secret du lien | afficher ses tâches datées dans un autre agenda | action de l'utilisateur | jusqu'à la désactivation du lien ou la suppression du compte |
| **Sauvegarde du foyer** (si téléchargée ou restaurée) | archive .zip fabriquée à la demande, jamais conservée sur le serveur ; elle contient les données du foyer que le membre voit (pas les tâches ni dépenses personnelles de l'autre) et l'**adresse e-mail** de chaque membre, pour le retrouver sur l'autre instance ; à la restauration, l'adresse d'un membre pas encore inscrit est gardée (`pendingEmail`) jusqu'à son arrivée | déménager un foyer vers une autre instance | action de l'utilisateur ; mot de passe demandé (notes sensibles incluses) | adresse en attente effacée quand le membre rejoint le foyer, ou avec le foyer ; le fichier téléchargé est sous la responsabilité de celui qui le garde |
| **Codes-barres des courses** (si utilisés) | code-barres et nom retenu par le foyer (donné par un membre ou trouvé dans Open Food Facts) ; photo du code lue en mémoire sur le serveur par zbar, **effacée aussitôt**, jamais conservée ; donnée du foyer, sans auteur (hors export personnel) | ajouter un article en photographiant son code-barres | action de l'utilisateur | tant que le foyer existe |
| **Lien invité des courses** (si créé) | jeton secret du lien, date de création, membre qui l'a créé ; l'invité ne voit que les articles (texte, quantité, rayon, pris ou non) et le nom du foyer, ni membres ni dates ; aucune donnée sur l'invité n'est enregistrée (hors journaux techniques) | montrer la liste à une baby-sitter, à quelqu'un qui garde la maison | action d'un membre | jusqu'à ce qu'un membre coupe ou remplace le lien, ou la suppression du foyer |
| **Mot de passe oublié** | jeton de réinitialisation **haché** | réinitialiser le mot de passe | exécution du service | 30 minutes |
| **Sécurité et exploitation** | journaux techniques (route, statut, durée, adresse IP pour la limitation des tentatives), erreurs techniques, métriques agrégées par minute (sans utilisateur) | disponibilité, sécurité, correction des erreurs | intérêt légitime | métriques 8 jours ; sondes 7 jours ; journaux selon l'hébergeur |
| **Sauvegardes** | copie chiffrée en transit de la base | restaurer en cas de panne | intérêt légitime | 14 jours sur le serveur, 30 jours hors serveur |

L'app Android garde une **copie locale** des données du foyer (tâches, courses, notes, dates importantes) pour fonctionner hors ligne ; le
site en garde une dans le navigateur (stockage local et cache du service worker). Les deux sont
effacées à la déconnexion.

## Ce qui n'est jamais collecté

Position, contacts, agenda du téléphone, historique de navigation, identifiant publicitaire,
données de santé ou financières. Aucun cookie de mesure d'audience ou de publicité : uniquement
les cookies **strictement nécessaires** (session `httpOnly`, suivi d'une connexion Google en
cours pendant quelques minutes).

## Prestataires (sous-traitants)

| Prestataire | Rôle | Données reçues | Quand |
|---|---|---|---|
| **Hébergeur du serveur** (VPS de l'administrateur, Coolify) | héberge l'app et la base | toutes (chiffrées en transit) | toujours |
| **Cloudflare** | DNS, HTTPS, protection | trafic (chiffré de bout en bout jusqu'à Cloudflare) | toujours |
| **Fournisseur d'e-mails** (SMTP : Resend, Brevo…) | mot de passe oublié, accusés, alertes admin | adresse e-mail, contenu du message | à l'envoi |
| **Resend** (réception) | tâches par e-mail | e-mails transférés à l'adresse personnelle | si activé |
| **Google** | connexion Google, Google Agenda | identifiant et e-mail ; événements des tâches publiées | si utilisé |
| **Firebase Cloud Messaging** | notifications instantanées Android | jeton de l'appareil et un signal « du nouveau » — **jamais** le contenu d'une tâche | si configuré |
| **Services push des navigateurs** (Google, Mozilla, Apple) | notifications du site | abonnement du navigateur ; le message est **chiffré de bout en bout** (RFC 8291), illisible par le service | si activé par l'utilisateur |
| **Stockage hors serveur** (Cloudflare R2…) | copie des sauvegardes | sauvegarde de la base | si configuré |
| **Open Food Facts** (base ouverte, association) | nom des produits lus par code-barres | le **code-barres seul**, envoyé par le serveur (ni utilisateur, ni foyer, ni photo) | au premier scan d'un produit inconnu du foyer ; désactivable (`OPEN_FOOD_FACTS_URL=off`) |
| **Sentry / GlitchTip** | suivi des erreurs | type d'erreur, page, version — sans contenu de tâche ni identité | si configuré |

Aucun transfert à des fins publicitaires. Les données reçues des API Google respectent la
*Google API Services User Data Policy*, exigences *Limited Use* comprises.

## Sécurité

- HTTPS partout ; cookies `httpOnly`, `Secure`, `SameSite=Lax` ; protection CSRF sur toute
  modification.
- Mots de passe hachés (Argon2id), jetons de session et de réinitialisation hachés, jetons Google
  chiffrés (AES-256-GCM, clé hors base).
- Cloisonnement strict entre foyers (vérifié à chaque requête) ; tâches personnelles visibles par
  leur seul auteur.
- Limitation des tentatives de connexion ; en-têtes de sécurité (Helmet).
- Sauvegardes quotidiennes **restaurées et vérifiées** automatiquement, copie hors serveur.
- Surveillance continue et alertes en cas d'incident ([Surveillance](monitoring.md)).

## Vos droits

| Droit | Comment |
|---|---|
| **Accès / portabilité** | Réglages → Données & confidentialité → **Exporter mes données** (JSON) |
| **Rectification** | directement dans l'app (prénom, tâches…), ou en contactant l'administrateur |
| **Retrait d'un signalement** | Réglages → Aide → Signaler un problème → *Mes signalements* → corbeille |
| **Effacement** | Réglages → Données & confidentialité → **Supprimer mon compte** (immédiat) ; sauvegardes : effacées sous 30 jours |
| **Retrait du consentement** (Google Agenda) | Réglages → Calendrier partagé → *Retirer l'accès* |
| **Opposition, limitation** | contacter l'administrateur |
| **Réclamation** | autorité de protection des données de votre pays (Belgique : [Autorité de protection des données](https://www.autoriteprotectiondonnees.be)) |

## Google Play : section « Sécurité des données »

Les réponses au formulaire de Google Play (données collectées, finalités, caractère facultatif)
sont tenues à jour dans [Google Play → Sécurité des données](play-store.md#4-sécurité-des-données-réponses).
Toute nouvelle donnée collectée par l'app Android doit y être ajoutée **avant** publication.

## Tenir cette page à jour

Toute fonction qui collecte une nouvelle donnée ou ajoute un prestataire met à jour, dans la même
PR : ce registre, la politique en ligne (`apps/web/messages/*.json` → `privacyPolicy`) et, pour
Android, la section Sécurité des données.

**Notes sensibles.** Le contenu d'une note marquée « sensible » n'est jamais renvoyé par la
liste, la recherche ni l'historique (il n'est donc pas non plus gardé dans les copies hors ligne
du site et de l'app). Il s'affiche après le mot de passe du compte sur le site (une confirmation
pour un compte sans mot de passe), ou après l'empreinte ou le code du téléphone, vérifiés par
Android sur l'appareil : aucune donnée biométrique n'est transmise à Tandem. Le contenu reste
stocké comme les autres notes (base chiffrée au repos selon l'hébergement) et figure dans l'export
des données de son auteur.
