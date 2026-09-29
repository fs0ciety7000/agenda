#!/usr/bin/env bash
# Fabrique la vidéo Tandem : planche contact, images (3 formats), musique, encodage.
# Depuis la racine du dépôt : bash assets/motion/build.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
A="$ROOT/assets"
FFMPEG=$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')

# Playwright est installé dans l'app web du monorepo.
(cd "$ROOT/apps/web" && node "$A/motion/render.mjs" sheet)
python3 "$A/motion/music.py"
for f in v s h; do (cd "$ROOT/apps/web" && node "$A/motion/render.mjs" frames "$f"); done

mkdir -p "$A/renders" "$ROOT/apps/site/public/video"
declare -A NAME=([v]=9x16 [s]=1x1 [h]=16x9)
for f in v s h; do
  out="$A/renders/tandem-${NAME[$f]}.mp4"
  "$FFMPEG" -y -loglevel error -framerate 30 -i "$A/out/frames-$f/%04d.png" -i "$A/out/music.wav" \
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -profile:v high -movflags +faststart \
    -c:a aac -b:a 192k -shortest "$out"
done

# Site vitrine : 16:9 (bureau) et 1:1 (mobile), plus légers, avec affiche.
for f in h s; do
  n=${NAME[$f]}
  "$FFMPEG" -y -loglevel error -i "$A/renders/tandem-$n.mp4" \
    -vf "scale='if(gt(iw,ih),1280,960)':-2" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
    -movflags +faststart -c:a aac -b:a 128k "$ROOT/apps/site/public/video/tandem-$n.mp4"
  "$FFMPEG" -y -loglevel error -ss 19.4 -i "$A/renders/tandem-$n.mp4" -frames:v 1 \
    -vf "scale='if(gt(iw,ih),1280,960)':-2" -q:v 4 "$ROOT/apps/site/public/video/tandem-$n.jpg"
done
ls -la "$A/renders" "$ROOT/apps/site/public/video"
