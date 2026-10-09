"""Tickets de caisse fictifs (aucune donnée réelle) pour les tests de lecture des tickets.

Régénérer : `python3 test/fixtures/make-receipts.py` depuis apps/api (Pillow, police DejaVu).
"""
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 26)
OUT = "test/fixtures"


def paper(lines):
    img = Image.new("L", (560, 40 + 38 * len(lines)), 245)
    d = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        d.text((24, 20 + 38 * i), line, fill=30, font=FONT)
    return img


# Ticket simple, total 6,94 € (receipt-fr.png).
simple = paper(["EPICERIE DES TILLEULS", "Rue Fictive 1, 1000 Bruxelles", "",
                "Pain complet        2,35", "Lait demi-ecreme    1,19", "Pommes 1 kg         3,40", "",
                "TVA 6%              0,39", "TOTAL               6,94 EUR", "",
                "05/10/2026  18:42", "Merci de votre visite"])
simple.save(f"{OUT}/receipt-fr.png", optimize=True)

# Photos difficiles, total 25,73 €.
p = paper(["EPICERIE DES TILLEULS", "Rue Fictive 1, 1000 Bruxelles", "",
           "Pain complet        2,35", "Lait demi-ecreme    1,19", "Pommes 1 kg         3,40",
           "Fromage            12,80", "Cafe moulu          5,99", "",
           "TVA 6%              1,46", "TOTAL              25,73 EUR", "",
           "05/10/2026  18:42", "Merci de votre visite"])
# Tournée d'un quart de tour, sans EXIF.
p.rotate(90, expand=True).save(f"{OUT}/receipt-rot90.png")
# Penchée de 6° sur une table sombre, un peu floue.
table = Image.new("RGB", (1100, 1000), (70, 55, 45))
table.paste(p.convert("RGB").rotate(6, expand=True, fillcolor=(70, 55, 45)), (220, 120))
table.filter(ImageFilter.GaussianBlur(0.8)).save(f"{OUT}/receipt-table-skew.jpg", quality=80)
# Petite et terne.
small = p.resize((280, int(p.height * 280 / 560)))
ImageEnhance.Contrast(small).enhance(0.45).save(f"{OUT}/receipt-small-dull.jpg", quality=70)
# Pixels tournés, l'EXIF dit comment redresser (comme un téléphone).
exif = Image.Exif()
exif[0x0112] = 8
p.convert("RGB").rotate(-90, expand=True).save(f"{OUT}/receipt-exif-rot.jpg", exif=exif.tobytes(), quality=90)
