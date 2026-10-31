# Design

A white page with the colours of the *Born & Raised* concert poster: green, red, blue and yellow with a dark outline, made a touch brighter (vibrant, not neon). The poster's beige is used only for secondary backgrounds (cards, segmented controls, the fretboard neck); the page itself stays white.

## Palette

The values live in two places that must stay in step: the custom properties at the top of `css/app.css`, and `PALETTE` in `js/palette.js` (for colours set from scripts, such as heatmap fills).

| Name | Value | Poster sample | Used for |
|---|---|---|---|
| green-light | `#7acc67` | `#81c771` title | primary buttons, selected tabs and options |
| green | `#52b347` | `#5bab46` | right answers on the board, progress, "known" ring |
| green-ink | `#2f8228` | (darker green) | green text on white: feedback, near-miss line, checkboxes and sliders |
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
- **The fretboard** is a beige neck on a white card, drawn like a chord diagram (dark nut, light frets, grey strings). Outside the zone it fades into the page with a white veil; positions not unlocked yet sit under a stronger white "fog".
- **Open-string menus** use the same neck: the dark nut on the left, a yellow disc with the string letter, then the option.
- **Buttons:** see `tools/button-shapes.html` for the shapes on offer.
- Type: the system font, very heavy (900) for big numbers and the prompt.
