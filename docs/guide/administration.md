---
title: Administration
description: Page d'administration réservée aux comptes listés dans ADMIN_EMAILS — comptes, foyers, sauvegardes, surveillance.
---

# Administration

La page **Réglages → Administration** n'apparaît que pour les comptes dont l'adresse figure dans
la variable serveur `ADMIN_EMAILS` (voir [Déploiement](../deployment.md)).

| Onglet | Contenu |
|---|---|
| **Vue d'ensemble** | chiffres clés (comptes, foyers, tâches), fonctions configurées (e-mail, Google, notifications, sauvegardes hors serveur…) |
| **Comptes** | rechercher ; **créer un compte** (un lien pour choisir le mot de passe est envoyé ou copié) ; **désactiver** / réactiver ; **déconnecter partout** ; envoyer un **lien de mot de passe** ; **supprimer** |
| **Foyers** | foyers, membres, nombre de tâches et de tâches à faire |
| **Sauvegardes** | historique (durée, taille, vérification de restauration, copie hors serveur) et **Lancer une sauvegarde** maintenant |
| **Surveillance** | disponibilité, incidents, trafic, erreurs, temps de réponse, routes les plus lentes ([Surveillance](../monitoring.md)) |
| **Tests** | envoyer un **e-mail de test** et une **notification de test** pour vérifier la configuration |

Bonnes pratiques :

- fermer les inscriptions (`REGISTRATION_ENABLED=false`) une fois le foyer au complet, puis créer
  les comptes depuis l'administration ;
- un compte **désactivé** ne peut plus se connecter et ses sessions sont coupées, sans rien
  supprimer (préférable à la suppression en cas de doute) ;
- l'administration n'ouvre **aucun accès au contenu des tâches** des foyers : seulement des
  chiffres.
