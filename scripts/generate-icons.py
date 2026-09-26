#!/usr/bin/env python3
"""Génère les icônes (Android, web) depuis docs/brand/logo-source.png.

Usage : pip install pillow && python3 scripts/generate-icons.py
Le logo source est un carré arrondi sur fond blanc ; on en tire :
- une version « pleine » (coins remplis avec la couleur de fond) pour les icônes que le système
  découpe lui-même (Android adaptatif, iOS, PWA maskable) ;
- une version « découpée » (coins transparents) pour le favicon et l'écran de connexion.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/brand/logo-source.png"


def near_white(p, t=245):
    return all(c >= t for c in p[:3])


def load():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    px = im.load()
    xs = [x for x in range(w) if not near_white(px[x, h // 2])]
    ys = [y for y in range(h) if not near_white(px[w // 2, y])]
    left, right, top, bottom = xs[0], xs[-1], ys[0], ys[-1]
    side = max(right - left, bottom - top) + 1
    crop = im.crop((left, top, left + side, top + side))
    # Rayon des coins : premier pixel coloré sur la diagonale depuis le coin haut-gauche.
    cpx = crop.load()
    d = next(i for i in range(side // 2) if not near_white(cpx[i, i]))
    radius = int(d / (1 - 2 ** -0.5))  # point de la diagonale sur l'arc : r(1 - 1/√2)
    bg = cpx[side // 2, 6]  # fond du carré arrondi (haut, centre)
    # Marge de ~1,5 % : exclut le liseré anti-crénelé du bord d'origine (visible sur fond uni).
    m = max(2, side * 15 // 1000)
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle((m, m, side - 1 - m, side - 1 - m), radius=radius - m, fill=255)
    return crop, mask, bg


def main():
    crop, mask, bg = load()
    side = crop.size[0]
    full = Image.new("RGB", (side, side), bg)
    full.paste(crop, (0, 0), mask)
    rounded = crop.convert("RGBA")
    rounded.putalpha(mask)
    hex_bg = "#%02X%02X%02X" % bg[:3]

    # Android : icône adaptative (108 dp, zone visible garantie 72 dp au centre).
    res = ROOT / "apps/android/app/src/main/res"
    for density, scale in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
        size = int(108 * scale)
        art = int(72 * scale)
        layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        layer.paste(full.resize((art, art), Image.LANCZOS), ((size - art) // 2, (size - art) // 2))
        out = res / f"mipmap-{density}"
        out.mkdir(exist_ok=True)
        layer.save(out / "ic_launcher_foreground.png", optimize=True)
    (res / "values/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<!-- Généré par scripts/generate-icons.py -->\n'
        f'<resources>\n    <color name="ic_launcher_background">{hex_bg}</color>\n</resources>\n'
    )

    # Web (Next.js : conventions app/icon.png et app/apple-icon.png) + PWA + écran de connexion.
    app = ROOT / "apps/web/src/app"
    rounded.resize((256, 256), Image.LANCZOS).save(app / "icon.png", optimize=True)
    full.resize((180, 180), Image.LANCZOS).save(app / "apple-icon.png", optimize=True)
    public = ROOT / "apps/web/public"
    (public / "icons").mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        # « maskable » : contenu dans les 80 % centraux, fond prolongé.
        canvas = Image.new("RGB", (size, size), bg)
        art = int(size * 0.8)
        canvas.paste(full.resize((art, art), Image.LANCZOS), ((size - art) // 2, (size - art) // 2))
        canvas.save(public / f"icons/maskable-{size}.png", optimize=True)
        rounded.resize((size, size), Image.LANCZOS).save(public / f"icons/icon-{size}.png", optimize=True)

    # Écran de connexion Android (72 dp × 3).
    rounded.resize((216, 216), Image.LANCZOS).save(res / "drawable-nodpi/logo.png", optimize=True)

    # Play Store (512, carré plein : Google applique ses propres coins).
    full.resize((512, 512), Image.LANCZOS).save(ROOT / "docs/brand/play-store-icon-512.png", optimize=True)
    print(f"ok — fond {hex_bg}")


if __name__ == "__main__":
    main()
