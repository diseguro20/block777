from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1] / "public"
COLORS = ("#ffcf2e", "#28caff", "#ff4f8e", "#835dff")


def make_icon(size: int, destination: str) -> None:
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGB", (canvas_size, canvas_size), "#06174a")

    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    radius = int(canvas_size * 0.37)
    center = canvas_size // 2
    glow_draw.ellipse(
        (center - radius, center - radius, center + radius, center + radius),
        fill=(23, 221, 207, 72),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(int(canvas_size * 0.12)))
    image = Image.alpha_composite(image.convert("RGBA"), glow)

    unit = int(canvas_size * 0.185)
    gap = int(canvas_size * 0.028)
    mark_size = unit * 2 + gap
    mark = Image.new("RGBA", (mark_size, mark_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(mark)
    positions = ((0, 0), (unit + gap, 0), (0, unit + gap), (unit + gap, unit + gap))
    corner = int(unit * 0.13)

    for (x, y), color in zip(positions, COLORS):
        draw.rounded_rectangle((x, y, x + unit, y + unit), radius=corner, fill=color)
        inset = max(2, int(unit * 0.045))
        draw.line((x + corner, y + inset, x + unit - corner, y + inset), fill=(255, 255, 255, 125), width=inset)

    mark = mark.rotate(45, resample=Image.Resampling.BICUBIC, expand=True)
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_x = (canvas_size - mark.width) // 2
    shadow_y = (canvas_size - mark.height) // 2 + int(canvas_size * 0.025)
    shadow.paste((0, 0, 0, 190), (shadow_x, shadow_y), mark.getchannel("A"))
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(canvas_size * 0.035)))
    image = Image.alpha_composite(image, shadow)
    image.alpha_composite(mark, ((canvas_size - mark.width) // 2, (canvas_size - mark.height) // 2))

    image.resize((size, size), Image.Resampling.LANCZOS).convert("RGB").save(
        ROOT / destination, "PNG", optimize=True
    )


make_icon(180, "apple-touch-icon.png")
make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
