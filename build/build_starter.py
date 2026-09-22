"""Starter .psd: layout finished, photo manipulation left for the student.

The portrait is the untouched original (mouth still there, no colour grade)
and the autocomplete bar is flat. The student removes the mouth, adds the
Curves and Gradient Map adjustment layers, and applies Displace to the bar
themselves in Photoshop - see the Finish-It-Yourself guide.
"""
import sys, numpy as np
from PIL import Image
sys.path.insert(0, '/home/user/Photoshop/build')
sys.path.insert(0, '/home/user/Photoshop/tools')
import grade, build_cover as bc
from psd_writer import PSD, Layer, Group
from cover_lib import W, H

def main():
    photo = grade.place_rgb(grade.ORIGINAL)
    rgba = Image.fromarray(np.dstack([photo, np.full((H, W), 255, np.uint8)]), 'RGBA')
    _, lum = grade.build()                      # only needed for layer geometry

    doc = PSD(W, H, 300.0)
    doc.add(Group('00 BACKGROUND', [Layer('Base fill',
                                          Image.new('RGBA', (W, H), (8, 10, 16, 255)))]))
    doc.add(Group('01 PORTRAIT', [Layer('Portrait - original photo', rgba)]))
    doc.add(Group('02 GRADE', [bc.scrim_layer()]))
    doc.add(Group('03 AUTOCOMPLETE BAR', bc.bar_layers(lum, warp=False)))
    doc.add(Group('04 MASTHEAD', bc.masthead_layers()))
    doc.add(Group('05 COVER LINES', bc.text_layers()))
    doc.add(Group('06 FOOTER', [bc.barcode_layer()]))

    flat = doc.render()
    doc.save('/home/user/Photoshop/out/PROMPT_STARTER.psd', composite=flat)
    flat.save('/home/user/Photoshop/out/PROMPT_STARTER_preview.jpg', quality=90, dpi=(300, 300))
    flat.resize((640, 828), Image.LANCZOS).save(
        '/tmp/claude-0/-home-user-Photoshop/45f1edd2-7a36-559b-9b48-a5201ed1e6ac/scratchpad/starter_prev.png')
    print('starter written')

if __name__ == '__main__':
    main()
