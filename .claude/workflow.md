# Déroulé d'une demande

À suivre pour chaque demande, petite ou grande. Les étapes 1 à 6 se font avant de pousser.

## 1. Comprendre

- Relire `CLAUDE.md` et les fichiers qu'il importe.
- Lire le code concerné avant de le modifier : les contrats (`packages/contracts`), le service
  API, la page web et l'écran Android. Une fonction existe souvent déjà à moitié.
- Si la demande est ambiguë sur un point qui change ce qu'on construit, poser la question. Sinon
  choisir l'option la plus simple et le dire dans le compte rendu.

## 2. Concevoir

- **Contrats d'abord** : le schéma Zod dans `packages/contracts`, puis le modèle Prisma
  (migration générée par `prisma migrate diff`, jamais écrite à la main), puis l'API, puis le
  web, puis Android.
- **Parité web / Android** : une fonction visible existe sur les deux, ou la PR dit pourquoi
  (« sur le site seulement », avec un lien depuis l'app).
- **Hors ligne** : sur Android, tout ce qui se fait en un geste passe par l'outbox (Room +
  WorkManager) ; sur le web, par la file d'envoi du service worker. Une modification de schéma
  Room ajoute une migration et le schéma JSON exporté.
- **Temps réel** : une donnée partagée publie un sujet SSE (`RealtimeTopic`) ; web et Android
  rechargent la clé correspondante.
- **Sécurité** : chaque route vérifie l'appartenance au foyer et la visibilité (tâches
  personnelles), valide les entrées avec Zod et limite le débit des routes publiques. Aucune
  donnée d'un autre foyer ne doit être accessible, même par un identifiant deviné.

## 3. Réaliser

- Suivre le style du code voisin : commentaires en français, identifiants en anglais, même
  densité de commentaires.
- Textes : les trois langues (voir `CLAUDE.md`), sans clé manquante ; pluriels ICU côté web,
  `plurals` côté Android.
- Composants du design system uniquement (`apps/web/src/components/ui`, `ui/components` sur
  Android). Pas de couleur, d'espacement ou de rayon codés en dur hors des tokens.

## 4. Tester

| Zone touchée                  | Commandes                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Partout                       | `pnpm exec prettier --check .` et `pnpm exec turbo run lint typecheck` (tous les paquets, comme la CI)                 |
| `packages/*`                  | `pnpm --filter <paquet> lint && pnpm --filter <paquet> test`, puis `pnpm build` (les applications importent le build)  |
| API                           | `cd apps/api && pnpm lint && pnpm exec tsc --noEmit && pnpm exec vitest run` (après `npx prisma migrate deploy`)       |
| Route API ajoutée ou modifiée | `pnpm --filter @agenda/api build && pnpm --filter @agenda/api openapi` (la CI compare `apps/docs/static/openapi.json`) |
| Web                           | `cd apps/web && pnpm lint && pnpm exec tsc --noEmit && pnpm test`, puis les E2E (`CLAUDE.md`)                          |
| Site vitrine                  | `cd apps/site && pnpm lint && pnpm exec tsc --noEmit && pnpm build`                                                    |
| Android                       | `cd apps/android && ./gradlew --offline -q lintDebug testDebugUnitTest`                                                |

- Chaque fonction ajoute ses tests :
  - un test d'intégration API (`apps/api/test/*.int.test.ts`), droits d'accès compris ;
  - un parcours E2E web s'il y a une interface ;
  - un test unitaire Android pour la logique locale.
- Une correction commence par reproduire l'échec, puis montre le même test qui passe.
- Ne jamais désactiver, sauter ou affaiblir un test pour obtenir du vert.

## 5. Auditer (changement visible)

Passer la grille de [`docs/audit-ui-ux.md`](../docs/audit-ui-ux.md) sur les écrans touchés :

- clair et sombre ;
- mobile et desktop ;
- les trois langues ;
- états vide, chargement, erreur et hors ligne.

Pour un audit complet de l'application : le skill `audit-ux` (`.claude/skills/audit-ux`).

## 6. Documenter

Dans la même PR (tableau détaillé dans `docs/contribuer.md`) :

- le guide utilisateur `docs/guide/` ;
- l'entrée « Nouveautés » `docs/changelog.md` ;
- la doc technique concernée (`docs/android.md`, `docs/deployment.md`, `docs/rgpd.md`…) ;
- les notes Play `fastlane/metadata/android/*/changelogs/default.txt` si l'app Android change.

## 7. Livrer

- Branche de travail : celle indiquée par la session (`claude/…`), créée depuis `main` à jour.
- Commit au message clair en français, avec les lignes d'attribution demandées par la session.
- Pousser, ouvrir la PR (titre et corps en français : contenu, à faire hors code,
  vérifications), s'abonner à son activité et programmer une vérification dans environ 1 h.
- Mener la PR au vert : corriger chaque échec de CI à la racine, répondre à chaque commentaire
  de relecture. Une PR rouge n'attend jamais la relecture.
- **Après la fusion** :
  1. `git fetch origin main && git checkout -B <branche> origin/main && git push -u origin <branche> --force-with-lease` ;
  2. supprimer la vérification programmée ;
  3. dire en une phrase ce que l'utilisateur doit encore faire hors code (variables Coolify,
     Play Console…).

## 8. Rendre compte

Un compte rendu court en français :

- ce qui a été fait, et le lien de la PR ;
- ce qui a été vérifié, et comment ;
- ce qui reste à faire par l'utilisateur ;
- ce qui n'a pas été fait, et pourquoi.

Ne jamais présenter comme vérifié ce qui ne l'a pas été.
