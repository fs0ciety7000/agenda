"""Codes-barres EAN-13 fictifs (préfixe 200, réservé à l'usage interne des magasins) pour les
tests de lecture des codes-barres. Dessinés ici, sans bibliothèque de codes-barres.

Régénérer : `python3 test/fixtures/make-barcodes.py` depuis apps/api (Pillow, police DejaVu).
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = "test/fixtures"
L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]


def check_digit(code12):
    s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(code12))
    return str((10 - s % 10) % 10)


def ean13(code12):
    code = code12 + check_digit(code12)
    bits = "101"
    for i, c in enumerate(code[1:7]):
        bits += (L if PARITY[int(code[0])][i] == "L" else G)[int(c)]
    bits += "01010"
    for c in code[7:]:
        bits += R[int(c)]
    bits += "101"
    return code, bits


def draw(code12, module=4, height=220):
    code, bits = ean13(code12)
    quiet = 12 * module
    img = Image.new("L", (len(bits) * module + 2 * quiet, height + 70), 250)
    d = ImageDraw.Draw(img)
    for i, b in enumerate(bits):
        if b == "1":
            d.rectangle([quiet + i * module, 20, quiet + (i + 1) * module - 1, 20 + height], fill=20)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 30)
    d.text((quiet, height + 28), code, fill=20, font=font)
    return code, img


if __name__ == "__main__":
    code, img = draw("200123456789")
    img.save(f"{OUT}/barcode-ean13.png", optimize=True)
    # Photo prise au vol : code posé sur un emballage, penché, flou léger, JPEG.
    box = Image.new("L", (900, 700), 120)
    box.paste(img, (150, 180))
    photo = box.rotate(8, fillcolor=120).filter(ImageFilter.GaussianBlur(1.2))
    photo.convert("RGB").save(f"{OUT}/barcode-photo.jpg", quality=80)
    print(code)
