"""Build the PROMPT magazine cover as a layered .psd plus a 300ppi .jpg."""
import sys, numpy as np, cv2
from PIL import Image, ImageDraw
sys.path.insert(0, '/home/user/Photoshop/build')
sys.path.insert(0, '/home/user/Photoshop/tools')

from cover_lib import (W, H, ACID, PAPER, font, blank, ls_width,
                       draw_ls, draw_ls_centered, draw_ls_right)
from psd_writer import PSD, Layer, Group
import grade

NAME = 'RAYYAN ALI'
DATE = 'SEPTEMBER 18, 2026'

# ------------------------------------------------------------------ helpers

def L(name, img, **kw):
    """Crop an RGBA canvas to its content and wrap it as a PSD layer."""
    bb = img.getbbox()
    if bb is None:
        bb = (0, 0, 1, 1)
    return Layer(name, img.crop(bb), left=bb[0], top=bb[1], **kw)

def displace(img, lum, amp_x=20.0, amp_y=11.0, sigma=30.0):
    """Photoshop-style Displace: warp `img` through a blurred luminance map."""
    arr = np.array(img)
    m = cv2.GaussianBlur(lum.astype(np.float32), (0, 0), sigma)
    d = (m - 128.0) / 128.0
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    mx = (xx + d * amp_x).astype(np.float32)
    my = (yy + d * amp_y).astype(np.float32)
    out = cv2.remap(arr, mx, my, cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    return Image.fromarray(out, 'RGBA')

def shade(img, lum, floor=0.72, gain=0.46):
    """Let the artwork underneath modulate the overlay's brightness.

    The luminance is blurred first so only the broad lighting transfers -
    otherwise the skin's grain shows through the plastic of the UI plate.
    """
    arr = np.array(img).astype(np.float32)
    soft = cv2.GaussianBlur(lum.astype(np.float32), (0, 0), 9.0)
    f = floor + gain * (soft / 255.0)
    arr[..., :3] *= np.clip(f, 0, 1.25)[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')

# ------------------------------------------------------------------- layout

BX0, BX1, BY0, BY1 = 760, 1790, 2200, 2370
WORDS = ["I'm", 'fine', 'thanks']
CELL = (BX1 - BX0) / 3.0

def bar_layers(lum, warp=True):
    cy = (BY0 + BY1) // 2

    shadow = blank()
    ImageDraw.Draw(shadow).rounded_rectangle(
        [BX0 - 6, BY0 + 14, BX1 + 6, BY1 + 26], radius=26, fill=(0, 0, 0, 170))
    shadow = shadow.filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(22))

    plate = blank()
    ImageDraw.Draw(plate).rounded_rectangle(
        [BX0, BY0, BX1, BY1], radius=20, fill=(226, 230, 224, 247))

    divs = blank()
    dd = ImageDraw.Draw(divs)
    for i in (1, 2):
        x = BX0 + CELL * i
        dd.rectangle([x - 1, BY0 + 42, x + 1, BY1 - 42], fill=(150, 157, 150, 235))

    sel = blank()
    ImageDraw.Draw(sel).rounded_rectangle(
        [BX0 + CELL + 10, BY0 + 12, BX0 + 2 * CELL - 10, BY1 - 12],
        radius=12, fill=ACID + (255,))

    words = blank()
    wd = ImageDraw.Draw(words)
    f = font('Manrope-Medium.ttf', 70)
    for i, w in enumerate(WORDS):
        wd.text((BX0 + CELL * (i + 0.5), cy), w, font=f,
                fill=(16, 19, 24, 255), anchor='mm')

    out = []
    for nm, im, sh in (('Bar drop shadow', shadow, False),
                       ('Bar plate', plate, True),
                       ('Cell dividers', divs, True),
                       ('Suggestion - selected', sel, True),
                       ('Suggested words', words, True)):
        if warp:
            im = displace(im, lum)
            if sh:
                im = shade(im, lum)
        out.append(L(nm, im))
    return out

def masthead_layers():
    mh = blank(); d = ImageDraw.Draw(mh)
    draw_ls_centered(d, W // 2, 574, 'PROMPT',
                     font('Manrope-ExtraBold.ttf', 520), (244, 246, 242, 255), 6)

    sl = blank(); d = ImageDraw.Draw(sl)
    draw_ls_centered(d, W // 2, 152, 'FOR PEOPLE WHO STILL FINISH THEIR OWN THOUGHTS',
                     font('Manrope-Medium.ttf', 36), (198, 205, 198, 255), 14)

    rl = blank()
    ImageDraw.Draw(rl).rectangle([246, 600, 2304, 603], fill=ACID + (255,))
    return [L('Masthead - PROMPT', mh), L('Selling line', sl), L('Rule', rl)]

def coverline(x, base, kicker, lines, align='left'):
    img = blank(); d = ImageDraw.Draw(img)
    kf = font('Manrope-ExtraBold.ttf', 30)
    hf = font('Roboto-Black.ttf', 54)
    put = draw_ls_right if align == 'right' else draw_ls
    put(d, x, base, kicker, kf, ACID + (255,), 8)
    for i, ln in enumerate(lines):
        put(d, x, base + 70 + i * 62, ln, hf, (238, 241, 237, 255), 0)
    return img

def text_layers():
    out = []
    out.append(L('Cover line - ESSAY',
                 coverline(110, 950, 'ESSAY',
                           ['THE DEATH', 'OF THE', 'FIRST DRAFT'])))
    out.append(L('Cover line - REPORT',
                 coverline(110, 1420, 'REPORT',
                           ['INSIDE THE', 'PREDICTION', 'ENGINE'])))
    out.append(L('Cover line - PLUS',
                 coverline(2440, 980, 'PLUS',
                           ['37 PHRASES', "YOU'LL NEVER", 'CHOOSE AGAIN'], 'right')))

    main = blank(); d = ImageDraw.Draw(main)
    mf = font('Roboto-Black.ttf', 175)
    draw_ls(d, 110, 2960, 'FINISH MY', mf, (244, 246, 242, 255), -2)
    draw_ls(d, 110, 3145, 'SENTENCE.', mf, ACID + (255,), -2)
    out.append(L('Main cover line', main))

    dl = blank(); d = ImageDraw.Draw(dl)
    draw_ls(d, 110, 3232, f'{DATE}  ·  VOL 01 / ISSUE 09  ·  {NAME}',
            font('Manrope-Medium.ttf', 30), (206, 213, 206, 255), 8)
    out.append(L('Dateline', dl))
    return out

def scrim_layer():
    """Linear darkening across the foot of the cover so footer type reads."""
    top, strength = 2680, 0.86
    ramp = np.zeros((H, W, 4), np.uint8)
    ys = np.clip((np.arange(H) - top) / float(H - top), 0, 1)
    ys = ys * ys * (3 - 2 * ys)
    ramp[..., 3] = (ys * 255 * strength).astype(np.uint8)[:, None]
    ramp[..., :3] = np.array([6, 8, 14], np.uint8)
    return L('Bottom fade', Image.fromarray(ramp, 'RGBA'))

def barcode_layer():
    img = blank(); d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 2150, 3060, 2440, 3232
    d.rectangle([x0, y0, x1, y1], fill=(236, 238, 234, 255))
    rng = np.random.default_rng(11)
    x = x0 + 16
    while x < x1 - 16:
        w = int(rng.integers(3, 10))
        if x + w > x1 - 16:
            break
        d.rectangle([x, y0 + 14, x + w - 1, y1 - 40], fill=(14, 16, 20, 255))
        x += w + int(rng.integers(3, 9))
    d.text(((x0 + x1) / 2, y1 - 22), '9 771234 567890', font=font('Manrope-Medium.ttf', 24),
           fill=(14, 16, 20, 255), anchor='mm')
    return L('Barcode', img)

# --------------------------------------------------------------------- main

def curves_block(points):
    """'curv' payload exactly as Photoshop writes it: a legacy v1 section plus
    the v4 'Crv ' extra section, one composite (RGB) curve, points stored as
    (output, input)."""
    from psd_tools.psd.adjustments import Curves, CurvesExtraMarker, CurvesExtraItem
    pts = [(out, inp) for inp, out in points]
    return Curves(is_map=False, version=1, count_map=1, data=[pts],
                  extra=CurvesExtraMarker(version=4, items=[CurvesExtraItem(0, pts)])
                  ).tobytes()

def gradient_map_block(stops, name='Custom'):
    """'grdm' payload matching Photoshop's own Gradient Map layers: 16-bit RGB
    colour stops at 0-4096, midpoints 50, fully opaque, Smoothness 100%."""
    from psd_tools.psd.adjustments import GradientMap, ColorStop, TransparencyStop
    cs = [ColorStop(int(round(t * 4096)), 50, 0,
                    (c[0] * 257, c[1] * 257, c[2] * 257, 0)) for t, c in stops]
    ts = [TransparencyStop(0, 50, 255), TransparencyStop(4096, 50, 255)]
    return GradientMap(version=1, is_reversed=0, is_dithered=0, name=name + '\x00',
                       method=b'Gcls', color_stops=cs, transparency_stops=ts,
                       expansion=2, interpolation=4096, length=32, mode=0,
                       random_seed=691687736, show_transparency=0,
                       use_vector_color=1, roughness=2048, color_model=3,
                       minimum_color=[0, 0, 0, 0],
                       maximum_color=[32768, 32768, 32768, 32768]).tobytes()

def _rgba(rgb):
    return Image.fromarray(np.dstack([rgb, np.full(rgb.shape[:2], 255, np.uint8)]), 'RGBA')

def build_doc():
    """Returns (doc, preview).

    doc is what gets saved: the untouched photo, a separate Content-Aware
    Fill patch, then real Curves and Gradient Map adjustment layers with a
    vignette layer between them. preview is the same stack with that grade
    already applied, used for the flat composite and the .jpg.
    """
    graded, lum = grade.build_ps()
    original = grade.place_rgb(grade.ORIGINAL)
    healed = grade.place_rgb(grade.HEALED)

    # the mouth edit as its own layer: only the pixels the heal changed
    diff = np.abs(original.astype(np.int16) - healed.astype(np.int16)).max(axis=2)
    ys, xs = np.nonzero(diff)
    bx0, by0, bx1, by1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    patch = _rgba(healed[by0:by1, bx0:bx1])

    v = grade.vignette_map()
    vig = np.zeros((H, W, 4), np.uint8)
    vig[..., 3] = np.clip(np.round((1.0 - v) * 255), 0, 255).astype(np.uint8)
    vignette = Image.fromarray(vig, 'RGBA')

    base = Image.new('RGBA', (W, H), (8, 10, 16, 255))
    rest = [Group('02 BOTTOM FADE', [scrim_layer()]),
            Group('03 AUTOCOMPLETE BAR', bar_layers(lum, warp=False)),
            Group('04 MASTHEAD', masthead_layers()),
            Group('05 COVER LINES', text_layers()),
            Group('06 FOOTER', [barcode_layer()])]

    doc = PSD(W, H, 300.0)
    doc.add(Group('00 BACKGROUND', [Layer('Base fill', base)]))
    doc.add(Group('01 PORTRAIT', [
        Layer('Portrait - original photo', _rgba(original)),
        Layer('Mouth removed (Content-Aware Fill)', patch, left=bx0, top=by0),
        Layer('Curves 1', adjustment=(b'curv', curves_block(grade.CURVE_PS))),
        L('Vignette', vignette),
        Layer('Gradient Map 1', adjustment=(b'grdm', gradient_map_block(grade.GRADIENT_MAP))),
    ]))
    for g in rest:
        doc.add(g)

    preview = PSD(W, H, 300.0)
    preview.add(Group('00 BACKGROUND', [Layer('Base fill', base)]))
    preview.add(Group('01 PORTRAIT', [Layer('Portrait - graded', _rgba(graded))]))
    for g in rest:
        preview.add(g)
    return doc, preview

def main():
    doc, preview = build_doc()
    flat = preview.render()
    doc.save('/home/user/Photoshop/out/PROMPT_cover.psd', composite=flat)
    flat.save('/home/user/Photoshop/out/PROMPT_cover.jpg', quality=95,
              dpi=(300, 300), subsampling=0)
    print('done')

if __name__ == '__main__':
    main()
