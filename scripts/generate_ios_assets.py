from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ICON_SOURCE = ROOT / 'icon-512.png'
LOGO_SOURCE = ROOT / 'logo.png'
APP_ICON = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png'
SPLASH_DIR = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'Splash.imageset'

BG = '#09090E'
PURPLE_TOP = '#C026FF'
PURPLE_BOTTOM = '#8B18F3'


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert('RGBA')


def gradient_square(size: int) -> Image.Image:
    base = Image.new('RGBA', (size, size), BG)
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((size * 0.18, size * 0.14, size * 0.82, size * 0.78), fill=(168, 85, 247, 48))
    glow = glow.filter(ImageFilter.GaussianBlur(size // 14))
    base.alpha_composite(glow)
    return base


def purple_tile(size: int, radius: int) -> Image.Image:
    tile = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for y in range(size):
        t = y / max(size - 1, 1)
        r1, g1, b1 = (192, 38, 255)
        r2, g2, b2 = (139, 24, 243)
        color = (
            int(r1 + (r2 - r1) * t),
            int(g1 + (g2 - g1) * t),
            int(b1 + (b2 - b1) * t),
            255,
        )
        draw.line((0, y, size, y), fill=color)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), radius=radius, fill=255)
    tile.putalpha(mask)
    tile.alpha_composite(layer)
    return tile


def build_app_icon():
    APP_ICON.parent.mkdir(parents=True, exist_ok=True)
    source = load_rgba(ICON_SOURCE if ICON_SOURCE.exists() else LOGO_SOURCE)
    canvas = Image.new('RGBA', (1024, 1024), BG)
    tile = purple_tile(860, 188)
    shadow = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    shadow_tile = Image.new('RGBA', tile.size, (0, 0, 0, 0))
    shadow_tile.alpha_composite(tile)
    shadow_tile = shadow_tile.filter(ImageFilter.GaussianBlur(18))
    shadow.alpha_composite(shadow_tile, (82, 118))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(tile, (82, 82))

    glyph = ImageOps.contain(source, (420, 420))
    if glyph.size[0] < 420:
        glyph = glyph.resize((420, 420), Image.Resampling.LANCZOS)
    canvas.alpha_composite(glyph, ((1024 - glyph.width) // 2, (1024 - glyph.height) // 2))
    canvas.convert('RGB').save(APP_ICON)


def build_splash(name: str, size: int, icon_scale: int):
    SPLASH_DIR.mkdir(parents=True, exist_ok=True)
    source = load_rgba(ICON_SOURCE if ICON_SOURCE.exists() else LOGO_SOURCE)
    canvas = gradient_square(size)
    tile_size = int(size * 0.26)
    tile = purple_tile(tile_size, int(tile_size * 0.24))
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_tile = Image.new('RGBA', tile.size, (0, 0, 0, 0))
    glow_tile.alpha_composite(tile)
    glow_tile = glow_tile.filter(ImageFilter.GaussianBlur(max(size // 36, 12)))
    px = (size - tile_size) // 2
    py = int(size * 0.22)
    glow.alpha_composite(glow_tile, (px, py + max(size // 80, 8)))
    canvas.alpha_composite(glow)
    canvas.alpha_composite(tile, (px, py))

    glyph = ImageOps.contain(source, (icon_scale, icon_scale))
    gx = (size - glyph.width) // 2
    gy = py + (tile_size - glyph.height) // 2
    canvas.alpha_composite(glyph, (gx, gy))
    canvas.convert('RGB').save(SPLASH_DIR / name)


if __name__ == '__main__':
    build_app_icon()
    build_splash('splash-2732x2732.png', 2732, 720)
    build_splash('splash-2732x2732-1.png', 2732, 720)
    build_splash('splash-2732x2732-2.png', 2732, 720)
    print('Generated iOS app icon and launch splash assets.')
