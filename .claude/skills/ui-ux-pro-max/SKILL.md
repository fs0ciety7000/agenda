---
name: ui-ux-pro-max
description: Grille de règles UI/UX (accessibilité, toucher, performance, mise en page, typographie, animation, formulaires, navigation) à passer en concevant ou en relisant un écran de Tandem ou une page du site vitrine. À utiliser pour une maquette, une refonte, une revue de design ou un correctif visuel.
---

<!-- Adapté de nextlevelbuilder/ui-ux-pro-max-skill (MIT, voir LICENSE, commit 9a3f14f) : seules
     les règles en texte sont reprises ; l'outil de recherche (scripts Python et bases CSV) ne
     l'est pas. -->

# UI/UX Pro Max (règles)

Les règles complètes, par catégorie, sont dans `references/quick-reference.md` (en anglais, une
ligne par règle). Les lire au moment de concevoir ou de relire, catégorie par catégorie.

## Ordre de priorité

| Priorité | Catégorie              | Impact   | À vérifier d'abord                                               | À éviter                                     |
| -------- | ---------------------- | -------- | ---------------------------------------------------------------- | -------------------------------------------- |
| 1        | Accessibilité          | critique | contraste 4,5:1, texte alternatif, clavier, noms accessibles     | focus supprimé, bouton-icône sans nom        |
| 2        | Toucher et interaction | critique | cibles 44 × 44 px, 8 px entre deux cibles, retour au chargement  | survol seul, changement d'état instantané    |
| 3        | Performance            | haute    | WebP/AVIF, chargement différé, place réservée (CLS < 0,1)        | décalages de mise en page                    |
| 4        | Choix du style         | haute    | style adapté au produit, cohérence, icônes SVG                   | mélanges de styles, emojis comme icônes      |
| 5        | Mise en page           | haute    | mobile d'abord, pas de défilement horizontal                     | largeurs fixes en px, zoom bloqué            |
| 6        | Typographie et couleur | moyenne  | corps 16 px, interligne 1,5, tokens sémantiques                  | texte < 12 px, gris sur gris, hex en dur     |
| 7        | Animation              | moyenne  | durée adaptée, mouvement qui a un sens, `prefers-reduced-motion` | une seule durée partout, animer width/height |
| 8        | Formulaires            | moyenne  | libellé visible, erreur près du champ                            | libellé en placeholder seul                  |
| 9        | Navigation             | haute    | retour prévisible, 5 onglets au plus, liens profonds             | navigation surchargée                        |
| 10       | Graphiques             | basse    | légende, alternative en texte                                    | couleur seule                                |

## Dans Tandem

Ces règles sont générales. Les documents du dépôt l'emportent toujours :

- `docs/design-system.md` (« Deux fils » : couleurs, Instrument Serif et Sans, rayons, mouvement, ton) ;
- `docs/audit-ui-ux.md` (grille de PR et points bloquants) ;
- les « Décisions prises » de `CLAUDE.md` (couleurs de membres réservées aux pastilles,
  neutralité des chiffres, trois langues).

Exemples d'écarts voulus : la palette, la police et les rayons viennent de `packages/design-tokens`,
pas d'une recherche de style ; le site vitrine vise Lighthouse ≥ 95 dans les quatre catégories,
ce qui exclut les effets lourds (WebGL, vidéo en ouverture) au-dessus de la ligne de flottaison.
