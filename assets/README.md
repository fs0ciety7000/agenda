# Assets de la vidéo Tandem (motion design, 20 s)

Tout ce que montre la vidéo vient de ce dossier. L'interface n'est jamais redessinée : elle est
recadrée dans de vraies captures, puis animée.

## Inventaire

| Dossier | Contenu | Origine |
| --- | --- | --- |
| `app/` | 5 captures Android 1080 × 2160 : Aujourd'hui, nouvelle tâche (répétition), calendrier, tâches, thème sombre | Test Robolectric `StoreScreenshots` (fiche Play, `apps/android/fastlane/…/fr-FR`) |
| `site/` | Accueil (bureau et mobile), sections Fonctionnalités, Comment ça marche, Confidentialité | Playwright sur le site vitrine (`apps/site`) |
| `brand/` | Icône et logo avec nom (fond transparent), icône 512 | `docs/brand`, `apps/site/public/img` |
| `fonts/` | Inter variable (latin, latin étendu) | Police du site et de l'app (`next/font`) |

Couleurs (`packages/design-tokens`) :

| Rôle | Couleur |
| --- | --- |
| Fond clair | `#FAF6F2` |
| Texte | `#24181D` |
| Texte atténué | `#6F5F66` |
| Accent (prune) | `#7D4460` |
| Accent sombre | `#E0A9C3` |
| Fond sombre | `#141012` |
| Membres | sauge `#5E8C6A`, océan `#3D7EA6`, prune `#7A5C99`, ambre `#B7791F`, argile `#A65D3D` |

## Script (120 BPM, un temps fort par scène)

| Temps | Scène |
| --- | --- |
| 0 – 3 s | **Accroche** : « Encore toi qui fais tout ? », un mot par temps |
| 3 – 6,5 s | **Le produit** : l'écran Aujourd'hui s'assemble bande par bande dans le téléphone |
| 6,5 – 9,5 s | **Cocher** : le curseur coche deux tâches |
| 9,5 – 12,5 s | **Chacun son tour** : clic sur « Chaque semaine » puis « mar. » |
| 12,5 – 15,5 s | **Glisser, déposer** : appui long sur « Sortir les poubelles », dépôt sur le 30 |
| 15,5 – 17,5 s | **Le chiffre** : prêt en 3 minutes (promesse du site) |
| 17,5 – 20 s | **Logo + CTA** : « Commencez gratuitement → » · decouvrir.tandem-agenda.app |

## Fabrication

- `motion/index.html` : la timeline. `window.renderAt(t)` est une fonction pure du temps. Formats `?f=v` (1080 × 1920), `?f=s` (1080 × 1080) et `?f=h` (1920 × 1080).
- `motion/timeline.json` : les scènes et les temps des bruitages, communs à l'image et au son.
- `motion/music.py` : musique originale synthétisée avec numpy (120 BPM, ré mineur), plus les clics d'interface et les whooshes calés sur les temps.
- `motion/render.mjs` : rendu image par image avec Playwright (30 i/s).
- `motion/build.sh` : planche contact, images, musique, puis encodage ffmpeg.

Prérequis : `pip install numpy imageio-ffmpeg`, puis lancer `bash assets/motion/build.sh` depuis la racine du dépôt.

Les vidéos finales sont dans `renders/`. Les versions 16:9 et 1:1 sont aussi publiées sur le site vitrine (`apps/site/public/video`).
