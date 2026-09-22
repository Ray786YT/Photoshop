"""Place the healed portrait on the cover canvas and grade it."""
import sys, numpy as np, cv2
sys.path.insert(0, '/home/user/Photoshop/build')
from cover_lib import W, H, curve, gradient_map, vignette

SCALE, OX, OY = 1.61, -37, 430

# landmark helpers (source-image coords -> canvas coords)
def px(x): return int(round(x * SCALE + OX))
def py(y): return int(round(y * SCALE + OY))

CURVE = [(0,0), (60,10), (110,26), (145,58), (175,142),
         (205,196), (230,242), (255,255)]

DUOTONE = [(0.00, (  6,  8, 14)),
           (0.30, ( 26, 34, 48)),
           (0.58, (108,118,126)),
           (0.82, (205,210,206)),
           (1.00, (244,246,242))]

ORIGINAL = '/tmp/claude-0/-home-user-Photoshop/45f1edd2-7a36-559b-9b48-a5201ed1e6ac/images/1.webp'
HEALED   = '/tmp/wk/healed.png'

def build(src_path=HEALED):
    src = cv2.imread(src_path)
    sh, sw = src.shape[:2]
    big = cv2.resize(src, (int(sw*SCALE), int(sh*SCALE)), interpolation=cv2.INTER_LANCZOS4)

    # paste onto the canvas, letting the frame crop it
    canvas = np.zeros((H, W, 3), np.uint8)
    canvas[:] = np.median(big[:20, :20], axis=(0,1)).astype(np.uint8)
    x0, y0 = OX, OY
    sx0, sy0 = max(0,-x0), max(0,-y0)
    dx0, dy0 = max(0,x0), max(0,y0)
    cw = min(big.shape[1]-sx0, W-dx0)
    ch = min(big.shape[0]-sy0, H-dy0)
    canvas[dy0:dy0+ch, dx0:dx0+cw] = big[sy0:sy0+ch, sx0:sx0+cw]
    # fill any sliver above the pasted area with backdrop grey
    if dy0 > 0: canvas[:dy0] = canvas[dy0:dy0+1]

    gray = cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY)
    toned = curve(gray, CURVE)

    v = vignette((H, W), W*0.5, py(1050), W*0.62, H*0.52, 0.74, 0.95)
    toned = np.clip(toned.astype(np.float32) * v, 0, 255).astype(np.uint8)

    rgb = gradient_map(toned, DUOTONE)
    return rgb, toned

if __name__ == '__main__':
    rgb, lum = build()
    cv2.imwrite('/tmp/wk/graded.png', cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    cv2.imwrite('/tmp/wk/graded_prev.png',
                cv2.resize(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), (620,802),
                           interpolation=cv2.INTER_AREA))
    print('landmarks: headtop',py(130),'eyes',py(742),'mouth',py(1150),
          'chin',py(1340),'shoulder',py(1500),'facecx',px(815))


def place_rgb(src_path=ORIGINAL):
    """The source photo on the cover canvas, same transform, no grading."""
    src = cv2.imread(src_path)
    sh, sw = src.shape[:2]
    big = cv2.resize(src, (int(sw*SCALE), int(sh*SCALE)), interpolation=cv2.INTER_LANCZOS4)
    canvas = np.zeros((H, W, 3), np.uint8)
    canvas[:] = np.median(big[:20, :20], axis=(0,1)).astype(np.uint8)
    sx0, sy0 = max(0,-OX), max(0,-OY)
    dx0, dy0 = max(0,OX), max(0,OY)
    cw = min(big.shape[1]-sx0, W-dx0)
    ch = min(big.shape[0]-sy0, H-dy0)
    canvas[dy0:dy0+ch, dx0:dx0+cw] = big[sy0:sy0+ch, sx0:sx0+cw]
    if dy0 > 0: canvas[:dy0] = canvas[dy0:dy0+1]
    return cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
