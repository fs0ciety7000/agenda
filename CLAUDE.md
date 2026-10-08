# Tandem : instructions pour Claude

Tandem est l'agenda partagé d'un foyer (tâches, répétitions à tour de rôle, courses, repas,
calendrier). Ce fichier et ceux qu'il importe s'appliquent à **chaque** session et à **chaque**
modification. Les relire avant de commencer ; en cas de doute, ils l'emportent sur les habitudes.

Fichiers importés, à respecter au même titre que celui-ci :

- @.claude/workflow.md : déroulé d'une demande, de la lecture à la fusion, et contrôles à lancer.
- @docs/contribuer.md : conventions, CI, et ce qu'il faut mettre à jour dans la même PR.
- @docs/design-system.md : couleurs, typographie, composants, accessibilité, ton.
- @docs/audit-ui-ux.md : grille d'audit UI/UX (site, app web, app Android), passée à chaque
  changement visible.

## Plan et suivi

- Le plan vivant est la section **« Plan UI/UX et fonctionnalités »** de `docs/roadmap.md` :
  le lire au début de chaque demande pour situer le travail.
- Chaque PR coche ses tâches dans ce plan (avec son numéro) et y ajoute celles qu'elle découvre
  (bug, dette, idée de l'utilisateur). Une demande hors plan y entre d'abord, dans le bon lot.
- Les audits sont rangés dans `docs/audits/AAAA-MM-JJ.md` ; leurs bloquants se corrigent dans la
  même PR, le reste va dans le plan.
- Les décisions qui engagent la suite sont notées ci-dessous (une ligne, avec la PR).
- **Un lot ou une tâche « à prioriser ensemble » ne se code pas sans accord** : proposer, puis
  attendre que l'utilisateur choisisse quoi et dans quel ordre. « Go lot N » sur un tel lot veut
  dire « discutons-en », pas « code tout ».

## Décisions prises

- Mobile : cinq onglets au plus ; le dernier est **Plus** (pages du foyer, puis réglages), sur le
  web comme sur Android (#86, #87).
- Les couleurs de membres ne servent qu'aux pastilles ; graphiques et jauges sont neutres (#88).
- Texte sur une couleur pleine : tokens `on-member` ou `surface`, jamais de blanc codé en dur (#88).
- Retard : « À rattraper », couleur `warning` ; `danger` réservé aux erreurs et à l'urgent (#88).
- Dépenses : montants en centimes entiers, parts figées à l'enregistrement (#86).

## Règles permanentes

- **Répondre en français** à l'utilisateur, sans jargon inutile.
- **Dépôt** : monorepo pnpm + turbo.
  - `apps/api` : NestJS, Prisma, PostgreSQL, BullMQ/Redis.
  - `apps/web` : Next 15, next-intl, TanStack Query, Tailwind 4.
  - `apps/site` : site vitrine, export statique servi par nginx.
  - `apps/android` : Kotlin, Compose, Room, Retrofit.
  - `apps/docs` : Docusaurus, contenu dans `docs/`.
  - `packages/contracts` (schémas Zod), `packages/domain` (récurrence, ajout rapide),
    `packages/design-tokens`.
- **Trois langues partout** : français (vouvoiement), anglais, néerlandais (tutoiement « je »).
  Un texte visible ajouté ou modifié l'est dans les trois, dans chacun de ces endroits :
  - app web : `apps/web/messages/{fr,en,nl}.json`, mêmes clés dans les trois fichiers ;
  - Android : `res/values` (anglais par défaut), `values-fr`, `values-nl` ;
  - e-mails : `apps/api/src/mail/templates.ts` ;
  - notifications : `webPushText` côté API ;
  - site vitrine : `apps/site/src/lib/content.ts` ;
  - fiche Play : `fastlane/metadata/android/{fr-FR,en-US,nl-NL}`.

  Une langue de navigateur ou de téléphone non prise en charge affiche l'anglais.

- **Sécurité, jamais dans le dépôt ni dans une conversation** :
  - secrets, clés, jetons, keystores ;
  - fichiers de compte de service (Firebase, Google Play) ;
  - identifiants de démonstration ;
  - secret client Google ;
  - adresse e-mail personnelle de l'utilisateur.

  La clé privée Firebase et la clé privée VAPID ne vont jamais dans un fichier ni dans les
  journaux. Les variables secrètes dans Coolify ont _Available at Buildtime_ décoché. Les
  fausses valeurs de secret en CI sont à faible entropie, sinon GitGuardian les signale.

- **Données personnelles** : toute nouvelle donnée collectée met à jour `docs/rgpd.md`, la
  politique en ligne (`privacyPolicy` dans les trois `messages/*.json`), l'export RGPD et la
  suppression de compte (`apps/api/src/privacy/privacy.service.ts`).
- **Neutralité** : les chiffres de répartition, et demain d'argent, informent sans classer. Pas
  de « gagnant », pas de culpabilisation (cf. design system, §1 et §9).

## Environnement de développement (conteneur)

- Services : `service postgresql start` puis `redis-server --daemonize yes`.
- Ne **jamais** lancer `pkill -f …` : la commande tue le shell de la session. Arrêter un
  serveur par son PID (`ps aux | grep …`, puis `kill <pid>`).
- Pas de chaînes de `sleep` : attendre une condition, par exemple une boucle `curl` bornée.
- E2E web :
  1. `pnpm build`.
  2. API : `cd apps/api && (set -a; . ./.env; set +a; NODE_ENV=production AUTH_RATE_LIMIT=100 GLOBAL_RATE_LIMIT=100000 COOKIE_SECURE=false WEB_ORIGIN=http://localhost:3000 node dist/main.js &)`.
  3. Web : `cd apps/web && API_URL=http://localhost:4000 pnpm start &`.
  4. `pnpm exec playwright test` (projets desktop et mobile).
- Android hors ligne : `./gradlew --offline -q lintDebug testDebugUnitTest`.
