"""Generate the Errata extension icons (16/32/48/128 PNG) into icons/.

Design: brand-red rounded tile with a white text line and the
proofreader's insertion caret underneath it.
Drawn at 4x and downscaled for smooth edges.

Run: python tools/make_icon.py   (requires Pillow)
"""

import os
from PIL import Image, ImageDraw

RED = (225, 29, 72, 255)      # matches the picker highlight #e11d48
WHITE = (255, 255, 255, 255)
SS = 4                        # supersampling factor


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def caret(draw, pts, w, fill):
    """Polyline with round joints and caps (PIL lacks cap styles)."""
    for i in range(len(pts) - 1):
        draw.line([pts[i], pts[i + 1]], fill=fill, width=int(w))
    for x, y in pts:
        r = w / 2
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def make(size):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = s / 128  # scale factor from 128 design space

    # tile
    rounded(d, [0, 0, s, s], 28 * k, RED)

    # text line
    rounded(d, [28 * k, 34 * k, 100 * k, 48 * k], 7 * k, WHITE)

    # insertion caret pointing up at the line
    pts = [(42 * k, 94 * k), (64 * k, 60 * k), (86 * k, 94 * k)]
    caret(d, pts, 10 * k, WHITE)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for size in (16, 32, 48, 128):
        path = os.path.join(out, f"icon-{size}.png")
        make(size).save(path)
        print("wrote", path)
