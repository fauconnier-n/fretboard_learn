# Working on this repo

## Git workflow (always)
- Every change goes on a new branch created from an up-to-date `main` (`git fetch`, `git switch main`, `git pull --ff-only`, `git switch -c <type>/<short-name>`). Never commit on `main`.
- Every pull request targets `main`, never another feature branch: stacked pull requests merged in another order leave work stranded on intermediate branches (it happened with #6–#9). Work that builds on an unmerged branch starts from that branch but still targets `main`, so either merge order is safe.
- Commit in logical steps, then push and open a pull request against `main` with `gh pr create` (GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe`, not on PATH in Git Bash).
- **While the repository has no CI** (no `.github/workflows`), a pull request is merged as soon as it is opened and checked: `gh pr merge <n> --merge --delete-branch`, then update the local `main`. Once CI exists, wait for it instead.
- End every reply that finishes a change with the link to its pull request.
- Personal practice data lives in `data/` (ignored); never commit it.

## Checks before a pull request
Node is at `C:\Program Files\nodejs` (prepend it to PATH): `npm test`, `npm run lint`, `npm run typecheck` must pass. Test in the app as user `test`, never `user`.

## Screenshots of every visible change
- Test UI changes in headless Edge: `node tools/browser-check.mjs tools/tour.mjs --out screenshots/<name>` (the server must be running; it uses the `test` user; write other step files like `tools/tour.mjs` for specific states). It also writes `index.html`, a gallery of the shots.
- Show the screenshots of the screens that changed in the reply, not in commits or pull requests. The chat does not display embedded images (`![](...)` shows "[Image]"), so keep them in the git-ignored `screenshots/` folder and put **markdown links** to the PNG files in the reply, with paths relative to the repo (e.g. `[Run summary](screenshots/x/4-practice-summary.png)`): they open in the app's file pane. Also open the gallery in the user's browser (`Start-Process screenshots/<name>/index.html`).
- Include plenty of phone screenshots, held **sideways (landscape, 844×390)**; `tools/tour.mjs` has them (`m*` steps, `mobile: true`).
- **Every set of screenshots includes a GIF of a run**: from the moment a note is asked, through the answer, to the confirmation (`runGif` in `tools/tour.mjs`; import it into other step files). Also one at phone width, sideways.
- When a change shows an **animation**, record it as a GIF: a step with `gif: { clip: '<selector>', ms }` (start the animation in the step's js without awaiting it) writes `<name>.gif` (`tools/gif.mjs`, no dependency). Link the GIF like the screenshots.

## Subagents
Use subagents in parallel when it clearly speeds things up or the pieces are independent (separate files or areas, research, reviews): preferably just a few, never more than about a dozen. Work that touches the same files stays in one place.

## Design
Colours come only from the palette in `docs/design.md` (CSS custom properties in `css/app.css`, `PALETTE` in `js/palette.js`). White page; the poster's beige only for secondary backgrounds. Buttons are "stickers" (dark outline, offset shadow).

## Docs to keep in step with features
`docs/FEATURES.md` (sections plus a dated line under Changes), `docs/learning-algorithm.md` for anything that changes what is asked or how answers count, and `README.md`.
