# Design system — « Duo »

> Premium, épuré, dynamique : blanc franc, gris neutres, une seule couleur d'action au choix
> (quatre thèmes), le contenu d'abord et l'action à portée du pouce. Pas de gamification.
> Maquettes de la refonte : tableau « Tandem · Refonte de l'app » (octobre 2026).
> Source des valeurs : `packages/design-tokens` (génère les variables CSS du web et `Tokens.kt` pour Android).

## 1. Principes

1. **Aujourd'hui d'abord** — la hiérarchie visuelle sert l'action immédiate.
2. **Le contenu est l'interface** — peu de chrome, beaucoup d'espace, lignes fines.
3. **Couleur = sens** — la couleur n'est jamais décorative : responsable, priorité, état.
4. **Rapide au doigt et au clavier** — cibles ≥ 44 px (web) / 48 dp (Android), raccourcis (`N` nouvelle tâche, `/` recherche, `T` aujourd'hui).
5. **Neutre sur la répartition** — les chiffres informent, ne classent pas (pas de podium, pas de « gagnant », même couleur neutre pour les deux barres de répartition, libellés factuels).

## 2. Couleurs

Fond blanc franc, gris neutres froids, texte presque noir. Une seule couleur porte l'action
(boutons principaux, liens, focus, case cochée) : celle du **thème** choisi dans Réglages →
Apparence → Couleur. Toutes les paires texte/fond respectent **4.5:1** (texte) et **3:1** (UI),
vérifiées sur `bg`, `surface` et `surface-muted`, pour chaque thème et dans les deux modes.

| Token | Clair | Sombre | Usage |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#0F1012` | Fond d'app |
| `surface` | `#FFFFFF` | `#18191C` | Cartes, feuilles |
| `surface-muted` | `#F3F4F6` | `#222327` | Zones secondaires, tuiles, puces |
| `border` | `#E5E7EB` | `#2E3035` | Séparateurs |
| `border-strong` | `#80848C` | `#70747C` | Champs, cases (≥ 3:1) |
| `text` | `#17181C` | `#F2F3F5` | Texte principal |
| `text-muted` | `#5F636B` | `#A6AAB2` | Métadonnées |
| `accent` / `accent-fg` | selon le thème | selon le thème | Action, focus, liens |
| `success` | `#1F7A50` | `#6FD39F` | Terminé, synchronisé |
| `warning` | `#8A5A00` | `#F2C46D` | À rattraper, sync en attente |
| `danger` | `#B42318` | `#F59088` | Erreurs, suppression |

**Thèmes** (`themes` dans `tokens.json`, `data-accent` sur `<html>` côté web, réglage gardé sur
l'appareil) :

| Thème | Clair (texte blanc) | Sombre |
|---|---|---|
| Encre (par défaut) | `#17181C` | `#F2F3F5` |
| Corail | `#C4314B` | `#FF8C98` |
| Océan | `#1D5BD8` | `#8DB6FF` |
| Lagune | `#0B6E6E` | `#6FD3CF` |

**Couleurs de membres** : inchangées, pastilles seulement ; graphiques et jauges restent
neutres (§1.5). L'initiale d'une pastille utilise `on-member`. **Texte sur une couleur pleine**
(`success`, `danger`) : `surface`, jamais du blanc codé en dur.

**Priorité** : pas de rouge vif. `high` = petit chevron `warning`, `urgent` = chevron `danger`.

## 3. Typographie

- **Instrument Sans**, une seule famille (web : `next/font`, Android : `res/font`, licence OFL
  dans `assets/licenses`), chiffres tabulaires pour les heures et les montants.
- Quatre tailles, deux graisses (400, 600 ; 500 pour les libellés) : `display 2.0/1.1 semibold`
  (« Bonjour Emma »), `title 1.25/1.25 semibold` (titres de section, en casse de phrase, jamais
  en capitales), `body 1.0/1.5 regular`, `caption 0.8125/1.4 medium`.
- Android : même échelle en `sp`, respect du réglage de taille système.

## 4. Espacement, rayons, ombres, mouvement

- Grille **4 px** : `0.5=2, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`.
- Rayons : `sm 8`, `md 12` (champs), `lg 20` (cartes, tuiles), `xl 28` (feuilles), `full`
  (boutons, puces, barre d'ajout).
- Listes à plat sur le fond, séparateurs fins ; seules les cartes « vivantes » (courses en
  cours, résumé) sont surélevées : ombre douce teintée `0 12px 32px rgb(23 24 28 / .10)` (`shadow-raised` sur le web, élévation
  6 à 8 dp sur Android), comme la barre « Qu'est-ce qu'on fait ? ».
- Mouvement : `fast 120 ms`, `base 180 ms`, `slow 260 ms`, courbe `cubic-bezier(.2,.8,.2,1)` ;
  ressort pour les feuilles. La coche « pop » (0,8 → 1,15 → 1), la ligne faite glisse vers
  « Fait », la feuille monte avec un léger rebond, « Journée bouclée » une seule fois.
  Respect de `prefers-reduced-motion` et de « Supprimer les animations » (fondus de 120 ms).

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
| **EmptyState** | illustration linéaire monochrome (accent, disque de fond à 8 %) + une phrase + une action (« Rien pour aujourd'hui. Profitez-en. »). Tracés dans `packages/design-tokens/illustrations.json` (viewBox 120×96, trait 1,75), générés pour le web (`Illustration`) et Android (`ill_empty_*`) : Aujourd'hui, Courses, Menus, Dépenses, Notes, Dates |
| **Skeleton** | chargement : formes des lignes, pas de spinner plein écran |
| **ErrorState** | phrase humaine + action (« Réessayer ») ; jamais de stack trace ou code brut |
| **Toast** | succès discret, annulation ; `role="status"` |
| **SyncIndicator** | ✓ Synchronisé · ⟳ Synchronisation… · ⚠ En attente · ✕ Action requise |

## 6. Icônes

**Lucide** (web) / **Material Symbols Rounded** poids 300 (Android) — trait fin, 20 px, couleur
`text-muted` par défaut. Les emojis ne sont utilisés que pour les catégories (choix utilisateur).

## 7. Layout

- Mobile (< 768) : barre d'onglets en bas, cinq au plus (Aujourd'hui · Tâches · Courses · Calendrier · Plus), bouton flottant « + ». **Plus** ouvre un tiroir (feuille du bas, grille de tuiles icône + nom) avec toutes les autres pages, Réglages en dernier ; tirer la barre vers le haut l'ouvre aussi (poignée visible au-dessus de la barre). Le geste a toujours le bouton pour équivalent.
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

Néerlandais : **tutoiement** (« je »), ton direct et chaleureux. Anglais : « you », simple.

Français : tutoiement ? **Non** — vouvoiement collectif chaleureux (« Organisons votre quotidien ensemble »),
phrases courtes, pas de culpabilisation (« 2 tâches à rattraper » plutôt que « 2 tâches en retard ! »).
