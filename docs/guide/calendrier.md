---
title: Calendrier et Google Agenda
description: Vues mois, semaine et jour, glisser-déposer, synchronisation avec un Google Agenda partagé.
---

# Calendrier et Google Agenda

## Le calendrier de l'app

- Vues **mois**, **semaine** et **jour** ; *Aujourd'hui* pour revenir à la date du jour.
- Sur téléphone (site) : la semaine devient **3 jours**, plus lisible ; le **mois** montre un
  point par tâche sous chaque jour, et le jour touché s'affiche en liste dessous, avec
  **Ajouter ce jour-là**. Pour changer une tâche de jour, touchez l'icône de calendrier au bout
de sa ligne, puis le jour voulu (*Annuler* est proposé juste après). Le glisser-déposer reste
disponible dans les vues jour et 3 jours.
- **Glisser-déposer** une tâche pour la déplacer (appui long au doigt), tirer son bord inférieur
  pour changer sa durée. Pour une tâche répétée, seule cette occurrence bouge. *Annuler* est
  proposé juste après.
- Au clavier ou avec un lecteur d'écran (TalkBack) : actions « jour précédent / suivant ».
- Toucher un créneau vide crée une tâche à cette heure-là.

## Publier dans Google Agenda (facultatif)

Les tâches planifiées peuvent apparaître dans un **agenda Google partagé** du foyer (par exemple
« Commun G & N »).

1. **Réglages → Calendrier partagé → Connecter Google Calendar**, puis accepter l'accès sur
   l'écran Google (cocher les deux cases demandées).
2. Choisir le calendrier commun. Il doit être modifiable par votre compte ; s'il n'apparaît pas,
   demandez à la personne qui l'a créé de le partager avec vous (« Modifier les événements »).
3. Dans une tâche, **Ajouter au calendrier partagé** (coché par défaut pour les tâches datées
   partagées).

Ce qui se passe ensuite :

- les créations, modifications et suppressions dans l'app sont reportées dans Google en quelques
  secondes (en arrière-plan : l'app n'attend jamais Google) ;
- un **déplacement** ou un **renommage** fait dans Google est repris dans l'app ;
- l'app ne **lit pas** vos autres événements et ne touche qu'à ceux qu'elle a créés ;
- l'état (« Synchronisé », « Synchronisation… », « interrompue ») est visible dans les Réglages,
  avec *Synchroniser maintenant*.

**Arrêter** : *Déconnecter le calendrier* (les événements créés par l'app y sont supprimés) ou
*Retirer l'accès* (révoque l'autorisation Google). Détails techniques :
[Google Calendar](../google-calendar.md).

## S'abonner depuis Apple Calendrier, Outlook ou un autre agenda

Pas de compte Google ? Un **lien iCal privé** affiche vos tâches datées dans n'importe quel agenda,
en lecture seule :

1. **Réglages → Calendrier → Abonnement iCal → Créer mon lien**, puis **Copier**.
2. Dans votre agenda :
   - **Apple Calendrier** (Mac, iPhone) : *Ouvrir dans Apple Calendrier*, ou *Fichier → Nouvel
     abonnement* et coller le lien ;
   - **Outlook** : *Ajouter un calendrier → S'abonner à partir du web* ;
   - **Proton Calendar, Thunderbird…** : « ajouter un calendrier par URL ».

Le lien contient les tâches partagées du foyer et **vos** tâches personnelles (jamais celles des
autres), des 60 derniers jours à l'année à venir. Les tâches faites sont précédées de « ✓ ».
L'agenda se met à jour à son propre rythme, souvent toutes les heures.

Le lien est **secret** : quiconque le connaît voit vos tâches. *Nouveau lien* remplace l'ancien,
qui cesse aussitôt de fonctionner ; *Désactiver* supprime l'abonnement.
