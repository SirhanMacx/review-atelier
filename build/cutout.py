# -*- coding: utf-8 -*-
"""
Turn the generated specimen renders into free-floating PNGs.

The renders come back on a lit plate that is rarely one flat colour: most have
a soft vignette. Keying against a single sampled colour leaves a visible
rectangle, so we estimate the plate as a smooth surface from the border pixels
(a Coons-style blend of the four edges) and key each pixel against its own
local background. The soft contact shadow survives as partial alpha.

Usage:  python3 build/cutout.py [source_dir]
Reads   assets/img/_raw/*.png   ->   assets/img/<name>.png
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets" / "img" / "_raw"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "assets" / "img"

NEAR = 9.0     # within this distance of the local plate colour: transparent
FAR  = 42.0    # beyond it: fully opaque
MAXPX = 900    # longest side of the finished cutout


def background_model(a):
    """Smooth estimate of the plate, blended from the four border strips."""
    h, w, _ = a.shape
    s = max(2, min(h, w) // 120)                 # strip thickness
    left   = a[:, :s].mean(axis=1)               # (h,3) colour down the left edge
    right  = a[:, -s:].mean(axis=1)
    top    = a[:s, :].mean(axis=0)               # (w,3) colour across the top
    bottom = a[-s:, :].mean(axis=0)

    ys = (np.arange(h) / max(h - 1, 1)).reshape(h, 1, 1)
    xs = (np.arange(w) / max(w - 1, 1)).reshape(1, w, 1)

    horiz = left.reshape(h, 1, 3) * (1 - xs) + right.reshape(h, 1, 3) * xs
    vert  = top.reshape(1, w, 3) * (1 - ys) + bottom.reshape(1, w, 3) * ys
    # corner term keeps the two ruled surfaces from double counting
    c = (a[:s, :s].mean(axis=(0, 1)), a[:s, -s:].mean(axis=(0, 1)),
         a[-s:, :s].mean(axis=(0, 1)), a[-s:, -s:].mean(axis=(0, 1)))
    corners = (c[0] * (1 - xs) * (1 - ys) + c[1] * xs * (1 - ys) +
               c[2] * (1 - xs) * ys + c[3] * xs * ys)
    return horiz + vert - corners


def cut(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    bg = background_model(a)

    d = np.sqrt(((a - bg) ** 2).sum(axis=2))
    alpha = np.clip((d - NEAR) / (FAR - NEAR), 0, 1) * 255
    am = Image.fromarray(alpha.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.7))

    out = im.convert("RGBA")
    out.putalpha(am)

    box = out.getbbox()
    if box:
        out = out.crop(box)
    pad = int(max(out.size) * 0.05)
    canvas = Image.new("RGBA", (out.width + pad * 2, out.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(out, (pad, pad))
    canvas.thumbnail((MAXPX, MAXPX), Image.LANCZOS)

    dst = OUT / (path.stem + ".png")
    canvas.save(dst, "PNG", optimize=True)
    print(f"  {path.stem:11} -> {canvas.size[0]}x{canvas.size[1]}  {dst.stat().st_size // 1024}KB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.glob("*.png") if not p.name.startswith("."))
    if not files:
        print(f"no PNGs in {SRC}")
        return
    print(f"cutting {len(files)} specimens")
    for p in files:
        cut(p)


if __name__ == "__main__":
    main()
