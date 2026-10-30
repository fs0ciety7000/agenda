#!/usr/bin/env python3
"""Génère les icônes (Android, web) depuis docs/brand/logo-source.png.

Usage : pip install pillow && python3 scripts/generate-icons.py
        (`--play` : seulement l'icône et la bannière de la fiche Google Play)
Le logo source est un carré arrondi sur fond blanc ; on en tire :
- une version « pleine » (coins remplis avec la couleur de fond) pour les icônes que le système
  découpe lui-même (Android adaptatif, iOS, PWA maskable) ;
- une version « découpée » (coins transparents) pour le favicon et l'écran de connexion.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs/brand/logo-source.png"
FASTLANE = ROOT / "apps/android/fastlane/metadata/android"
# Instrument Sans, la police de l'app (licence OFL), en TTF : Pillow ne lit pas le woff2.
FONT = ROOT / "apps/android/app/src/main/res/font/instrument_sans_{}.ttf"

# Bannière Play Store (1024 × 500) : nom, slogan, trois atouts, par langue de la fiche.
FEATURE_TEXT = {
    "fr-FR": ("L’équilibre parfait\npour votre foyer.",
              ["Tâches à deux, tours de rôle", "Rappels et widgets", "Calendrier partagé"]),
    "en-US": ("The perfect balance\nfor your household.",
              ["Shared chores, turns", "Reminders and widgets", "Shared calendar"]),
    "nl-NL": ("De perfecte balans\nvoor je huishouden.",
              ["Taken samen, om de beurt", "Herinneringen en widgets", "Gedeelde agenda"]),
}


def near_white(p, t=245):
    return all(c >= t for c in p[:3])


def load(src=SRC):
    im = Image.open(src).convert("RGB")
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
    if "--play" in sys.argv[1:]:
        return play_listing(crop, mask, bg)
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
        # 64 dp : l'illustration (roues comprises) reste dans le cercle des masques ronds.
        art = int(64 * scale)
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

    # Logos sans fond blanc (coins transparents), pour tout autre usage (réseaux, présentations…).
    rounded.save(ROOT / "docs/brand/tandem-icon-transparent.png", optimize=True)

    # Site de documentation : logo de la barre de navigation et favicon.
    docs_img = ROOT / "apps/docs/static/img"
    docs_img.mkdir(parents=True, exist_ok=True)
    rounded.resize((192, 192), Image.LANCZOS).save(docs_img / "logo.png", optimize=True)
    rounded.resize((256, 256), Image.LANCZOS).save(docs_img / "favicon.png", optimize=True)

    # Logo avec le nom (facultatif) : page « À propos » et accueil de la documentation.
    wordmark = ROOT / "docs/brand/logo-wordmark.png"
    if wordmark.exists():
        wcrop, wmask, _ = load(wordmark)
        w = wcrop.convert("RGBA")
        w.putalpha(wmask)
        w.save(ROOT / "docs/brand/tandem-wordmark-transparent.png", optimize=True)
        w.thumbnail((640, 640), Image.LANCZOS)
        (public / "brand").mkdir(exist_ok=True)
        w.save(public / "brand/tandem-wordmark.png", optimize=True)
        w.save(docs_img / "tandem-wordmark.png", optimize=True)

    play_listing(crop, mask, bg)
    print(f"ok — fond {hex_bg}")


def play_listing(crop, mask, bg):
    """Icône 512 et bannière de la fiche Google Play, pour chaque langue."""
    side = crop.size[0]
    full = Image.new("RGB", (side, side), bg)
    full.paste(crop, (0, 0), mask)
    rounded = crop.convert("RGBA")
    rounded.putalpha(mask)
    # Fond plein (aucun blanc, aucun cadre) : Google applique lui-même ses coins arrondis.
    # L'illustration, réduite pour laisser respirer les roues, est découpée juste à l'intérieur
    # du carré arrondi d'origine (son liseré disparaît) et fondue dans la couleur du fond.
    play = Image.new("RGB", (512, 512), bg)
    art = int(512 * 0.88)
    inset = art * 5 // 100
    edge = Image.new("L", (art, art), 0)
    ImageDraw.Draw(edge).rounded_rectangle(
        (inset, inset, art - 1 - inset, art - 1 - inset), radius=art // 8, fill=255
    )
    edge = edge.filter(ImageFilter.GaussianBlur(2))
    play.paste(full.resize((art, art), Image.LANCZOS), ((512 - art) // 2, (512 - art) // 2), edge)
    play.save(ROOT / "docs/brand/play-store-icon-512.png", optimize=True)

    # Fiche Google Play (fastlane) : icône et bannière de chaque langue.
    for locale, (tagline, bullets) in FEATURE_TEXT.items():
        images = FASTLANE / locale / "images"
        images.mkdir(parents=True, exist_ok=True)
        play.save(images / "icon.png", optimize=True)
        feature_graphic(rounded, tagline, bullets).save(images / "featureGraphic.png", optimize=True)


def feature_graphic(logo, tagline, bullets):
    """Bannière 1024 × 500 aux couleurs « Duo » (design-tokens : fond blanc, gris, encre)."""
    bg, shade, ink, muted = (255, 255, 255), (243, 244, 246), (23, 24, 28), (95, 99, 107)
    im = Image.new("RGB", (1024, 500), bg)
    d = ImageDraw.Draw(im)
    d.ellipse((780, -170, 1220, 240), fill=shade)
    d.ellipse((-120, 330, 220, 670), fill=shade)
    art = logo.resize((360, 360), Image.LANCZOS)
    im.paste(art, (70, 70), art)
    font = lambda weight, size: ImageFont.truetype(str(FONT).format(weight), size)
    d.text((488, 64), "Tandem", font=font("semibold", 72), fill=ink)
    d.multiline_text((490, 168), tagline, font=font("semibold", 36), fill=ink, spacing=8)
    regular = font("regular", 24)
    for i, line in enumerate(bullets):
        y = 292 + i * 46
        d.ellipse((492, y + 9, 504, y + 21), fill=ink)
        d.text((520, y), line, font=regular, fill=muted)
    return im


if __name__ == "__main__":
    main()
