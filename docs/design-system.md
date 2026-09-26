# Design system — « Calme »

> Sobre, premium, minimaliste. Pas de rose partout, pas de cœurs, pas de gamification.
> Source des valeurs : `packages/design-tokens` (génère les variables CSS du web et `Tokens.kt` pour Android).

## 1. Principes

1. **Aujourd'hui d'abord** — la hiérarchie visuelle sert l'action immédiate.
2. **Le contenu est l'interface** — peu de chrome, beaucoup d'espace, lignes fines.
3. **Couleur = sens** — la couleur n'est jamais décorative : responsable, priorité, état.
4. **Rapide au doigt et au clavier** — cibles ≥ 44 px (web) / 48 dp (Android), raccourcis (`N` nouvelle tâche, `/` recherche, `T` aujourd'hui).
5. **Neutre sur la répartition** — les chiffres informent, ne classent pas (pas de podium, pas de « gagnant », même couleur neutre pour les deux barres de répartition, libellés factuels).

## 2. Couleurs

Neutres légèrement chauds (évite le gris « bureautique »), un accent encre, des couleurs de
membres désaturées. Toutes les paires texte/fond respectent **4.5:1** (texte) et **3:1** (UI).

| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg` | `#FBFAF8` | `#111110` | Fond d'app |
| `surface` | `#FFFFFF` | `#1A1A18` | Cartes, feuilles |
| `surface-muted` | `#F3F2EF` | `#222220` | Zones secondaires, hover |
| `border` | `#E6E4DF` | `#2E2D2A` | Séparateurs |
| `text` | `#1C1B19` | `#EDECE9` | Texte principal |
| `text-muted` | `#6B6862` | `#A3A09A` | Métadonnées |
| `accent` | `#3552C9` | `#8EA2F2` | Actions primaires, focus, liens |
| `accent-fg` | `#FFFFFF` | `#0E1330` | Texte sur accent |
| `success` | `#2F7D4F` | `#6FCF97` | Terminé, synchronisé |
| `warning` | `#9A6400` | `#F2C46D` | En retard, sync en attente |
| `danger` | `#B3261E` | `#F28B82` | Erreurs, suppression |

**Couleurs de membres** (attribuées à l'arrivée dans le foyer, modifiables) :
`sage #5E8C6A`, `ocean #3D7EA6`, `amber #B7791F`, `plum #7A5C99`, `clay #A65D3D`, `slate #5B6770`
(variantes dark éclaircies de ~25 %). « À deux » = pastille bicolore ; « À définir » = contour pointillé neutre.

**Priorité** : pas de rouge vif. `low` = rien, `normal` = rien, `high` = petit chevron `warning`, `urgent` = chevron `danger`.

## 3. Typographie

- **Inter** (variable, `font-feature-settings: "cv11", "ss01"`, chiffres tabulaires pour les heures).
- Échelle (rem, base 16) : `display 2.0/1.15 semibold` (« Bonjour Grace »), `title 1.25/1.3 semibold`, `headline 1.0625/1.4 medium`, `body 0.9375/1.5 regular`, `caption 0.8125/1.4 regular`, `overline 0.75 medium uppercase +4 % tracking`.
- Android : même échelle en `sp`, respect du réglage de taille système.

## 4. Espacement, rayons, ombres, mouvement

- Grille **4 px** : `0.5=2, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`.
- Rayons : `sm 6`, `md 10` (inputs, boutons), `lg 14` (cartes), `xl 20` (sheets), `full`.
- Ombres (light uniquement, dark = bordures) : `sm 0 1px 2px rgb(0 0 0 / .05)`, `md 0 4px 12px rgb(0 0 0 / .06)`, `lg 0 12px 32px rgb(0 0 0 / .10)`.
- Mouvement : `fast 120 ms`, `base 180 ms`, `slow 260 ms`, courbe `cubic-bezier(.2,.8,.2,1)`. Respect de `prefers-reduced-motion` (animations remplacées par fondus instantanés).

## 5. Composants (web : `apps/web/src/components/ui`, Android : `ui/components`)

| Composant | Variantes / règles |
|---|---|
| **Button** | `primary`, `secondary`, `ghost`, `danger` ; tailles `sm/md/lg` ; état `loading` (spinner + label conservé pour lecteurs d'écran) |
| **IconButton** | `aria-label` obligatoire (typé requis) |
| **Input / Textarea** | label visible toujours, aide + erreur liées par `aria-describedby` |
| **Select / Dropdown** | Radix (web), `ExposedDropdownMenu` (Android) |
| **SegmentedControl** | Choix du responsable : Grace · Nicolas · Nous deux · À définir |
| **Checkbox de tâche** | cercle 22 px, cible 44 px ; coche animée 180 ms ; annulation possible 5 s (toast « Annuler ») |
| **Dialog** | desktop ; confirmation destructive |
| **Sheet** | mobile (bas d'écran) — formulaire de création, choix « cette occurrence / les suivantes / toute la série » |
| **Card** | `surface`, bordure 1 px, rayon `lg`, pas d'ombre par défaut |
| **Badge** | catégorie (emoji + nom), statut sync (✓ / ⟳ / ⚠ / ✕), priorité |
| **Avatar membre** | initiale sur couleur de membre ; bicolore « à deux » |
| **TaskRow** | case · titre · méta (responsable, heure, catégorie, récurrence ↻) ; swipe (Android) : cocher / reporter |
| **Calendar** | `DayView`, `WeekView` (blocs temporels positionnés sur grille de 15 min), `MonthView` (pastilles) ; drag & resize (web, Phase 6) |
| **EmptyState** | illustration linéaire monochrome + une phrase + une action (« Rien pour aujourd'hui. Profitez-en. ») |
| **Skeleton** | chargement : formes des lignes, pas de spinner plein écran |
| **ErrorState** | phrase humaine + action (« Réessayer ») ; jamais de stack trace ou code brut |
| **Toast** | succès discret, annulation ; `role="status"` |
| **SyncIndicator** | ✓ Synchronisé · ⟳ Synchronisation… · ⚠ En attente · ✕ Action requise |

## 6. Icônes

**Lucide** (web) / **Material Symbols Rounded** poids 300 (Android) — trait fin, 20 px, couleur
`text-muted` par défaut. Les emojis ne sont utilisés que pour les catégories (choix utilisateur).

## 7. Layout

- Mobile (< 768) : barre d'onglets en bas (Aujourd'hui · Tâches · Calendrier · Réglages), bouton flottant « + ».
- Tablette (768–1199) : rail de navigation latéral compact.
- Desktop (≥ 1200) : sidebar 240 px + contenu max 960 px (listes) / pleine largeur (calendrier) ; quick add toujours visible en haut.

## 8. Accessibilité (WCAG 2.2 AA)

- Focus visible 2 px `accent` + offset 2 px, jamais supprimé.
- Navigation clavier complète ; ordre logique ; `Esc` ferme dialogs/sheets ; piège de focus dans les modales.
- Pas d'information portée par la couleur seule (responsable = couleur **+** initiale/nom ; statut = icône **+** texte).
- Cibles ≥ 24×24 CSS px minimum (2.5.8), 44 px visé.
- Annonces `aria-live` pour cocher/annuler et statut de synchronisation.
- Android : `contentDescription`, `semantics { stateDescription }` sur la case de tâche, TalkBack testé.

## 9. Voix & ton (FR)

Tutoiement ? **Non** — vouvoiement collectif chaleureux (« Organisons votre quotidien ensemble »),
phrases courtes, pas de culpabilisation (« 2 tâches à rattraper » plutôt que « 2 tâches en retard ! »).
