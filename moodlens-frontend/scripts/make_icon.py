"""Draws the MoodLens app icon and splash art: a gold crescent moon inside a
lens ring, on the app's midnight-indigo background (colors from src/theme.ts).

Placeholder art until a designed icon replaces it. Regenerate with:
    pip install pillow && python scripts/make_icon.py

Writes:
    assets/icon.png         1024x1024, opaque (App Store requires no alpha)
    assets/splash-icon.png  1024x1024, transparent (splash + Android adaptive
                            foreground; the background color comes from app.json)
"""
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT = 1024
SS = 4  # draw at 4x and downsample for smooth edges
S = OUT * SS

BG_CENTER = (42, 31, 92)   # lifted indigo for the center glow
BG_EDGE = (18, 14, 40)     # colors.background #120e28
GOLD = (201, 162, 39)      # colors.gold #c9a227
GOLD_BRIGHT = (232, 199, 102)  # colors.goldBright #e8c766
GOLD_DIM = (138, 116, 52)  # colors.goldDim #8a7434

ASSETS = Path(__file__).resolve().parent.parent / "assets"


def radial_background() -> Image.Image:
    # Build the gradient small and upscale - it's smooth, so no detail is lost.
    n = 256
    img = Image.new("RGB", (n, n))
    px = img.load()
    c = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            t = min(1.0, math.hypot(x - c, y - c) / (n * 0.62))
            t = t * t * (3 - 2 * t)  # smoothstep
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(BG_CENTER, BG_EDGE))
    return img.resize((S, S), Image.BICUBIC)


def circle_mask(cx: float, cy: float, r: float) -> Image.Image:
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return m


def ring_mask(cx: float, cy: float, r: float, width: float) -> Image.Image:
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=round(width))
    return m


def sparkle_mask(cx: float, cy: float, size: float) -> Image.Image:
    """Four-point star: two thin diamonds crossed."""
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    w = size * 0.22
    d.polygon([(cx, cy - size), (cx + w, cy), (cx, cy + size), (cx - w, cy)], fill=255)
    d.polygon([(cx - size, cy), (cx, cy - w), (cx + size, cy), (cx, cy + w)], fill=255)
    return m


def art_layer() -> Image.Image:
    """The moon, ring, and stars on a transparent canvas."""
    c = S / 2
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    def paint(mask: Image.Image, color: tuple, alpha: float = 1.0):
        solid = Image.new("RGBA", (S, S), color + (255,))
        if alpha < 1:
            mask = mask.point(lambda v: round(v * alpha))
        layer.alpha_composite(Image.composite(solid, Image.new("RGBA", (S, S)), mask))

    # Lens: a bold outer ring with a faint inner ring, like a lens barrel.
    ring_r = S * 0.335
    outer = ring_mask(c, c, ring_r, S * 0.034)
    paint(outer.filter(ImageFilter.GaussianBlur(S * 0.02)), GOLD, 0.35)  # soft glow
    paint(outer, GOLD)
    paint(ring_mask(c, c, ring_r - S * 0.05, S * 0.008), GOLD_DIM, 0.8)

    # Crescent: a disc minus an offset disc, opening to the upper right.
    moon_r = S * 0.19
    mcx, mcy = c - S * 0.025, c + S * 0.01
    cut = circle_mask(mcx + S * 0.085, mcy - S * 0.06, moon_r * 0.9)
    crescent = ImageChops.subtract(circle_mask(mcx, mcy, moon_r), cut)
    paint(crescent.filter(ImageFilter.GaussianBlur(S * 0.018)), GOLD_BRIGHT, 0.45)
    paint(crescent, GOLD_BRIGHT)

    # Stars in the crescent's opening, plus one outside the ring.
    for x, y, size in ((0.60, 0.40, 0.045), (0.66, 0.54, 0.025), (0.55, 0.30, 0.018), (0.80, 0.20, 0.03)):
        paint(sparkle_mask(S * x, S * y, S * size), GOLD_BRIGHT)

    return layer


def main():
    art = art_layer()

    icon = radial_background().convert("RGBA")
    icon.alpha_composite(art)
    icon.convert("RGB").resize((OUT, OUT), Image.LANCZOS).save(ASSETS / "icon.png")

    # Splash/adaptive foreground: same art, scaled into Android's safe zone.
    fg = art.resize((round(OUT * 0.78), round(OUT * 0.78)), Image.LANCZOS)
    splash = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    splash.alpha_composite(fg, ((OUT - fg.width) // 2, (OUT - fg.height) // 2))
    splash.save(ASSETS / "splash-icon.png")
    print("wrote", ASSETS / "icon.png", "and", ASSETS / "splash-icon.png")


if __name__ == "__main__":
    main()
