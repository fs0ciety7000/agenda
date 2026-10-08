---
title: Audit UI/UX
description: Grille d'audit de l'interface et de l'expérience (site vitrine, app web, app Android), à passer à chaque changement visible et lors des audits complets.
---

# Audit UI/UX

Deux usages :

- **Contrôle de PR** : chaque changement visible passe les sections 1 à 4 sur les écrans
  touchés, plus la section de sa plateforme (5, 6 ou 7).
- **Audit complet** : toutes les sections, sur tous les écrans, avec captures. Il se fait une
  fois par trimestre ou avant une publication importante. Le skill `audit-ux` déroule la
  procédure (`.claude/skills/audit-ux/SKILL.md`).

Chaque point se note **OK**, **À améliorer** ou **Bloquant**, accompagné d'une capture et d'une
proposition de correction. Un point **Bloquant** empêche la fusion.

Sont bloquants :
- un contraste insuffisant ;
- une action impossible au clavier ou avec un lecteur d'écran ;
- un texte coupé ou un débordement horizontal ;
- une donnée perdue ;
- une clé de traduction manquante ou affichée telle quelle.

## Matrice de captures

| Plateforme | Formats | Thèmes | Langues |
|---|---|---|---|
| App web | mobile (Pixel 7, 412 px), desktop (1280 px), plus 320 px pour les débordements | clair, sombre | fr, en, nl |
| Site vitrine | 360 px, 768 px, 1440 px | clair, sombre | fr, en, nl |
| Android | téléphone (Pixel 7), petit écran (360 dp), police système à 200 % | clair, sombre | fr, en, nl |

Le néerlandais est en moyenne 20 à 30 % plus long que le français : c'est la langue qui révèle
les boutons trop étroits et les titres qui débordent.

## 1. Hiérarchie et clarté

- [ ] Ce qu'on attend de l'utilisateur sur l'écran se voit en moins de 3 secondes : une action
  principale et une seule.
- [ ] Le titre de page dit où l'on est ; la navigation montre l'onglet actif.
- [ ] Les informations secondaires (méta, dates, auteurs) sont en `text-muted`, plus petites,
  et ne concurrencent pas le contenu.
- [ ] Les écrans, fonctions ou réglages ne restent pas introuvables. Pour chacun, noter le
  chemin pour y arriver depuis Aujourd'hui (exemple : Repas, accessible seulement depuis
  Courses sur mobile).
- [ ] Les libellés sont cohérents d'un écran à l'autre et d'une plateforme à l'autre : même mot
  pour la même chose sur le web et sur Android.

## 2. États

Pour chaque liste et chaque formulaire, vérifier :

- [ ] **Vide** : une phrase et une action (`EmptyState`), jamais un écran blanc.
- [ ] **Chargement** : un squelette de la forme du contenu, pas de spinner plein écran, pas de
  saut de mise en page à l'arrivée des données.
- [ ] **Erreur** : une phrase humaine et « Réessayer », jamais de code ni de trace.
- [ ] **Hors ligne** : le bandeau s'affiche ; une action faite hors ligne se voit tout de suite
  et part au retour du réseau, ou bien l'interface dit clairement qu'elle demande une connexion.
- [ ] **Succès** : un retour discret (toast), avec « Annuler » pour les actions destructives ou
  massives.
- [ ] **Conflit** : modifié par l'autre entre-temps, la dernière version s'affiche et un message
  le dit.
- [ ] **Longueurs extrêmes** : titre de 120 caractères, liste de 200 éléments, nom de membre
  long, aucun élément.

## 3. Accessibilité (WCAG 2.2 AA)

- [ ] Contraste du texte d'au moins 4,5:1 et des éléments d'interface d'au moins 3:1, dans les
  deux thèmes. Vérifier les tokens, pas des couleurs codées en dur.
- [ ] Clavier (web) : tout est atteignable dans un ordre logique, le focus est toujours visible,
  `Échap` ferme les dialogues, le focus est piégé dans les modales puis rendu à l'élément
  d'origine.
- [ ] Lecteur d'écran :
  - noms accessibles sur les boutons-icônes ;
  - états annoncés (coché, développé, sélectionné) ;
  - `aria-live` pour les toasts et la synchronisation.

  Sur Android, `contentDescription`, `stateDescription` et les actions personnalisées pour le
  glisser-déposer.
- [ ] Cibles tactiles d'au moins 44 px (web) et 48 dp (Android), avec un espacement suffisant
  entre deux cibles.
- [ ] L'information ne passe jamais par la couleur seule : responsable = couleur + initiale,
  statut = icône + texte.
- [ ] `prefers-reduced-motion` et le réglage Android « Supprimer les animations » sont
  respectés.
- [ ] Les formulaires ont des libellés visibles, des erreurs liées au champ (`aria-describedby`)
  et un focus placé sur la première erreur.

## 4. Contenu et langues

- [ ] Aucune clé de traduction affichée telle quelle ; mêmes clés dans `fr`, `en` et `nl`.
- [ ] Ton : vouvoiement en français, tutoiement « je » en néerlandais, phrases courtes, pas de
  culpabilisation (« 2 tâches à rattraper »).
- [ ] Pluriels corrects : 0, 1 et plusieurs, dans les trois langues.
- [ ] Les dates, heures, montants et nombres passent par l'API `Intl` ou la locale Android,
  jamais par une concaténation : `30 sept.` en français, `30 sep.` en néerlandais.
- [ ] Les textes longs passent à la ligne au lieu d'être tronqués sans `title` ni accès au
  texte complet.

## 5. App web (`apps/web`)

- [ ] 320 px : aucun défilement horizontal ; la barre d'onglets du bas ne masque pas de contenu
  (`pb` suffisant, zone sûre iPhone).
- [ ] Desktop : largeur de lecture limitée (`max-w-3xl` pour les listes), calendrier en pleine
  largeur.
- [ ] Raccourcis clavier : `N` pour une nouvelle tâche, `/` pour la recherche, `T` pour
  aujourd'hui ; ils ne se déclenchent pas pendant la saisie.
- [ ] Mises à jour optimistes : cocher, ajouter ou supprimer réagit en moins de 100 ms ; un
  échec revient en arrière avec un message.
- [ ] Performance perçue :
  - Lighthouse mobile ≥ 90 en performance et en accessibilité sur `/login` et `/` ;
  - pas de changement de mise en page visible (CLS < 0,1) ;
  - images dimensionnées.
- [ ] PWA : icône, nom et couleur de thème corrects ; le mode hors ligne affiche les dernières
  données.

## 6. Site vitrine (`apps/site`)

- [ ] La promesse se comprend au-dessus de la ligne de flottaison sur mobile, avec l'appel à
  l'action principal visible.
- [ ] Lighthouse ≥ 95 dans les quatre catégories ; LCP < 2,5 s en 4G ; la vidéo n'est pas
  chargée avant d'être visible.
- [ ] SEO :
  - `title` et `description` propres à chaque langue ;
  - `hreflang` vers les trois langues et `canonical` ;
  - image Open Graph ;
  - `sitemap.xml` à jour.
- [ ] Le sélecteur de langue est visible sur mobile et le choix est mémorisé. La redirection
  nginx selon la langue du navigateur ne crée pas de boucle.
- [ ] Animations : désactivées avec `prefers-reduced-motion`, et pas de contenu caché si le
  JavaScript échoue.
- [ ] Liens : « Ouvrir Tandem », Android, confidentialité et statut fonctionnent, sans lien mort.

## 7. App Android (`apps/android`)

- [ ] Police système à 200 % : pas de texte coupé, les lignes de tâche passent à la ligne, les
  boutons restent utilisables.
- [ ] Edge-to-edge : rien sous la barre d'état ni sous la barre de gestes ; le clavier ne masque
  pas le champ actif (`imePadding`).
- [ ] Retour : le geste ferme d'abord la feuille ou le dialogue ouvert, puis revient à l'écran
  précédent.
- [ ] TalkBack :
  - ordre de lecture logique ;
  - cases de tâche annoncées avec leur état ;
  - actions personnalisées (cocher, reporter, déplacer) ;
  - titres marqués `heading()`.
- [ ] Hors ligne : chaque action en un geste fonctionne en mode avion et apparaît sur le web
  après la reconnexion.
- [ ] Widgets : lisibles en clair et en sombre, mis à jour après une action dans l'app, et
  « Se connecter » s'affiche après une déconnexion.
- [ ] Notifications : canaux nommés et désactivables séparément ; les actions (Fait, Demain)
  fonctionnent écran verrouillé.
- [ ] Rotation et tablette : pas de perte de saisie, mise en page qui ne s'étire pas sur 1 200 dp.
- [ ] Démarrage à froid en moins de 1,5 s sur un téléphone moyen ; défilement fluide des listes
  (`key` sur les éléments `LazyColumn`).

## Procédure d'un audit complet

1. **Captures web** (API et web démarrés, voir `CLAUDE.md`) :
   ```bash
   cd apps/web
   VISUAL=1 VISUAL_OUT=/tmp/shots pnpm exec playwright test visual-review
   ```
   À relancer avec `locale` en `en-GB` et `nl-BE` pour les autres langues.
2. **Captures Android** :
   ```bash
   cd apps/android
   ./gradlew testDebugUnitTest -Pscreenshots
   ```
   Les images vont dans `docs/screenshots/android` ; les captures de la fiche Play se font avec
   `--tests '*StoreScreenshots*'`.
3. **Site vitrine** : `cd apps/site && pnpm build`, puis servir `out/` et capturer les trois
   largeurs.
4. **Grille** : passer chaque écran dans les sections 1 à 7, puis noter chaque point (OK, À
   améliorer, Bloquant) avec sa capture.
5. **Rapport** :
   - les points classés par gravité, avec la correction proposée et l'effort estimé (S, M, L) ;
   - les bloquants sont corrigés tout de suite, dans une PR dédiée ;
   - le reste va dans `docs/roadmap.md`.
