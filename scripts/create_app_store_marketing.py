from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "app-store-screenshots/2026-06-real-app/iphone/screenshots"
OUTPUT_DIR = ROOT / "app-store-screenshots/2026-07-marketing/iphone-6.5"
OUTPUT_DIR_69 = ROOT / "app-store-screenshots/2026-07-marketing/iphone-6.9"
BACKGROUND = (
    Path.home()
    / ".codex/generated_images/019f9014-0dbf-74a3-8548-d9e327effcfa"
    / "call_4qcOwWfQDUZVHlFhskIDSWgs.png"
)

WIDTH, HEIGHT = 1242, 2688
WHITE = (255, 255, 255)
LAVENDER = (205, 188, 255)

SLIDES = [
    {
        "file": "01-create-pixel-art.png",
        "source": "screenshot-03-studio-template-gallery.png",
        "headline": "Create Pixel Art\nYour Way",
        "subhead": "Start with colorful inspiration, then make it completely yours.",
        "crop": (0, 0, 1242, 1550),
        "accent": (120, 85, 255),
    },
    {
        "file": "02-animate-your-art.png",
        "source": "screenshot-02-studio-top.png",
        "headline": "Bring Your Art\nto Life",
        "subhead": "Build frame-by-frame animations with ready-to-use starters.",
        "crop": (0, 180, 1242, 1580),
        "accent": (255, 75, 185),
    },
    {
        "file": "03-start-fast-templates.png",
        "source": "screenshot-03-studio-template-gallery.png",
        "headline": "Start Fast\nWith Templates",
        "subhead": "Choose a colorful starter and make every pixel your own.",
        "crop": (0, 0, 1242, 1550),
        "accent": (35, 190, 255),
    },
    {
        "file": "04-powerful-drawing-tools.png",
        "source": "screenshot-04-editor-bunny-hop.png",
        "headline": "Powerful\nDrawing Tools",
        "subhead": "Draw, fill, mirror, add effects, and fine-tune every pixel.",
        "crop": (760, 0, 1242, 1350),
        "accent": (255, 177, 42),
    },
    {
        "file": "05-save-and-share.png",
        "source": "screenshot-07-save-to-gallery.png",
        "headline": "Save & Share\nYour Creations",
        "subhead": "Keep your artwork together and revisit every idea.",
        "crop": (280, 650, 960, 1450),
        "accent": (66, 220, 160),
    },
    {
        "file": "06-explore-pixelverse.png",
        "source": "screenshot-08-pixelverse.png",
        "headline": "Explore\nPixelVerse",
        "subhead": "Build your creator profile and discover a world of pixel art.",
        "crop": (0, 0, 1242, 1540),
        "accent": (153, 90, 255),
    },
    {
        "file": "07-premium.png",
        "source": "screenshot-10-lavendercare-plus.png",
        "headline": "Unlock More\nWith Premium",
        "subhead": "Enjoy more animation, more saves, and more creative freedom.",
        "crop": (250, 700, 1000, 1550),
        "accent": (255, 95, 160),
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    choices = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSRounded.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ]
    for choice in choices:
        try:
            return ImageFont.truetype(choice, size=size, index=1 if bold else 0)
        except OSError:
            continue
    return ImageFont.load_default()


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius, fill=255)
    return mask


def fit_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    ratio = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize(
        (round(image.width * ratio), round(image.height * ratio)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def wrap(draw: ImageDraw.ImageDraw, text: str, text_font, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        proposed = f"{current} {word}".strip()
        if draw.textbbox((0, 0), proposed, font=text_font)[2] <= max_width:
            current = proposed
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def create_slide(index: int, spec: dict, background: Image.Image) -> Image.Image:
    canvas = fit_cover(background, (WIDTH, HEIGHT))
    canvas = ImageEnhance.Brightness(canvas).enhance(0.78)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle((0, 0, WIDTH, 680), fill=(5, 3, 20, 122))
    od.ellipse((-160, 320, 620, 1100), fill=(*spec["accent"], 48))
    od.ellipse((720, 1000, 1450, 2050), fill=(*spec["accent"], 38))
    overlay = overlay.filter(ImageFilter.GaussianBlur(65))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(canvas)

    pill = (66, 74, 280, 144)
    draw.rounded_rectangle(pill, radius=35, fill=(*spec["accent"], 235))
    draw.text((173, 109), f"0{index}", anchor="mm", font=font(34, True), fill=WHITE)

    title_font = font(104, True)
    draw.multiline_text(
        (68, 188),
        spec["headline"],
        font=title_font,
        fill=WHITE,
        spacing=4,
        stroke_width=2,
        stroke_fill=(20, 8, 45),
    )
    sub_font = font(39, False)
    y = 452 if "\n" in spec["headline"] else 350
    for line in wrap(draw, spec["subhead"], sub_font, 1090):
        draw.text((70, y), line, font=sub_font, fill=LAVENDER)
        y += 52

    panel = (74, 650, 1168, 2605)
    shadow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (panel[0] - 12, panel[1] + 15, panel[2] + 12, panel[3] + 28),
        radius=74,
        fill=(0, 0, 0, 160),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas = Image.alpha_composite(canvas, shadow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (panel[0] - 4, panel[1] - 4, panel[2] + 4, panel[3] + 4),
        radius=72,
        fill=(*spec["accent"], 245),
    )

    source = Image.open(SOURCE_DIR / spec["source"]).convert("RGB")
    source = source.crop(spec["crop"])
    source = fit_cover(source, (panel[2] - panel[0], panel[3] - panel[1]))
    source = ImageEnhance.Brightness(source).enhance(1.28)
    source = ImageEnhance.Contrast(source).enhance(1.08)
    mask = rounded_mask(source.size, 68)
    canvas.paste(source, (panel[0], panel[1]), mask)

    footer_y = 2585
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((458, footer_y, 784, footer_y + 60), radius=30, fill=(8, 4, 25, 210))
    draw.text(
        (621, footer_y + 30),
        "PIXEL SPRITE VIBE",
        anchor="mm",
        font=font(25, True),
        fill=WHITE,
    )
    return canvas.convert("RGB")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR_69.mkdir(parents=True, exist_ok=True)
    background = Image.open(BACKGROUND).convert("RGB")
    completed: list[Image.Image] = []
    for index, spec in enumerate(SLIDES, start=1):
        slide = create_slide(index, spec, background)
        slide.save(OUTPUT_DIR / spec["file"], quality=96, optimize=True)
        slide.resize((1290, 2796), Image.Resampling.LANCZOS).save(
            OUTPUT_DIR_69 / spec["file"], quality=96, optimize=True
        )
        completed.append(slide)

    thumb_width = 310
    thumb_height = round(HEIGHT * thumb_width / WIDTH)
    contact = Image.new("RGB", (thumb_width * len(completed), thumb_height), (8, 5, 20))
    for index, slide in enumerate(completed):
        contact.paste(
            slide.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS),
            (index * thumb_width, 0),
        )
    contact.save(OUTPUT_DIR.parent / "contact-sheet.png", quality=94)
    print(f"Created {len(completed)} screenshots in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
