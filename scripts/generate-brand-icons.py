from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src" / "renderer" / "icons"
MASTER_SIZE = 1024


def build_master():
    image = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle(
        (36, 36, 988, 988),
        radius=228,
        fill=(7, 22, 32, 255),
        outline=(118, 228, 211, 58),
        width=5,
    )
    draw.rounded_rectangle(
        (74, 74, 950, 950),
        radius=190,
        fill=(10, 31, 43, 255),
    )

    white = (244, 251, 253, 255)
    teal = (118, 228, 211, 255)
    saffron = (255, 173, 66, 255)

    draw.polygon(
        [
            (274, 220), (684, 220), (684, 346), (424, 346),
            (424, 480), (642, 480), (642, 600), (424, 600),
            (424, 818), (274, 818),
        ],
        fill=white,
    )

    path = [(407, 672), (533, 544), (628, 625), (774, 450)]
    draw.line(path, fill=teal, width=66, joint="curve")
    for point in path:
        x, y = point
        draw.ellipse((x - 33, y - 33, x + 33, y + 33), fill=teal)
    draw.line((714, 450, 804, 450), fill=teal, width=66)
    draw.line((774, 450, 774, 540), fill=teal, width=66)
    draw.ellipse((246, 766, 340, 860), fill=saffron)
    return image


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    master = build_master()
    master.save(ICON_DIR / "brand-mark-1024.png", optimize=True)

    images = {}
    for size in [16, 24, 32, 48, 64, 128, 256, 512]:
        images[size] = master.resize((size, size), Image.Resampling.LANCZOS)
        if size in (16, 32, 48, 128):
            images[size].save(ICON_DIR / f"icon{size}.png", optimize=True)

    images[256].save(
        ICON_DIR / "fwd-bharat-marketdesk.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
        append_images=[images[128], images[64], images[48], images[32], images[24], images[16]],
    )
    images[512].save(ICON_DIR / "fwd-bharat-marketdesk.png", optimize=True)


if __name__ == "__main__":
    main()
