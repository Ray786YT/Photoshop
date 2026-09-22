# PROMPT — Magazine Cover

Media Arts magazine cover assignment. Concept: **"FINISH MY SENTENCE."** — a portrait
with the mouth removed and a phone keyboard's predictive-text bar wrapped across the
lower face, reading *I'm / fine / thanks*.

## Deliverables (`out/`)

| File | What it is |
|---|---|
| `PROMPT_cover.psd` | Layered Photoshop file, 2550x3300 @ 300 ppi, 21 layers in 7 folders, including real Curves and Gradient Map adjustment layers |
| `PROMPT_cover.jpg` | Flattened 300 ppi cover |
| `PROMPT_planning_sheet.docx` | Planning sheet in plain language (question 5 left blank for teacher feedback) |
| `PROMPT_STARTER.psd` | Layout done, photo untouched - the student does the manipulation |
| `PROMPT_FINISH_IT_YOURSELF_guide.docx` | Grade 11 step-by-step for finishing the starter file |
| `PROMPT_process_sheet.jpg` | All eight build stages on one contact sheet |
| `process/` | The eight stage JPGs individually |

## Layer structure

```
00 BACKGROUND      Base fill
01 PORTRAIT        Portrait - original photo / Mouth removed (Content-Aware Fill) /
                   Curves 1 (adjustment layer) / Vignette / Gradient Map 1 (adjustment layer)
02 BOTTOM FADE     Bottom fade
03 AUTOCOMPLETE    Bar drop shadow / Bar plate / Cell dividers / Suggestion - selected / Suggested words
04 MASTHEAD        Masthead - PROMPT / Selling line / Rule
05 COVER LINES     Three additional cover lines / Main cover line / Dateline
06 FOOTER          Barcode
```

## Build

```
python3 build/build_cover.py      # writes the .psd and .jpg
python3 build/stages.py           # writes the eight process stages
python3 build/contact_sheet.py    # writes the contact sheet
python3 build/planning_sheet.py   # writes the planning sheet
```

`tools/psd_writer.py` is a pure-Python PSD writer (layer groups, blend modes, RLE
compression, 300 ppi resolution metadata) written for this project.
