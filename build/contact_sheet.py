"""Lay the eight process stages out on one sheet for the process-work submission."""
import glob, os
from PIL import Image, ImageDraw, ImageFont
import sys; sys.path.insert(0,'/home/user/Photoshop/build')
from cover_lib import font

files = sorted(glob.glob('/home/user/Photoshop/out/process/*.jpg'))
COLS, TW = 4, 560
GAP, PAD, CAP = 34, 46, 46
TH = int(TW * 3300 / 2550)
rows = (len(files) + COLS - 1) // COLS
Wd = PAD*2 + COLS*TW + (COLS-1)*GAP
Ht = PAD*2 + 96 + rows*(TH+CAP) + (rows-1)*GAP

sheet = Image.new('RGB', (Wd, Ht), (18, 20, 26))
d = ImageDraw.Draw(sheet)
d.text((PAD, PAD), 'PROMPT — PROCESS WORK', font=font('Manrope-ExtraBold.ttf', 44),
       fill=(238, 241, 237))
d.text((PAD, PAD+56), 'Magazine cover build, stage by stage',
       font=font('Manrope-Medium.ttf', 26), fill=(150, 200, 90))

f = font('Manrope-Medium.ttf', 22)
for i, p in enumerate(files):
    r, c = divmod(i, COLS)
    x = PAD + c*(TW+GAP)
    y = PAD + 96 + r*(TH+CAP+GAP)
    sheet.paste(Image.open(p).resize((TW, TH), Image.LANCZOS), (x, y))
    d.rectangle([x, y, x+TW-1, y+TH-1], outline=(60, 66, 76))
    label = os.path.basename(p)[:-4].replace('_', ' ')
    d.text((x, y+TH+12), label, font=f, fill=(196, 203, 196))

sheet.save('/home/user/Photoshop/out/PROMPT_process_sheet.jpg', quality=92, subsampling=0)
print('sheet', sheet.size)
