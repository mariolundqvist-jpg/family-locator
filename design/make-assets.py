#!/usr/bin/env python3
"""
SafePath – genererar appikon, adaptiv ikon, splash och butiksikon som PNG.

    python3 design/make-assets.py

Allt ritas härifrån. Inga externa filer, inga typsnitt hämtade över nätet.
Märket ritas som en mask i 4× överupplösning och skalas ned med Lanczos, vilket
ger jämna kanter utan att en webbläsare behöver vara inblandad.

Utdata:
  mobile/assets/     de filer appbygget använder (app.json pekar på dem)
  design/assets/     splash-förhandsvisningar i fullskärm + butiksikon
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "mobile" / "assets"
OUT = ROOT / "design" / "assets"
APP.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- varumärke
GREEN_LIGHT = (43, 138, 114)     # #2b8a72
GREEN_DARK = (18, 80, 63)        # #12503f
INK_DARK = (16, 23, 21)          # #101715
PAPER = (246, 247, 245)          # #f6f7f5
MINT = (127, 209, 184)           # #7fd1b8
WHITE = (255, 255, 255)

SS = 4
# Androids adaptiva ikon: bara de mittersta 66 % är garanterat synliga,
# dvs. en radie på 30,56 % av rutan. Märket mäter 33,0 % vid skala 1,0.
ADAPTIVE_SCALE = 0.90                            # överupplösning för masken
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


# ---------------------------------------------------------------- märket
def _bezier(p0, p1, p2, p3, steps=160):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def _segment_distance(px, py, a, b):
    """Avstånd från varje pixel i rutnätet till ett linjesegment."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    if denom == 0:
        return np.hypot(px - ax, py - ay)
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / denom, 0.0, 1.0)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _feather(value, limit, width=1.0):
    """1 innanför gränsen, 0 utanför, med en mjuk kant på `width` pixlar."""
    return np.clip((limit - value) / width + 0.5, 0.0, 1.0)


def mark_mask(size: int, scale: float = 1.0) -> Image.Image:
    """
    Märket: en mjuk linje mellan två punkter — en plats som delas mellan två
    personer. Punkt till vänster, ring till höger (den andra personen).

    Masken räknas som ett avståndsfält i stället för att ritas med pensel:
    varje pixel får ett exakt avstånd till formen, och kanten får en mjuk
    övergång på en pixel. Det ger jämna kanter i alla storlekar utan att
    förlita sig på en webbläsare eller på kantutjämning i efterhand.
    """
    grid = np.arange(size, dtype=np.float32) + 0.5
    px, py = np.meshgrid(grid, grid)

    # Samma geometri som i design/src/launch-ui.html (viewBox 1024).
    path = _bezier((330, 672), (430, 672), (452, 566), (520, 502), steps=64)
    path += _bezier((520, 502), (588, 438), (640, 392), (700, 352), steps=64)[1:]

    k = size / 1024.0
    pts = [(x * k, y * k) for x, y in path]
    radius = 52 * k / 2

    line = np.full((size, size), np.inf, dtype=np.float32)
    for a, b in zip(pts, pts[1:]):
        np.minimum(line, _segment_distance(px, py, a, b), out=line)

    mask = _feather(line, radius)

    # Linjen får inte fylla ringens hål: stansa ut hålet innan ringen läggs på,
    # så att linjen möter ringens band och hålet förblir tomt.
    hole = _feather(np.hypot(px - 704 * k, py - 348 * k), 62 * k - 46 * k / 2)
    mask *= 1.0 - hole

    # Fylld punkt.
    dot = np.hypot(px - 318 * k, py - 676 * k)
    np.maximum(mask, _feather(dot, 62 * k), out=mask)

    # Ring: ett band kring radien, så att linjen syns genom hålet.
    ring_d = np.abs(np.hypot(px - 704 * k, py - 348 * k) - 62 * k)
    np.maximum(mask, _feather(ring_d, 46 * k / 2), out=mask)

    if scale != 1.0:
        # Skala kring mitten: räkna om i den inre storleken och klistra in.
        inner = int(round(size * scale))
        small = mark_mask(inner)
        out = Image.new("L", (size, size), 0)
        off = (size - inner) // 2
        out.paste(small, (off, off))
        return out

    return Image.fromarray((mask * 255).astype(np.uint8), "L")


def tinted(mask: Image.Image, colour) -> Image.Image:
    img = Image.new("RGBA", mask.size, colour + (0,))
    img.putalpha(mask)
    return img


# ---------------------------------------------------------------- bakgrunder
def gradient(w: int, h: int = None, start=GREEN_LIGHT, end=GREEN_DARK) -> Image.Image:
    """Diagonal gradient med en mycket svag ljuspuckel uppe till vänster.

    Färgerna är hämtade från startskärmen i designpaketet (#2a8870 → #135240).
    """
    h = w if h is None else h
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (x / (w - 1) + y / (h - 1)) / 2
    t = t[..., None]
    a = np.array(start, dtype=np.float32)
    b = np.array(end, dtype=np.float32)
    rgb = a * (1 - t) + b * t

    # Svag radial högdager, avsiktligt diskret: en stark glans ser billig ut
    # och gör dessutom ikonen grumlig i små storlekar.
    cx, cy, r = w * 0.28, h * 0.18, max(w, h) * 0.85
    dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r
    glow = np.clip(1 - dist, 0, 1) ** 2 * 0.10
    rgb = rgb + (255 - rgb) * glow[..., None]

    # Dithering: en jämn gradient i 8 bitar får annars synliga band.
    rng = np.random.default_rng(7)
    rgb = rgb + rng.uniform(-0.5, 0.5, rgb.shape)

    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def flat(size: int, colour) -> Image.Image:
    return Image.new("RGB", (size, size), colour)


# ---------------------------------------------------------------- ikoner
def icon_master(size=1024, dark=False) -> Image.Image:
    """Full bleed, ogenomskinlig. App Store kräver att ikonen saknar alfa."""
    bg = flat(size, INK_DARK) if dark else gradient(size)
    fg = MINT if dark else WHITE
    icon = bg.convert("RGBA")
    icon.alpha_composite(tinted(mark_mask(size, 1.22), fg))
    return icon.convert("RGB")


def adaptive_foreground(size=1024) -> Image.Image:
    """
    Android adaptive icon: 108dp-ruta där bara de mittersta ~66 % är garanterat
    synliga. Märket skalas därför till 60 % av rutan.
    """
    return tinted(mark_mask(size, ADAPTIVE_SCALE), WHITE)


def adaptive_background(size=1024) -> Image.Image:
    return gradient(size)


def monochrome(size=1024) -> Image.Image:
    """Themed icon: en enda färg med alfa. Systemet färgar den själv."""
    return tinted(mark_mask(size, ADAPTIVE_SCALE), WHITE)


def _tight(mask: Image.Image, padding: float = 0.06) -> Image.Image:
    """Beskär masken till sitt innehåll och lägger till jämn luft runt om."""
    box = mask.getbbox()
    crop = mask.crop(box)
    side = int(round(max(crop.size) * (1 + 2 * padding)))
    out = Image.new("L", (side, side), 0)
    out.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    return out


def splash_logo(size=1024) -> Image.Image:
    """
    Transparent logotyp för startskärmen.

    Beskuren tätt runt märket, så att `imageWidth` i app.json motsvarar märkets
    faktiska bredd i stället för en stor genomskinlig ram. Färgen är gräddvit
    eftersom startskärmens bakgrund alltid är mörkgrön.
    """
    mask = _tight(mark_mask(512)).resize((size, size), Image.LANCZOS)
    return tinted(mask, PAPER)


# ---------------------------------------------------------------- splash i fullskärm
def splash_full(width: int, height: int, dark: bool = False) -> Image.Image:
    """
    Startskärm i fullskärm, som förhandsvisning av det användaren faktiskt ser.

    Kompositionen följer den godkända startskärmen i designpaketet: märket är
    ca 13 % av skärmbredden, ordmärket ca 24 %, och allt ligger strax ovanför
    mitten. Den riktiga startskärmen ritas av systemet – den här filen är
    förhandsvisningen.
    """
    img = gradient(width, height) if not dark else Image.new("RGB", (width, height), GREEN_DARK)

    logo_px = int(min(width, height) * 0.235)
    mark = tinted(_tight(mark_mask(512)).resize((logo_px, logo_px), Image.LANCZOS), PAPER)

    name = "SafePath"
    font_size = max(12, int(logo_px * 0.208))
    font = ImageFont.truetype(FONT_BOLD, font_size)
    tmp = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    box = tmp.textbbox((0, 0), name, font=font)
    text_w, text_h = box[2] - box[0], box[3] - box[1]

    gap = int(logo_px * 0.30)
    block_h = logo_px + gap + text_h
    top = (height - block_h) // 2 - int(height * 0.03)

    img.paste(mark, ((width - logo_px) // 2, top), mark)

    canvas = img.convert("RGBA")
    d = ImageDraw.Draw(canvas)
    d.text(
        ((width - text_w) / 2 - box[0], top + logo_px + gap - box[1]),
        name,
        font=font,
        fill=PAPER,
    )
    return canvas.convert("RGB")


# ---------------------------------------------------------------- översiktsark
def _shape_mask(size: int, kind: str, radius_ratio: float = 0.2237) -> Image.Image:
    """Mjuk mask för cirkel eller rundad kvadrat (iOS 22,37 % hörnradie)."""
    grid = np.arange(size, dtype=np.float32) + 0.5
    px, py = np.meshgrid(grid, grid)
    c = size / 2.0

    if kind == "circle":
        d = np.hypot(px - c, py - c) - (c - 1)
    else:
        r = size * radius_ratio
        qx = np.abs(px - c) - (c - r - 1)
        qy = np.abs(py - c) - (c - r - 1)
        outside = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
        inside = np.minimum(np.maximum(qx, qy), 0)
        d = outside + inside - r
    return Image.fromarray((_feather(d, 0) * 255).astype(np.uint8), "L")


def _rounded(img: Image.Image, mask: Image.Image) -> Image.Image:
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def icon_sheet() -> Image.Image:
    """Ett ark som visar ikonen som den faktiskt möter användaren."""
    W, H = 1752, 760
    sheet = Image.new("RGB", (W, H), (236, 238, 235))
    d = ImageDraw.Draw(sheet)
    label_font = ImageFont.truetype(FONT_BOLD, 22)
    small_font = ImageFont.truetype(FONT_BOLD, 17)
    ink = (22, 33, 31)
    soft = (90, 104, 99)

    d.text((56, 48), "Så här möter ikonen användaren", font=label_font, fill=ink)
    d.text((56, 82), "Samma märke i alla former – inget separat typsnitt, ingen text i ikonen.",
           font=small_font, fill=soft)

    master = icon_master(1024)
    dark_master = icon_master(1024, dark=True)
    fg = adaptive_foreground(1024)
    bg = adaptive_background(1024)
    adaptive = bg.convert("RGBA")
    adaptive.alpha_composite(fg)
    mono_tile = Image.new("RGB", (1024, 1024), (231, 233, 230))
    mono_tile_rgba = mono_tile.convert("RGBA")
    mono_tile_rgba.alpha_composite(tinted(mark_mask(1024, ADAPTIVE_SCALE), INK_DARK))
    mono_fg = mono_tile_rgba

    TILE = 300
    tiles = [
        ("iOS", _rounded(master.resize((TILE, TILE), Image.LANCZOS), _shape_mask(TILE, "rounded"))),
        ("Android, cirkel", _rounded(adaptive.resize((TILE, TILE), Image.LANCZOS), _shape_mask(TILE, "circle"))),
        ("Android, rundad", _rounded(adaptive.resize((TILE, TILE), Image.LANCZOS), _shape_mask(TILE, "rounded", 0.5))),
        ("Monokrom (temat färgar)", _rounded(mono_fg.resize((TILE, TILE), Image.LANCZOS), _shape_mask(TILE, "rounded", 0.5))),
        ("Mörkt läge", _rounded(dark_master.resize((TILE, TILE), Image.LANCZOS), _shape_mask(TILE, "rounded"))),
    ]

    x = 56
    for name, tile in tiles:
        sheet.paste(tile, (x, 150), tile)
        d.text((x, 150 + TILE + 14), name, font=small_font, fill=soft)
        x += TILE + 30

    # Små storlekar: där avgörs om märket håller.
    d.text((56, 548), "I liten storlek på hemskärmen", font=label_font, fill=ink)
    x = 56
    for px in (96, 72, 48, 32):
        tile = _rounded(master.resize((px, px), Image.LANCZOS), _shape_mask(px, "rounded"))
        sheet.paste(tile, (x, 596), tile)
        d.text((x, 596 + px + 10), f"{px} px", font=small_font, fill=soft)
        x += px + 56

    return sheet


def save(img: Image.Image, path: Path, *, note: str = "") -> None:
    img.save(path, "PNG", optimize=True)
    mode = img.mode
    w, h = img.size
    print(f"  {path.relative_to(ROOT)!s:<44} {w}×{h}  {mode:<5} {note}")


def main() -> None:
    print("Apptillgångar (mobile/assets/)")
    save(icon_master(1024), APP / "icon.png", note="App Store, ogenomskinlig")
    save(icon_master(1024, dark=True), APP / "icon-dark.png", note="iOS mörkt läge")
    save(adaptive_foreground(), APP / "adaptive-icon.png", note="Android förgrund, alfa")
    save(adaptive_background(), APP / "adaptive-icon-background.png", note="Android bakgrund")
    save(monochrome(), APP / "adaptive-icon-monochrome.png", note="Android themed icon")
    save(splash_logo(), APP / "splash-icon.png", note="startskärm, transparent, tätt beskuren")
    save(icon_master(1024).resize((48, 48), Image.LANCZOS), APP / "favicon.png", note="webbflik")

    print("Butik och förhandsvisning (design/assets/)")
    save(icon_master(1024).resize((512, 512), Image.LANCZOS), OUT / "play-icon-512.png",
         note="Google Play-butiksikon")


    save(splash_full(1290, 2796), OUT / "splash-ios.png", note="iPhone 6.7 tum, grön")
    save(splash_full(1080, 2400), OUT / "splash-android.png", note="Pixel-klass, grön")
    save(icon_sheet(), OUT / "ikon-oversikt.png", note="så ikonen möter användaren")

    # Kontroll: App Store avvisar en ikon med alfa, och adaptive icon måste ha alfa.
    with Image.open(APP / "icon.png") as im:
        assert im.mode == "RGB" and im.size == (1024, 1024), "ikon: fel format"
    with Image.open(APP / "adaptive-icon.png") as im:
        assert im.mode == "RGBA", "adaptiv förgrund måste ha alfa"
    with Image.open(APP / "adaptive-icon-monochrome.png") as im:
        colours = im.convert("RGBA").getcolors(maxcolors=100000)
        opaque = [c for _, c in colours if c[3] > 8]
        assert len({c[:3] for c in opaque}) == 1, "monokrom ikon får bara ha en färg"
    print("\nKontroller OK: ikon utan alfa, adaptiv förgrund med alfa, monokrom med en färg.")


if __name__ == "__main__":
    main()
