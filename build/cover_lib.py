"""Shared helpers for building the PROMPT magazine cover."""
import sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, '/home/user/Photoshop/tools')

W, H = 2550, 3300                      # 8.5in x 11in @ 300ppi
FONTS = '/home/user/Photoshop/assets/fonts'
ACID = (184, 255, 60)
PAPER = (232, 236, 230)

def font(name, size):
    return ImageFont.truetype(f'{FONTS}/{name}', size)

def blank():
    return Image.new('RGBA', (W, H), (0, 0, 0, 0))

def ls_width(text, f, ls=0.0):
    if not text: return 0.0
    return sum(f.getlength(c) for c in text) + ls * (len(text) - 1)

def draw_ls(d, x, y, text, f, fill, ls=0.0, anchor='ls'):
    """Draw text with manual letterspacing; y is the baseline."""
    for c in text:
        d.text((x, y), c, font=f, fill=fill, anchor=anchor)
        x += f.getlength(c) + ls
    return x

def draw_ls_centered(d, cx, y, text, f, fill, ls=0.0):
    return draw_ls(d, cx - ls_width(text, f, ls) / 2, y, text, f, fill, ls)

def draw_ls_right(d, rx, y, text, f, fill, ls=0.0):
    return draw_ls(d, rx - ls_width(text, f, ls), y, text, f, fill, ls)

# ---------------------------------------------------------------- tone tools

def curve(img, pts):
    """Apply a smooth monotonic tone curve given (input, output) control points."""
    xs = np.array([p[0] for p in pts], np.float32)
    ys = np.array([p[1] for p in pts], np.float32)
    lut = np.interp(np.arange(256), xs, ys).astype(np.float32)
    # soften the piecewise-linear joints so no kink shows up as a banding edge
    lut = cv2.GaussianBlur(lut.reshape(-1, 1), (0, 0), 3.0).reshape(-1)
    return cv2.LUT(img.astype(np.uint8), np.clip(lut, 0, 255).astype(np.uint8))

def gradient_map(gray, stops):
    """Map an 8-bit luminance array through a colour ramp -> RGB uint8."""
    pos = np.array([s[0] for s in stops], np.float32) * 255.0
    ramp = np.zeros((256, 3), np.float32)
    for ch in range(3):
        ramp[:, ch] = np.interp(np.arange(256),
                                pos, [s[1][ch] for s in stops])
    return ramp[gray].astype(np.uint8)

def vignette(shape, cx, cy, rx, ry, strength, softness=1.0):
    """Radial falloff map in [1-strength, 1]."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    v = np.clip((r - 1.0) / max(softness, 1e-6), 0, 1)
    v = v * v * (3 - 2 * v)                       # smoothstep
    return (1.0 - strength * v).astype(np.float32)
