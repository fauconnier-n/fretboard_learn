# Design

A white page with a few bold colours and dark outlines, taken from two references: the *Born & Raised* concert poster (green, red, blue and yellow with a dark outline) and the Element "landscape" tee (orange, olive, slate blue and mustard as flat bands). The page stays white, never beige.

## Palette

The values live in two places that must stay in step: the custom properties at the top of `css/app.css`, and `PALETTE` in `js/palette.js` (for colours set from scripts, such as heatmap fills).

| Name | Value | Used for |
|---|---|---|
| green | `#6cbf5b` | brand, primary buttons, progress, right answers on the board, "known" ring |
| green-ink | `#2f8a43` | green text on white (feedback, "up", near-miss line), checkboxes and sliders |
| red | `#d7322d` | wrong answers, errors, the tuner needle, Stop |
| blue | `#2b9ac8` | information, focus outlines, "fast" ring |
| sky | `#6e97c3` | fading positions on the mastery map |
| yellow | `#f2b632` | highlight: the zone, note-name cues, the asked position, open-string letters, golden prompts, "automatic" ring |
| orange | `#e8582a` | boss prompts, the TEST DATA badge |
| olive | `#7d8b2b` | spare: a sixth colour for charts |
| ink | `#27241f` | text, outlines on primary buttons, the nut |
| muted | `#6d6a64` | secondary text |
| neck / wire / steel | `#f0f1ee` / `#c3c2bb` / `#8d8a84` | the fretboard: a light neck with grey frets and strings, drawn like a chord diagram |
| panel2 / line | `#f3f4f2` / `#e2e3df` | soft fills (cards, segmented controls) and borders |

**Mastery scale** (heatmaps, note bars): red → orange → yellow → green, from `masteryColor(m)` in `js/palette.js`.

## Rules

- Write rules with the role variables (`--accent`, `--good`, `--bad`, `--highlight`, `--info`, `--text`, `--muted`, `--panel`, `--line`), and use a raw palette colour only for its fixed meaning from the table above. Add no other colours.
- **Primary actions** look like the poster: green fill, ink text, a 2 px ink outline and a hard 2 px shadow underneath.
- **Number cards** carry a colour stripe on the left, cycling green, blue, yellow, red, orange.
- **The fretboard** is a light neck on a white card. Outside the zone it fades into the page with a white veil; positions not unlocked yet sit under a stronger white "fog".
- **Open-string menus** use the same neck: the dark nut on the left, a yellow disc with the string letter, then the option.
- Type: the system font, very heavy (900) for big numbers and the prompt.
