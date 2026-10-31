---
title: Compte, sécurité et données
description: Mot de passe, Google, sessions, export et suppression de ses données.
---

# Compte, sécurité et données

## Connexion

- **E-mail et mot de passe** (10 caractères minimum), ou **Continuer avec Google**.
- **Mot de passe oublié ?** envoie un lien valable **30 minutes**. Après réinitialisation, vous
  êtes déconnecté·e de tous vos appareils.
- **Réglages → Compte et sécurité** : changer de mot de passe, **se déconnecter de tous les appareils**
  (téléphone perdu).
- **Appareils connectés** (**Réglages → Compte et sécurité**, sur le site et sur Android) : chaque appareil
  où votre compte est ouvert (« Chrome · Windows », « App Android · Android 14 »), avec sa dernière
  activité et la date de connexion. **Déconnecter** ferme la session de cet appareil seulement ;
  **Déconnecter les autres appareils** (dès deux autres) les ferme toutes d'un coup, sauf celui
  que vous utilisez ;
  « Cet appareil » marque celui que vous utilisez. La liste demande une connexion.
- **Passkeys** (connexion sans mot de passe) : **Réglages → Compte et sécurité → Ajouter une passkey**, puis
  **Se connecter avec une passkey** sur la page de connexion. La passkey reste sur votre appareil
  (empreinte, visage ou code) ou dans votre trousseau (iCloud, Google) ; l'app ne garde qu'une
  clé publique, inutilisable par quelqu'un d'autre. Une passkey par appareil, supprimable à tout
  moment. Sur l'app Android (Android 9 et plus) : **Se connecter avec une passkey** sur l'écran de
  connexion, et **Réglages → Compte et sécurité → Passkeys** pour voir, ajouter ou supprimer les vôtres. Une
  passkey créée sur le site avec le gestionnaire de mots de passe Google marche aussi dans l'app,
  et inversement.
- **Alerte de connexion** : quand votre compte s'ouvre depuis un appareil qu'il n'a jamais vu
  (autre navigateur, autre système, ou l'app Android), un e-mail vous le dit, avec l'appareil et
  l'heure. Ce n'est pas vous ? Le bouton de l'e-mail mène aux **Appareils connectés** : déconnectez
  les autres, puis changez votre mot de passe. Rien à faire si c'était vous ; pas d'e-mail à la
  toute première connexion ni pour un appareil déjà connu.
- **Double authentification** (**Réglages → Compte et sécurité**, sur le site) : après le mot de passe, un
  code à 6 chiffres de votre application d'authentification (Google Authenticator, Aegis,
  1Password…). **Activer** demande votre mot de passe, affiche un QR code à scanner, puis le premier
  code. Vous recevez alors **10 codes de secours**, montrés une seule fois : chacun remplace une fois
  le code de l'application (téléphone perdu ou changé). Gardez-les en lieu sûr ; **Nouveaux codes de
  secours** les remplace tous. **Désactiver** demande un code. L'app Android demande le code à la
  connexion ; son activation se fait sur le site. Les passkeys et « Continuer avec Google » n'en
  demandent pas : elles sont déjà protégées (empreinte ou code du téléphone, compte Google).
- **Lier / délier Google** dans **Réglages → Données et aide → Données & confidentialité** (définissez d'abord un
  mot de passe pour pouvoir délier Google).

## Vos données

**Réglages → Données et aide → Données & confidentialité** :

- **Exporter mes données** : un fichier JSON lisible avec ce qui vous concerne (compte,
  connexions, foyers, tâches créées et leurs dates, sous-tâches, pièces jointes, commentaires).
- **Supprimer mon compte** : immédiat et définitif. Votre compte, vos sessions et vos tâches
  personnelles sont effacés ; les tâches partagées restent au foyer, où vous apparaissez comme
  « Ancien membre ». Exportez vos données avant.

Ce que l'app fait de vos données, combien de temps elle les garde et avec quels prestataires :
[Confidentialité & RGPD](../rgpd.md).

## Sauvegarde du foyer

**Réglages → Données et aide → Sauvegarde du foyer → Télécharger la sauvegarde**, sur le site ou dans l'app
Android (elle propose où l'enregistrer : Fichiers, Drive…) : une archive `.zip` de tout le
foyer, à garder en lieu sûr ou à restaurer sur une autre instance de Tandem (changement de
serveur, d'hébergeur).

- **Ce qu'elle contient** : tâches, répétitions et rotations, ce qui a été fait et par qui,
  sous-tâches, commentaires, pièces jointes, modèles, courses (et la mémoire des produits et
  codes-barres), menus, notes (sensibles comprises, avec leurs versions), dates importantes,
  dépenses, tickets, charges fixes, budgets et absences.
- **Ce qu'elle ne contient pas** : les tâches et dépenses personnelles de l'autre, l'historique
  des actions, les notifications, les liens secrets (invité, iCal, adresse e-mail des tâches),
  Google Agenda, les mots de passe et les appareils connectés.
- Elle contient le texte des notes sensibles : votre **mot de passe** est demandé sur le site
  (ou une confirmation pour un compte Google), l'**empreinte ou le code du téléphone** dans
  l'app. Gardez le fichier pour vous.
- **Chiffrer avec une phrase de passe** (case à cocher, site et app) : le fichier devient un
  `.tandem` illisible sans elle (AES-256). Choisissez quelques mots faciles à retenir (10
  caractères au moins), tapés deux fois, et notez-les à part : la phrase n'est gardée nulle part,
  et sans elle personne ne peut restaurer la sauvegarde, pas même vous.
- La restauration se fait sur le site ; pour un `.tandem`, la phrase de passe est demandée.

**Restaurer** : sur l'autre instance, créez un compte puis, à l'accueil, **Vous avez une
sauvegarde ? → Choisir la sauvegarde**. Le foyer est recréé tel quel ; vous reprenez votre place
(même adresse e-mail, sinon celle de la personne qui a exporté). L'autre reçoit un **lien
d'invitation**, valable 30 jours : en le suivant avec son adresse, elle retrouve tout son
historique. Lien expiré ? **Réglages → Foyer** en propose un nouveau tant qu'elle est « en
attente ».

## Apparence et langue

Thème **Système**, **Clair** (papier et cobalt) ou **Sombre** (nuit et lilas) dans les Réglages,
sur le site comme sur Android ; chaque appareil garde son choix. L'app est en français, en
anglais et en néerlandais (langue du navigateur ou du téléphone, ou choix dans les Réglages ;
une autre langue affiche l'anglais). Le choix vaut aussi pour les e-mails.
