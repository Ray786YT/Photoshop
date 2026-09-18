"""Generate the filled-in Magazine Cover Planning Sheet as an editable .docx."""
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

NAME = 'Rayyan Ali'
ACCENT = RGBColor(0x2E, 0x5B, 0x2E)

doc = Document()
for s in doc.sections:
    s.top_margin = s.bottom_margin = Inches(0.8)
    s.left_margin = s.right_margin = Inches(0.9)

st = doc.styles['Normal']
st.font.name = 'Calibri'
st.font.size = Pt(11)
st.paragraph_format.space_after = Pt(8)

def head(text, size=16):
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text); r.bold = True; r.font.size = Pt(size)
    return p

def q(text):
    p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(14)
    r = p.add_run(text); r.bold = True; r.font.size = Pt(11.5)
    r.font.color.rgb = ACCENT
    return p

def a(text, bullet=False):
    p = doc.add_paragraph(style='List Bullet' if bullet else None)
    p.add_run(text)
    if not bullet:
        p.paragraph_format.left_indent = Inches(0.25)
    return p

head('MAGAZINE COVER PLANNING SHEET')
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run(f'Student Name: {NAME}'); r.bold = True

q('1. What type of magazine cover are you creating?')
a('Technology / AI. PROMPT is a serious ideas-and-current-affairs magazine about '
  'technology and what it is doing to people — closer to WIRED or TIME than to a '
  'gadget review magazine.')

q('2. What is the name of your magazine?')
a('PROMPT — the word means both a cue that helps a person speak, and the instruction '
  'you type into an AI. The whole cover lives inside that double meaning.')

q('3. In one sentence, what is the main message of your magazine cover '
  '(what is the main cover line)?')
a('Main cover line: "FINISH MY SENTENCE." — we are handing our own voice over to '
  'machines that predict what we were about to say.')

q('4a. What is your central image going to look like?')
a('A black-and-white studio portrait, head and shoulders, looking straight down the '
  'lens on a plain backdrop. The mouth has been digitally removed — smooth skin where '
  'it should be. Wrapped across the lower face, exactly where the mouth was, is the '
  'predictive-text suggestion bar from a phone keyboard, reading "I\'m | fine | thanks", '
  'with the middle word already highlighted as though the machine has chosen for her.')

q('4b. How are you going to manipulate the image? Be detailed.')
a('Remove the mouth using the Spot Healing Brush and Clone Stamp, sampling clean skin '
  'from the forehead and cheek.', True)
a('Rebuild believable skin texture over the healed patch by adding fine grain, so the '
  'area does not look plastic or blurred.', True)
a('Curves adjustment layer to crush the grey backdrop to near-black while holding the '
  'highlights on the face.', True)
a('Gradient Map adjustment layer for a cold blue-steel duotone (colourisation).', True)
a('Radial vignette to pull the eye to the centre of the face.', True)
a('Build the suggestion bar from rounded-rectangle shape layers and live type.', True)
a('NEW SKILL: Filter > Distort > Displace, using a blurred greyscale copy of the face '
  'saved as its own .psd as the displacement map, so the bar bends over the cheeks and '
  'jaw instead of sitting flat on top like a sticker.', True)
a('Multiply-blended shading layer so the bar picks up the same light as the face, plus '
  'a soft drop shadow underneath so it sits on the skin.', True)
a('Linear gradient scrim across the foot of the cover so the bottom type stays readable '
  'over the lit neck.', True)

q('4c. How is this manipulation enhancing or helping you convey the message?')
a('Deleting the mouth makes the idea literal instead of symbolic — you cannot argue '
  'with a face that has no mouth. Putting the keyboard suggestion bar exactly where the '
  'mouth used to be says the machine is doing the talking now. The words matter: '
  '"I\'m fine thanks" is the most auto-completed and least honest sentence in English, '
  'and highlighting the middle word shows the choice has already been made for her. '
  'The cold blue duotone keeps the whole thing clinical and unfriendly, and the single '
  'acid-green accent is the only machine-made colour on the page — it appears on the '
  'bar, the kickers, the rule and the cover line, which walks the reader\'s eye from the '
  'masthead down through the face to "SENTENCE."')

q('5. Did Ms. Bensusan discuss your idea with you and give you feedback?')
a('[ YOUR ANSWER HERE — show her the concept before you submit, then write down what '
  'she said and anything you changed because of it. ]')

doc.add_page_break()
head('DESIGN ELEMENTS AND PRINCIPLES USED', 14)

q('Elements of Design')
for t in ['Line — the acid rule under the masthead and the dividers inside the bar.',
          'Shape — the rounded rectangles of the suggestion bar and the barcode block.',
          'Value — hard chiaroscuro: a lit face against a near-black ground.',
          'Colour — cold blue-steel duotone with one acid-green accent.',
          'Texture — rebuilt skin grain across the healed area and film grain overall.',
          'Space — deliberate negative space either side of the head holds the cover lines.',
          'Form — the modelling on the face keeps it three-dimensional under the flat UI bar.']:
    a(t, True)

q('Principles of Design')
for t in ['Balance — a symmetrical, centred portrait deliberately unbalanced by '
          'asymmetric type down the left.',
          'Contrast — light face against dark ground; warm acid green against cold blue.',
          'Emphasis — the suggestion bar is the brightest, most saturated thing on the '
          'cover, sitting dead centre.',
          'Movement — the eye travels masthead, down the face, onto the bar, down to the '
          'main cover line.',
          'Repetition — acid green recurs four times; every cover line uses the same '
          'kicker-over-headline structure.',
          'Unity — two type families only (Manrope and Roboto) and one palette across '
          'the whole cover.',
          'Rhythm — the stacked three-line cover-line blocks set a steady beat down the '
          'left edge.']:
    a(t, True)

q('Technical checklist')
for t in ['Canvas: 8.5in x 11in at 300 ppi (2550 x 3300 px), RGB colour.',
          'Downloaded fonts used: Manrope (masthead, selling line, bar) and Roboto '
          '(cover lines).',
          'Industry-standard format: masthead, selling line, main cover line, three '
          'additional cover lines, dateline with name, barcode.',
          'Layers: 17 layers in 6 named groups, including a hidden "BEFORE" layer that '
          'can be switched on to show the original mouth.',
          'Selection tools: Magic Wand / flood-select on the backdrop, lasso around the '
          'mouth area before healing.',
          'Editing tools: Clone Stamp, Healing Brush, crop, transform and scale.',
          'Colourisation tools: Curves and Gradient Map adjustment layers.']:
    a(t, True)

doc.save('/home/user/Photoshop/out/PROMPT_planning_sheet.docx')
print('saved planning sheet')
