# Product Requirements — Tandem

> Statut : Phase 0 (Discovery) · Dernière mise à jour : 2026-09-26
> Langue produit : français (anglais prévu). Marché : Belgique / UE.

## 1. Vision

Un **household task manager** pour deux personnes (Grace & Nicolas), extensible à des foyers
plus grands. Pas un clone de Todoist : la valeur réside dans

1. **la répartition** des responsabilités (attribution, rotation, « à deux », « à définir ») ;
2. **l'automatisation** des tâches récurrentes (occurrences générées, rotation automatique) ;
3. **le calendrier Google partagé** « Commun G & N » comme surface de visibilité commune.

Principe directeur UX : *ouvrir → voir ce que j'ai à faire aujourd'hui → cocher → fermer*.

## 2. Personas

| Persona | Besoin principal | Contexte |
|---|---|---|
| Grace | Savoir ce qui lui revient aujourd'hui, créer vite une tâche | Mobile Android surtout |
| Nicolas | Idem + configurer les rotations, le calendrier Google | Web desktop + Android |
| (futur) membre de famille / colocataire | Voir et cocher ses tâches | Invité dans un foyer existant |

## 3. Glossaire (langage commun produit ↔ technique)

| Terme | Définition |
|---|---|
| **Foyer** (`Household`) | Groupe qui partage des tâches. Unité d'isolation des données (tenant). |
| **Membre** (`HouseholdMember`) | Lien utilisateur ↔ foyer, avec rôle (`OWNER`, `MEMBER`). |
| **Tâche** (`Task`) | Définition : titre, catégorie, priorité, visibilité, mode d'attribution. |
| **Série** (`TaskSeries`) | Règle de récurrence + rotation d'une tâche, valable sur une période. Une tâche récurrente modifiée « à partir de cette occurrence » est découpée en plusieurs séries. |
| **Occurrence** (`TaskOccurrence`) | Instance datée à réaliser. C'est ce qu'on coche, ce qui apparaît dans le calendrier et ce qui est synchronisé vers Google. Une tâche ponctuelle a exactement une occurrence. |
| **Responsable(s)** | Membre(s) assigné(s) à une occurrence. 0 = « à définir », 2+ = « à deux / ensemble ». |
| **Rotation** | Stratégie qui calcule le(s) responsable(s) de chaque occurrence. |

## 4. Types de tâches

Deux axes **orthogonaux** (évite l'ambiguïté de la liste initiale qui mélange visibilité et attribution) :

**Visibilité**
- `PERSONAL` — visible uniquement par son créateur (jamais synchronisée vers le calendrier partagé).
- `SHARED` — visible par tous les membres du foyer.

**Attribution** (pour les tâches partagées)
- Assignée à une personne (Grace **ou** Nicolas)
- À deux (Grace **et** Nicolas — tous deux responsables)
- Non attribuée (« à définir »)
- Rotation (calculée par occurrence)

## 5. User stories MVP (priorisées)

Légende : **M** = Must (MVP), **S** = Should, **C** = Could (post‑MVP).

### Auth & compte
- **M** En tant qu'utilisateur, je crée un compte email/mot de passe.
- **M** Je me connecte avec Google (OpenID Connect).
- **M** Je me déconnecte, y compris de tous mes appareils.
- **S** Je réinitialise mon mot de passe par email.
- **M** Je supprime mon compte et exporte mes données (RGPD).

### Foyer
- **M** Je crée un foyer (nom, fuseau horaire par défaut `Europe/Brussels`).
- **M** J'invite mon/ma partenaire par lien/email ; il/elle rejoint le foyer.
- **M** Les catégories par défaut sont créées automatiquement et modifiables.

### Tâches
- **M** Je crée une tâche en < 5 secondes (titre seul obligatoire).
- **M** Quick add : « Sortir les poubelles demain 19h » → titre, date, heure.
- **M** J'attribue : Grace / Nicolas / Nous deux / À définir.
- **M** Je définis priorité, catégorie, échéance, heure, durée, notes.
- **M** Je coche / décoche une occurrence.
- **M** Je filtre : aujourd'hui, à venir, en retard, récurrentes, personnelles, partagées, à deux ; par personne, catégorie, priorité, statut ; recherche texte.

### Récurrence & rotation
- **M** Répétition : quotidienne, jours ouvrés, hebdomadaire (jours choisis), toutes les N semaines, mensuelle (jour du mois / dernier jour), tous les N mois, annuelle.
- **M** Rotation : fixe, alternance, ensemble, séquence personnalisée (ex. G, G, N, N).
- **S** Rotation par jour de semaine (lundi → N, mercredi → G, samedi → alternance).
- **M** En modifiant une occurrence récurrente : *cette occurrence* / *celle-ci et les suivantes* / *toute la série*.
- **M** Supprimer une occurrence sans casser la série ni l'historique.

### Google Calendar
- **M** Je connecte mon compte Google (autorisation distincte du login).
- **M** Je vois la liste de mes calendriers et sélectionne « Commun G & N ».
- **M** Les occurrences planifiées (date + heure) des tâches partagées « ajoutées au calendrier » deviennent des événements.
- **M** Toute modification/suppression est répercutée ; aucun doublon.
- **M** Je vois l'état de synchronisation (✓ synchronisé / ⟳ en cours / ⚠ en attente / ✕ erreur) et un message compréhensible en cas d'erreur (droits, calendrier supprimé, accès révoqué).

### Dashboard & vues
- **M** Dashboard : « Bonjour Grace 👋 », Aujourd'hui, Cette semaine, Répartition (non compétitive).
- **M** Calendrier jour / semaine / mois ; **S** glisser-déposer, redimensionner.
- **S** Statistiques factuelles (réalisées, en retard, par catégorie, 7/30 jours, temps estimé).

### Notifications
- **S** Rappels : tâche à venir, en retard, attribuée, changement de responsable, sync Google échouée. Préférences individuelles.

### Android
- **M** (Phase 5) Dashboard, tâches, calendrier, création rapide, cocher hors-ligne avec synchronisation différée.

## 6. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| Performance | Dashboard interactif < 1,5 s (4G) ; API p95 < 200 ms hors appels Google. |
| Disponibilité | 99,5 % visé (usage personnel) ; les appels Google ne bloquent jamais l'UI (file de jobs). |
| Sécurité | OWASP ASVS niveau 2 visé ; isolation stricte par foyer ; tokens OAuth chiffrés (AES‑256‑GCM). |
| RGPD | Minimisation, export, effacement, rétention définie (cf. `architecture.md` §10). |
| Accessibilité | WCAG 2.2 AA (contrastes, clavier, lecteurs d'écran, cibles ≥ 44 px / 48 dp). |
| i18n | Aucun texte en dur ; FR par défaut, EN prêt. L'API renvoie des **codes** d'erreur, pas des phrases. |
| Fuseaux | Heures « murales » stockées avec le fuseau du foyer ; changements d'heure (DST) gérés. |

## 7. Hors périmètre MVP (explicitement)

- Synchronisation **bidirectionnelle** complète Google → app (on détecte les suppressions et on alerte ; l'import de modifications faites dans Google est post‑MVP).
- IA pour le quick add (le parseur déterministe suffit ; IA optionnelle plus tard).
- WebSocket temps réel (rafraîchissement au focus + polling léger suffisent pour 2 personnes).
- iOS.
- Tâches saisonnières avancées (couvertes par la récurrence annuelle / « tous les N mois » + fenêtre de validité de la série).

## 8. Ambiguïtés identifiées & décisions proposées

| # | Ambiguïté | Décision proposée (modifiable) |
|---|---|---|
| A1 | Le cahier des charges est tronqué à la règle 42 (« anti-overengineering »). | Interprétée comme : pas de micro-services, pas de Kubernetes, pas d'abstraction sans besoin actuel. **À confirmer.** |
| A2 | Quel compte Google écrit dans « Commun G & N » ? | Un seul **lien calendrier par foyer**, porté par la connexion Google d'un membre ayant les droits d'écriture. Si elle échoue (révocation), l'autre membre peut reprendre le lien en 1 clic. |
| A3 | Une tâche sans heure doit-elle aller dans Google ? | Oui en **événement « journée entière »** si l'option est cochée ; par défaut, seules les tâches avec heure sont proposées pour le calendrier. |
| A4 | Tâche « personnelle » + calendrier partagé ? | Interdit : une tâche personnelle ne peut pas être synchronisée dans le calendrier partagé (fuite de vie privée). |
| A5 | Qui voit une tâche « À deux » ? | Tous les membres ; les deux responsables peuvent la cocher, une seule coche suffit (option « chacun doit cocher » post‑MVP). |
| A6 | « 2 fois par semaine » (poubelles) | Exprimé comme hebdomadaire sur 2 jours (ex. mardi + vendredi) ; la rotation avance à **chaque occurrence**, pas chaque semaine. Option « avancer par semaine » pour « Semaine 1 → Grace ». |
| A7 | Événement modifié/supprimé directement dans Google | MVP : Google n'est pas maître. Suppression détectée → occurrence marquée « détachée », notification ; pas de suppression automatique de la tâche. |
| A8 | Titre de l'événement Google | `Titre` + responsable en suffixe optionnel (« Nettoyer la salle de bain · Nicolas »), configurable par foyer. |
| A9 | Fuseau horaire | Par foyer (`Europe/Brussels` par défaut) ; chaque utilisateur peut avoir un fuseau d'affichage (post‑MVP). |

## 9. Métriques de succès (usage réel, non compétitives)

- Les deux membres ouvrent l'app ≥ 4 jours/semaine après 1 mois.
- ≥ 80 % des tâches récurrentes créées sont encore actives après 30 jours.
- 0 doublon d'événement Google détecté par la réconciliation.
- Temps médian de création d'une tâche < 10 s.
