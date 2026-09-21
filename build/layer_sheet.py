"""Render every layer inside the saved .psd on its own, as proof they are separate."""
import sys
from PIL import Image, ImageDraw
from psd_tools import PSDImage
sys.path.insert(0, '/home/user/Photoshop/build')
from cover_lib import font

psd = PSDImage.open('/home/user/Photoshop/out/PROMPT_cover.psd')
W, H = psd.size

def checker(size, sq=14):
    """Transparency checkerboard so empty areas are obvious."""
    im = Image.new('RGB', size, (78, 82, 90))
    d = ImageDraw.Draw(im)
    for y in range(0, size[1], sq):
        for x in range(0, size[0], sq):
            if (x // sq + y // sq) % 2 == 0:
                d.rectangle([x, y, x + sq - 1, y + sq - 1], fill=(96, 100, 108))
    return im

items = []
def walk(node, path=''):
    for l in node:
        if l.is_group():
            walk(l, f'{path}{l.name} / ')
        else:
            items.append((path + l.name, l))
walk(psd)

TW = 430
TH = int(TW * H / W)
COLS, GAP, PAD, CAP = 5, 26, 44, 62
rows = (len(items) + COLS - 1) // COLS
Wd = PAD*2 + COLS*TW + (COLS-1)*GAP
Ht = PAD*2 + 110 + rows*(TH+CAP) + (rows-1)*GAP

sheet = Image.new('RGB', (Wd, Ht), (16, 18, 24))
d = ImageDraw.Draw(sheet)
d.text((PAD, PAD), 'PROMPT_cover.psd — every layer, isolated',
       font=font('Manrope-ExtraBold.ttf', 40), fill=(238, 241, 237))
d.text((PAD, PAD+54), f'{len(items)} layers in 6 groups · read straight out of the .psd file',
       font=font('Manrope-Medium.ttf', 24), fill=(150, 200, 90))

fl = font('Manrope-Medium.ttf', 19)
for i, (name, layer) in enumerate(items):
    r, c = divmod(i, COLS)
    x = PAD + c*(TW+GAP)
    y = PAD + 110 + r*(TH+CAP+GAP)

    cell = checker((TW, TH))
    pil = layer.topil()
    if pil is not None:
        full = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        full.paste(pil.convert('RGBA'), (layer.offset[0], layer.offset[1]))
        cell.paste(full.resize((TW, TH), Image.LANCZOS),
                   (0, 0), full.resize((TW, TH), Image.LANCZOS))
    sheet.paste(cell, (x, y))
    d.rectangle([x, y, x+TW-1, y+TH-1], outline=(70, 76, 86))

    tag = name if layer.visible else name + '   (hidden)'
    for j, line in enumerate([tag[:44], tag[44:88]]):
        if line:
            d.text((x, y+TH+8+j*23), line, font=fl,
                   fill=(200, 206, 200) if layer.visible else (140, 146, 140))

sheet.save('/home/user/Photoshop/out/PROMPT_layers_proof.jpg', quality=90, subsampling=0)
print('layers rendered:', len(items), sheet.size)
