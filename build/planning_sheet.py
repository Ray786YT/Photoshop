"""Planning sheet in plain, first-person language, matching the student's steps."""
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

NAME = 'Rayyan Ali'
ACCENT = RGBColor(0x2E, 0x5B, 0x2E)

doc = Document()
for s in doc.sections:
    s.top_margin = s.bottom_margin = Inches(0.8)
    s.left_margin = s.right_margin = Inches(0.9)
doc.styles['Normal'].font.name = 'Calibri'
doc.styles['Normal'].font.size = Pt(11)
doc.styles['Normal'].paragraph_format.space_after = Pt(8)

def head(t, size=16):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(t); r.bold = True; r.font.size = Pt(size)
def q(t):
    p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(14)
    r = p.add_run(t); r.bold = True; r.font.color.rgb = ACCENT
def a(t, bullet=False):
    p = doc.add_paragraph(style='List Bullet' if bullet else None); p.add_run(t)
    if not bullet: p.paragraph_format.left_indent = Inches(0.25)

head('MAGAZINE COVER PLANNING SHEET')
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.add_run(f'Student Name: {NAME}').bold = True

q('1. What type of magazine cover are you creating?')
a('Technology / AI. My magazine is about how technology is changing the way people '
  'live and talk to each other.')

q('2. What is the name of your magazine?')
a('PROMPT. A prompt is what you type into an AI, but it also means helping someone '
  'start talking. I liked that it has both meanings.')

q('3. In one sentence, what is the main message of your magazine cover (what is the '
  'main cover line)?')
a('"FINISH MY SENTENCE." - we are letting AI finish our sentences for us, so we are '
  'losing our own voice.')

q('4a. What is your central image going to look like?')
a('A black and white photo of a woman looking straight at the camera. Her mouth is '
  'removed so there is just skin there. Where her mouth used to be, I will put the '
  'word suggestion bar from a phone keyboard. It will say "I\'m | fine | thanks", '
  'with "fine" highlighted in green like the phone already picked it for her.')

q('4b. How are you going to manipulate the image? Be detailed.')
a('Remove the mouth: select it with the Lasso tool, use Content-Aware Fill, then clean '
  'it up with the Spot Healing Brush and Clone Stamp. Content-Aware Fill is my new skill - '
  'I will learn it from a YouTube tutorial.', True)
a('Make the grey background almost black with a Curves adjustment layer.', True)
a('Darken the edges with a black Vignette layer (a big soft Eraser in the middle).', True)
a('Turn the photo dark blue with a Gradient Map adjustment layer.', True)
a('Use the Gradient tool to fade the bottom to black so the bottom text is easy to read.', True)
a('Make the suggestion bar with the Rounded Rectangle tool and the Type tool, and give '
  'it a drop shadow.', True)
a('Use downloaded fonts: Manrope and Roboto from Google Fonts.', True)

q('4c. How is this manipulation enhancing or helping you convey the message?')
a('Taking away her mouth shows she can\'t speak for herself anymore. Putting the '
  'keyboard bar where her mouth should be shows the phone is talking for her. I chose '
  '"I\'m fine thanks" because people say it automatically even when it isn\'t true. '
  'The dark blue makes it feel cold and robotic. The green is the only bright colour, '
  'so your eye goes to the bar first and then down to "SENTENCE."')

q('5. Did Ms. Bensusan discuss your idea with you and give you feedback?')
a('[ Write what Ms. Bensusan said here, and anything you changed because of it. ]')

doc.add_page_break()
head('ELEMENTS AND PRINCIPLES OF DESIGN', 14)

q('Elements of Design')
for t in ['Line - the green line under the title, and the lines between the words in the bar.',
          'Shape - the rounded rectangle bar and the barcode.',
          'Value - a bright face on a very dark background.',
          'Colour - dark blue with one bright green.',
          'Texture - the skin texture on her face.',
          'Space - empty dark space on each side of her head for the cover lines.',
          'Form - her face still looks 3D because of the shadows.']:
    a(t, True)

q('Principles of Design')
for t in ['Balance - her face is in the centre, with text on both sides.',
          'Contrast - bright face against a dark background, and green against blue.',
          'Emphasis - the green bar in the middle is the first thing you notice.',
          'Movement - your eye goes from the title, down her face, to the bar, then to '
          '"FINISH MY SENTENCE."',
          'Repetition - I used the same green on the small headings, the line, the bar and '
          '"SENTENCE."',
          'Unity - I only used two fonts and the same colours everywhere.',
          'Rhythm - the three small cover lines are all set up the same way.']:
    a(t, True)

q('Checklist')
for t in ['8.5" x 11" at 300 ppi, in colour.',
          'Downloaded fonts: Manrope and Roboto.',
          'Masthead, selling line, main cover line, three more cover lines, dateline with my '
          'name, and a barcode.',
          'Layers organised into named folders.',
          'Selection tool: Lasso. Editing tools: Clone Stamp, Spot Healing Brush, resizing.',
          'Colour tools: Curves and Gradient Map adjustment layers.',
          'New skill learned on my own: Content-Aware Fill.']:
    a(t, True)

doc.save('/home/user/Photoshop/out/PROMPT_planning_sheet.docx')
print('planning sheet saved')
