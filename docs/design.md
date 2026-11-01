# Design

A white page with the colours of the *Born & Raised* concert poster: green, red, blue and yellow with a dark outline, made a touch brighter (vibrant, not neon). The poster's beige is used only for secondary backgrounds (cards, segmented controls, the fretboard neck); the page itself stays white.

## Palette

The values live in two places that must stay in step: the custom properties at the top of `css/app.css`, and `PALETTE` in `js/palette.js` (for colours set from scripts, such as heatmap fills).

| Name | Value | Poster sample | Used for |
|---|---|---|---|
| green-light | `#6fd94c` | `#81c771` title | primary buttons, selected tabs and options |
| green | `#3cbd2b` | `#5bab46` | right answers on the board, progress, "known" ring |
| green-ink | `#27871a` | (darker green) | green text on white: feedback, near-miss line, checkboxes and sliders |
| red | `#e5252f` | `#e32834` | wrong answers, Stop, boss prompts, tuner needle |
| blue | `#14a0c4` | `#219bb7` | information, focus outlines, fading positions, "fast" ring |
| yellow | `#f5cb2a` | `#eecc38` | highlight: the zone, note-name cues, the asked position, open-string letters, golden prompts, "automatic" ring |
| yellow-ink | `#e8a91c` | (a deeper yellow) | thin yellow lines on beige: the zone contour |
| ink | `#3f3c37` | `#3f3c37` | text, outlines, the nut |
| beige | `#f9f6ed` | `#f9f6ed` | secondary backgrounds and the neck |
| muted | `#77716a` | | secondary text |
| wire / steel / line | `#dcd3c1` / `#948c7e` / `#ebe5d6` | | frets, strings, borders |

**Mastery scale** (note bars and knowledge maps): red → orange → yellow → green, from `masteryColor(m)` in `js/palette.js` (orange appears on the way from red to yellow).

**Knowledge map** (Stats, the practice board between runs, *All runs* after a run; `mapCell` in `js/stats.js`): each played position is the same card as the run results (`barsCard` in `js/fretboard.js`), from the spelling played most. Unplayed unlocked positions: a dashed ring and a pale name.

**Run results on the neck:** see the bars card below.

## Rules

- Write rules with the role variables (`--accent`, `--good`, `--bad`, `--highlight`, `--info`, `--text`, `--muted`, `--panel`, `--panel2`, `--line`), and use a raw palette colour only for its fixed meaning from the table above. Add no other colours.
- **Number cards** carry a colour stripe on the left, cycling green, blue, yellow, red.
- **The fretboard** is a beige neck on a white card, drawn like a chord diagram (dark nut, light frets, grey strings). **The zone** is one thin contour (1.8 px, yellow-ink) around its cells, corners rounded like the buttons, with no fill, and like the buttons' shadow the zone's shape is also filled 2 px down and right and shown only outside the zone, so its right and bottom edges look thicker with no seam; outside it the board fades into the page with a white veil. Positions not unlocked yet sit under a stronger white "fog" with a fine steel cross-hatch, so it reads as uncharted rather than faded (between runs only). **Shape as well as colour:** a wrong note on the board is a red disc struck through with a white cross, and a missed answer on the time plot is a red cross where right answers are green discs, so neither depends on telling red from green.
- **Name buttons** ("Name the note") are laid out like a piano: the seven naturals along the bottom, the five sharps or flats above, each centred over the gap between its two naturals; all twelve stickers are the same width.
- **The neck's spaces** are all the same width, the open strings' included (not shrinking like a real neck), so every card has the same size. Above the board, small steel dots mark the marker frets (two for 12 and 24); the fret numbers stay below.
- **Position popup:** the highlighted card, a title, the three bars at full width with their names and percentages (after a run, a thin ink mark shows where each bar stood before it), the last 10 answers as dots (green right, red wrong, bigger when slower), and a time line from 0.3 s to 10 s (log scale) with your fast end (green dot), your usual time here (ink dot) and this run's answers (small diamonds, red when wrong).
- **Position cards** (run results, Stats, knowledge map): the name (14 px, red if missed in the run) on the left of a small white card and three 4 px bars on the right: known coloured red → orange → yellow → green by its level (`masteryColor`), fast steel grey, automatic ink. The position whose popup is open turns yellow with an ink outline, and the popup starts with the same card. Popups sit beside the position on the board (to the right of one in the left half, to the left of one in the right half) and close when the page changes.
- **Answer animation** (`js/burst.js`): shapes thrown out of the asked note instead of a flash. A right answer throws green and title-green confetti (strips that tumble and fall, about 0.95 s); a wrong one red fireworks with a few ink dots (about 0.7 s). Skipped when the system asks for reduced motion.
- **During a run** the board zooms in on the zone (at most 2×, eased over 0.45 s); the view keeps the shape of a six-string board, so a 7–9-string board gets shorter on the page for the run. Marks on the board are 28 px circles with 12.5 px names. On phones the header and run settings slide away.
- **String order:** low E on top by default (like Rocksmith), or at the bottom (like tab) from Settings. Every board and every open-string menu follows the same order.
- **Strings** thin out from low E (3.4 px) to high e (0.9 px). A played note makes its string wave from the fret to the bridge: more and faster waves for higher notes (waves along the string = frequency / 60, at most 14; 2–12 cycles a second on screen, slow enough to draw smoothly at 60 frames a second), fading in about a second. A muted strum gives a short dead thump instead.
- **Open-string menus** use the same neck: the dark nut on the left, a yellow disc with the string letter, then the option.
- **Buttons are stickers**, like the poster lettering: a dark outline and an offset shadow down and to the right, 2 px (main buttons: 2.5 px outline and 3 px shadow; set by `--outline`, `--lift`, `--outline-main`, `--lift-main`). Main buttons are title green, red for Stop. An option group is one sticker with the chosen option filled yellow; open-string menu options are small stickers. Pressing pushes the sticker down by a pixel.
- Type: the system font, very heavy (900) for big numbers and the prompt.
