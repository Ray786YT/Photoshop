"""Export progressive stage JPGs to evidence the build process."""
import sys, os, cv2, numpy as np
from PIL import Image
sys.path.insert(0, '/home/user/Photoshop/build')
sys.path.insert(0, '/home/user/Photoshop/tools')
import grade, build_cover
from psd_writer import PSD, Layer, Group
from cover_lib import W, H

OUT = '/home/user/Photoshop/out/process'
os.makedirs(OUT, exist_ok=True)

def place(path):
    """Put a source image on the cover canvas using the same transform."""
    src = cv2.imread(path); sh, sw = src.shape[:2]
    big = cv2.resize(src, (int(sw*grade.SCALE), int(sh*grade.SCALE)),
                     interpolation=cv2.INTER_LANCZOS4)
    c = np.zeros((H, W, 3), np.uint8)
    c[:] = np.median(big[:20, :20], axis=(0,1)).astype(np.uint8)
    x0, y0 = grade.OX, grade.OY
    sx0, sy0 = max(0,-x0), max(0,-y0); dx0, dy0 = max(0,x0), max(0,y0)
    cw = min(big.shape[1]-sx0, W-dx0); ch = min(big.shape[0]-sy0, H-dy0)
    c[dy0:dy0+ch, dx0:dx0+cw] = big[sy0:sy0+ch, sx0:sx0+cw]
    if dy0 > 0: c[:dy0] = c[dy0:dy0+1]
    return Image.fromarray(cv2.cvtColor(c, cv2.COLOR_BGR2RGB))

def save(img, name):
    img.save(f'{OUT}/{name}.jpg', quality=92, dpi=(300, 300), subsampling=0)
    print('wrote', name)

# stage 1-2: raw source, then the heal, both untouched by the grade
save(place(grade.ORIGINAL), '01_source_photo')
save(place(grade.HEALED),  '02_mouth_removed')

# stage 3+: rebuild the document and reveal one group at a time
_, doc = build_cover.build_doc()          # preview stack: grade already applied
groups = [n for n in doc.nodes if isinstance(n, Group)]
order = ['03_curves_and_gradient_map', '04_bottom_fade', '05_autocomplete_bar',
         '06_masthead', '07_cover_lines', '08_final']
for g in groups:
    g.visible = False
for i, g in enumerate(groups):
    g.visible = True
    if i >= 1:                      # skip the bare background fill
        save(doc.render(), order[i-1])
