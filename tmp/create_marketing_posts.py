from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH = 1080
HEIGHT = 1080
OUTPUT_DIR = Path('/Users/razmaz/Desktop/code/free_time/medium/SayBack/public/marketing-posts')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
FONT_REGULAR = '/System/Library/Fonts/Supplemental/Arial.ttf'


def mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


def make_gradient(stops: list[tuple[float, tuple[int, int, int]]], diagonal: bool = True) -> Image.Image:
    img = Image.new('RGB', (WIDTH, HEIGHT))
    px = img.load()

    for y in range(HEIGHT):
        for x in range(WIDTH):
            if diagonal:
                t = (x / (WIDTH - 1) * 0.58) + (y / (HEIGHT - 1) * 0.42)
            else:
                t = y / (HEIGHT - 1)

            t = max(0.0, min(1.0, t))

            for i in range(len(stops) - 1):
                left_t, left_c = stops[i]
                right_t, right_c = stops[i + 1]
                if left_t <= t <= right_t:
                    local_t = 0.0 if right_t == left_t else (t - left_t) / (right_t - left_t)
                    px[x, y] = mix(left_c, right_c, local_t)
                    break
            else:
                px[x, y] = stops[-1][1]

    return img


def draw_rtl_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    x_right: int,
    y_top: int,
    max_width: int,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    line_spacing: int,
) -> int:
    words = text.split()
    lines: list[str] = []
    line = ''
    for word in words:
        candidate = word if not line else f"{line} {word}"
        bbox = draw.textbbox((0, 0), candidate, font=font, direction='rtl', language='he')
        width = bbox[2] - bbox[0]
        if width <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)

    y = y_top
    for entry in lines:
        draw.text(
            (x_right, y),
            entry,
            font=font,
            fill=fill,
            anchor='rt',
            direction='rtl',
            language='he',
        )
        bbox = draw.textbbox((0, 0), entry, font=font, direction='rtl', language='he')
        y += (bbox[3] - bbox[1]) + line_spacing

    return y


def draw_badge(draw: ImageDraw.ImageDraw, text: str, x_right: int, y_top: int, font: ImageFont.FreeTypeFont) -> int:
    bbox = draw.textbbox((0, 0), text, font=font, direction='rtl', language='he')
    w = (bbox[2] - bbox[0]) + 56
    h = (bbox[3] - bbox[1]) + 28

    left = x_right - w
    top = y_top
    right = x_right
    bottom = y_top + h

    draw.rounded_rectangle((left, top, right, bottom), radius=40, fill=(11, 18, 32, 130), outline=(255, 255, 255, 160), width=2)
    draw.text((x_right - 28, y_top + 13), text, font=font, fill=(245, 250, 255), anchor='rt', direction='rtl', language='he')
    return bottom + 42


def draw_cta(draw: ImageDraw.ImageDraw, text: str, x_right: int, y_top: int, font: ImageFont.FreeTypeFont, bg: tuple[int, int, int], fg: tuple[int, int, int]) -> None:
    bbox = draw.textbbox((0, 0), text, font=font, direction='rtl', language='he')
    w = (bbox[2] - bbox[0]) + 52
    h = (bbox[3] - bbox[1]) + 28

    left = x_right - w
    right = x_right
    bottom = y_top + h
    draw.rounded_rectangle((left, y_top, right, bottom), radius=28, fill=bg)
    draw.text((x_right - 24, y_top + 13), text, font=font, fill=fg, anchor='rt', direction='rtl', language='he')


def add_decorations(img: Image.Image, idx: int) -> None:
    overlay = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    if idx == 1:
        d.ellipse((690, 40, 1180, 530), outline=(255, 255, 255, 70), width=24)
        d.ellipse((760, 110, 1110, 460), outline=(255, 255, 255, 45), width=16)
    elif idx == 2:
        for y in range(640, 1160, 48):
            d.line((440, y, 1180, y - 180), fill=(255, 255, 255, 70), width=3)
        for x in range(400, 1180, 56):
            d.line((x, 640, x + 220, 1160), fill=(255, 255, 255, 35), width=2)
    elif idx == 3:
        d.polygon([(0, 140), (370, -40), (470, 330), (120, 460)], fill=(255, 255, 255, 52))
        d.ellipse((-90, 690, 430, 1180), fill=(255, 255, 255, 35))
    elif idx == 4:
        for i in range(8):
            y = 690 + i * 52
            d.rounded_rectangle((360 + i * 14, y, 1180, y + 28), radius=16, fill=(255, 255, 255, 58 - i * 4))
    else:
        d.ellipse((-130, -130, 450, 450), fill=(255, 255, 255, 90))
        d.ellipse((590, 660, 1280, 1360), fill=(255, 255, 255, 30))

    img.alpha_composite(overlay)


def create_post(
    idx: int,
    title: str,
    subtitle: str,
    badge: str,
    cta: str,
    brand: str,
    stops: list[tuple[float, tuple[int, int, int]]],
    cta_bg: tuple[int, int, int],
    cta_fg: tuple[int, int, int],
) -> None:
    bg = make_gradient(stops).convert('RGBA')
    add_decorations(bg, idx)

    # Add subtle vignette for contrast
    vignette = Image.new('L', (WIDTH, HEIGHT), 0)
    dv = ImageDraw.Draw(vignette)
    dv.ellipse((-220, -150, WIDTH + 220, HEIGHT + 280), fill=210)
    vignette = vignette.filter(ImageFilter.GaussianBlur(120))
    bg = Image.composite(bg, Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 255)), vignette)

    draw = ImageDraw.Draw(bg, 'RGBA')

    font_badge = ImageFont.truetype(FONT_BOLD, 40)
    font_title = ImageFont.truetype(FONT_BOLD, 126)
    font_sub = ImageFont.truetype(FONT_REGULAR, 54)
    font_cta = ImageFont.truetype(FONT_BOLD, 46)
    font_brand = ImageFont.truetype(FONT_BOLD, 38)

    x_right = WIDTH - 92
    y = 86

    y = draw_badge(draw, badge, x_right, y, font_badge)
    y = draw_rtl_wrapped(draw, title, x_right, y, max_width=820, font=font_title, fill=(250, 253, 255), line_spacing=10)
    y += 16
    draw_rtl_wrapped(draw, subtitle, x_right, y, max_width=860, font=font_sub, fill=(232, 241, 250), line_spacing=13)

    draw_cta(draw, cta, x_right, HEIGHT - 220, font_cta, cta_bg, cta_fg)
    draw.text((x_right, HEIGHT - 108), brand, font=font_brand, fill=(242, 247, 252), anchor='rt', direction='rtl', language='he')

    out = OUTPUT_DIR / f'sayback-post-{idx}.png'
    bg.convert('RGB').save(out, format='PNG', optimize=True)


def main() -> None:
    posts = [
        {
            'idx': 1,
            'badge': 'שיחה חכמה תוך שניות',
            'title': 'נתקעת על הודעה?',
            'subtitle': 'SayBack מייצר לך 3 תשובות טבעיות ומדויקות, מוכנות לשליחה.',
            'cta': 'נסו עכשיו',
            'brand': 'sayback.co.il',
            'stops': [(0.0, (118, 18, 44)), (0.52, (221, 39, 84)), (1.0, (17, 24, 39))],
            'cta_bg': (255, 245, 248),
            'cta_fg': (127, 29, 29),
        },
        {
            'idx': 2,
            'badge': 'יותר תוצאות, פחות זמן',
            'title': 'משיבים מהר יותר',
            'subtitle': 'מפסיקים להתלבט על ניסוח. מקבלים תשובות חכמות ושומרים על זרימה בצ׳אט.',
            'cta': 'שדרגו את השיחה',
            'brand': 'SayBack',
            'stops': [(0.0, (5, 46, 22)), (0.45, (16, 84, 49)), (1.0, (15, 23, 42))],
            'cta_bg': (187, 247, 208),
            'cta_fg': (20, 83, 45),
        },
        {
            'idx': 3,
            'badge': 'מתחילים בלי סיכון',
            'title': '3 שימושים ראשונים חינם',
            'subtitle': 'תנסו על שיחה אמיתית, תרגישו את הקצב, ותבינו כמה קל לענות נכון.',
            'cta': 'לנסות חינם',
            'brand': 'SayBack • עברית מלאה',
            'stops': [(0.0, (30, 27, 75)), (0.5, (67, 56, 202)), (1.0, (147, 197, 253))],
            'cta_bg': (248, 250, 252),
            'cta_fg': (49, 46, 129),
        },
        {
            'idx': 4,
            'badge': 'שליטה בטון התשובה',
            'title': 'עדין, חד או מחדש',
            'subtitle': 'בלחיצה אחת משנים סגנון: softer, sharper או retry עד שיושב בדיוק.',
            'cta': 'נסחו כמו מקצוענים',
            'brand': 'SayBack AI',
            'stops': [(0.0, (17, 24, 39)), (0.52, (14, 165, 233)), (1.0, (219, 234, 254))],
            'cta_bg': (8, 47, 73),
            'cta_fg': (219, 234, 254),
        },
        {
            'idx': 5,
            'badge': 'זרימת עבודה פשוטה',
            'title': 'הודעה נכנסת. תשובה יוצאת.',
            'subtitle': 'מזהים כוונה, מקבלים 3 הצעות, בוחרים ושולחים. מהיר, ברור ובלי תקיעות.',
            'cta': 'להתחיל היום',
            'brand': 'sayback.co.il',
            'stops': [(0.0, (24, 24, 27)), (0.52, (82, 82, 91)), (1.0, (244, 244, 245))],
            'cta_bg': (250, 250, 250),
            'cta_fg': (24, 24, 27),
        },
    ]

    for p in posts:
        create_post(**p)


if __name__ == '__main__':
    main()
