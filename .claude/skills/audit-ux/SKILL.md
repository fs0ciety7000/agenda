---
name: audit-ux
description: Audit UI/UX complet de Tandem (site vitrine, app web, app Android) selon docs/audit-ui-ux.md. Captures en clair/sombre, mobile/desktop, trois langues, puis rapport classé par gravité. À utiliser quand l'utilisateur demande un audit, une revue visuelle, ou avant une publication importante.
---

# Audit UI/UX de Tandem

La grille de référence est `docs/audit-ui-ux.md`. Ce skill déroule sa procédure sans en
sauter d'étape.

1. **Préparer**
   - Démarrer PostgreSQL et Redis (`CLAUDE.md`), puis `pnpm build`.
   - Lancer l'API et le web comme pour les E2E.
   - Arrêter les serveurs par leur PID à la fin, jamais avec `pkill -f`.
2. **Capturer**, dans le dossier temporaire de la session (le scratchpad) :
   - **App web** : `VISUAL=1 VISUAL_OUT=<dossier> pnpm exec playwright test visual-review`
     dans `apps/web`. Recommencer avec `VISUAL_LOCALE=en` puis `VISUAL_LOCALE=nl` (comptes créés
     en français, écrans affichés dans la langue), et à 320 px avec
     `-c playwright.narrow.config.ts`. Un écran ajouté à l'app s'ajoute aussi à la liste de
     `e2e/visual-review.spec.ts` et à `e2e/a11y.spec.ts`.
   - **Site vitrine** : `cd apps/site && pnpm build`, servir `out/` (par exemple
     `npx serve out`), puis capturer `/`, `/en/` et `/nl/` à 360, 768 et 1440 px, en clair et
     en sombre (`page.emulateMedia`).
   - **Android** : `./gradlew --offline -Ptandem.codeScanner=false testDebugUnitTest -Pscreenshots` dans `apps/android`.
     Ces captures sont Roborazzi ; pour la police à 200 %, ajouter un test de capture avec
     `fontScale = 2f` s'il n'existe pas.
3. **Regarder chaque capture**, sans s'en tenir aux tests automatiques. Passer les sections 1
   à 7 de la grille : chaque point est OK, À améliorer ou Bloquant, avec le fichier de capture
   qui le montre.
4. **Vérifier ce que les captures ne montrent pas** :
   - l'ordre du focus au clavier, en Playwright avec `Tab` ;
   - les noms accessibles, avec `page.accessibility.snapshot()` ;
   - le contraste des tokens, avec `packages/design-tokens` et un calcul WCAG ;
   - les clés de traduction : comparer les clés de `messages/{fr,en,nl}.json` et les noms de
     `values{,-fr,-nl}/strings.xml`.
5. **Rendre le rapport** :
   - un Artifact si l'utilisateur veut le partager, sinon un fichier
     `docs/audits/AAAA-MM-JJ.md` ;
   - un tableau Gravité · Plateforme · Écran · Constat · Correction proposée · Effort (S, M, L) ;
   - les bloquants d'abord ;
   - les captures citées par leur nom.
6. **Proposer la suite** (et l'inscrire dans le plan de `docs/roadmap.md`, section « Plan UI/UX
   et fonctionnalités ») :
   - corriger les bloquants dans une PR dédiée, en suivant `.claude/workflow.md` ;
   - ajouter le reste à `docs/roadmap.md`, après accord de l'utilisateur.
