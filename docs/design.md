# Design

A white page with the colours of the *Born & Raised* concert poster: green, red, blue and yellow with a dark outline, made a touch brighter (vibrant, not neon). The poster's beige is used only for secondary backgrounds (cards, segmented controls, the fretboard neck); the page itself stays white.

## Palette

The values live in two places that must stay in step: the custom properties at the top of `css/app.css`, and `PALETTE` in `js/palette.js` (for colours set from scripts, such as heatmap fills).

| Name | Value | Poster sample | Used for |
|---|---|---|---|
| green-light | `#6fd94c` | `#81c771` title | primary buttons, selected tabs and options |
| green | `#3cbd2b` | `#5bab46` | right answers on the board, progress, "known" ring |
| green-ink | `#27871a` | (darker green) | green text on white: feedback, near-miss line, checkboxes and sliders |
| red | `#e5252f` | `#e32834` | wrong answers, Stop, boss prompts, TEST DATA badge, tuner needle |
| blue | `#14a0c4` | `#219bb7` | information, focus outlines, fading positions, "fast" ring |
| yellow | `#f5cb2a` | `#eecc38` | highlight: the zone, note-name cues, the asked position, open-string letters, golden prompts, "automatic" ring |
| ink | `#3f3c37` | `#3f3c37` | text, outlines, the nut |
| beige | `#f9f6ed` | `#f9f6ed` | secondary backgrounds and the neck |
| muted | `#77716a` | | secondary text |
| wire / steel / line | `#dcd3c1` / `#948c7e` / `#ebe5d6` | | frets, strings, borders |

**Mastery scale** (heatmaps, note bars): red → yellow → green, from `masteryColor(m)` in `js/palette.js`.

## Rules

- Write rules with the role variables (`--accent`, `--good`, `--bad`, `--highlight`, `--info`, `--text`, `--muted`, `--panel`, `--panel2`, `--line`), and use a raw palette colour only for its fixed meaning from the table above. Add no other colours.
- **Number cards** carry a colour stripe on the left, cycling green, blue, yellow, red.
- **The fretboard** is a beige neck on a white card, drawn like a chord diagram (dark nut, light frets, grey strings). Outside the zone it fades into the page with a white veil; positions not unlocked yet sit under a stronger white "fog" (between runs only).
- **String order:** low E on top by default (like Rocksmith), or at the bottom (like tab) from Settings. Every board and every open-string menu follows the same order.
- **Strings** thin out from low E (3.4 px) to high e (0.9 px). A played note makes its string wave from the fret to the bridge: more and faster waves for higher notes (waves along the string = frequency / 60, at most 14; 2–12 cycles a second on screen, slow enough to draw smoothly at 60 frames a second), fading in about a second. A muted strum gives a short dead thump instead.
- **Open-string menus** use the same neck: the dark nut on the left, a yellow disc with the string letter, then the option.
- **Buttons are stickers**, like the poster lettering: a dark outline and an offset shadow down and to the right, 2 px (main buttons: 2.5 px outline and 3 px shadow; set by `--outline`, `--lift`, `--outline-main`, `--lift-main`). Main buttons are title green, red for Stop. An option group is one sticker with the chosen option filled yellow; open-string menu options are small stickers. Pressing pushes the sticker down by a pixel.
- Type: the system font, very heavy (900) for big numbers and the prompt.
