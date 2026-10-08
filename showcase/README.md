# Tandem — fiche vitrine

Dossier destiné au site du studio (OCC MONS Studios). Les captures utilisent uniquement des
données de démonstration (foyer fictif « Emma » et « Tom »), aucune donnée réelle.

## Nom officiel

**Tandem** — l'agenda partagé du foyer.

## Pitch (1 phrase)

Tandem organise le quotidien d'un foyer à deux : tâches, tours de rôle, courses, repas, dépenses
et calendrier, partagés en temps réel sur le web et sur Android.

## Description

Tandem part d'une idée simple : ouvrir l'app, voir ce qu'il y a à faire aujourd'hui, cocher, et
passer à autre chose. Les tâches se répètent et alternent toutes seules entre les membres du
foyer, la liste de courses se coche au magasin pendant que l'autre ajoute à la maison, et les
dépenses communes disent qui doit combien, sans jamais classer ni culpabiliser. Tout se
synchronise en direct, fonctionne hors ligne et se connecte à Google Agenda. Disponible en
français, anglais et néerlandais.

## Fonctionnalités clés

- **Aujourd'hui** : les tâches du jour, « Qui fait quoi » sur 7 jours, ajout rapide en langage
  naturel (« Réserver le resto vendredi 20h @tom »).
- **Répétitions et tours de rôle** : la vaisselle alterne toute seule ; échange de tour en un
  geste (« Peux-tu prendre ma tâche jeudi ? »).
- **Courses et menus** : liste partagée en temps réel, rangée par rayon, mode magasin plein écran.
- **Dépenses** : qui a payé quoi, soldes, remboursements, budget du mois, export tableur.
- **Notes partagées** : code Wi-Fi, mesures, idées cadeaux, épinglées.
- **Calendrier** : jour, semaine, mois, glisser-déposer, synchronisation Google Agenda.

## Stack technique

- **Web** : Next.js 15, React, TanStack Query, Tailwind CSS 4, PWA hors ligne (service worker).
- **API** : NestJS, Prisma, PostgreSQL, Redis/BullMQ, temps réel (SSE), notifications push web.
- **Android** : Kotlin, Jetpack Compose, Room, Retrofit, WorkManager (hors ligne), widgets,
  Firebase Cloud Messaging.
- **Commun** : monorepo pnpm/Turborepo, schémas Zod partagés, design system à tokens (web et
  Android), documentation Docusaurus.

## Statut et année

- **Statut** : en production (web) ; app Android disponible en APK et en test interne sur Google Play.
- **Année** : 2026.

## Liens

- Application web : https://tandem-agenda.app
- Présentation : https://decouvrir.tandem-agenda.app
- Documentation : https://docs.tandem-agenda.app
- App Android (APK, mise à jour automatique) : https://tandem-agenda.app/v1/app/android/tandem.apk

## Captures

| Fichier | Format | Écran |
|---|---|---|
| `desktop-accueil.png` | 1600 × 1000 | Aujourd'hui : tâches, ajout rapide, « Qui fait quoi », répartition |
| `desktop-calendrier-semaine.png` | 1600 × 1000 | Calendrier, vue semaine |
| `mobile-accueil.png` | 860 × 1860 (430 × 930 en @2x) | Aujourd'hui sur téléphone |
| `mobile-notes.png` | 860 × 1860 (430 × 930 en @2x) | Notes partagées |
