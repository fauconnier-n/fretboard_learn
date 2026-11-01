# Working on this repo

## Git workflow (always)
- Two long-lived branches: **`dev`** is where work lands; **`main`** is what is released, and only moves at a release. Never commit on either directly.
- Every change goes on a new branch created from an up-to-date `dev` (`git fetch`, `git switch dev`, `git pull --ff-only`, `git switch -c <type>/<short-name>`).
- Every pull request targets `dev` (`gh pr create --base dev`), never another feature branch: stacked pull requests merged in another order leave work stranded on intermediate branches (it happened with #6–#9). Work that builds on an unmerged branch starts from that branch but still targets `dev`. No CI runs on `dev`, so a pull request is merged as soon as it is opened and checked locally: `gh pr merge <n> --merge --delete-branch`, then update the local `dev`.
- Commit in logical steps: **several commits on one branch, one pull request and one merge** for a piece of work, not a pull request per small fix (GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe`, not on PATH in Git Bash).
- **Releases, only when the user asks for one** (never on your own): open a pull request `dev` → `main` (`gh pr create --base dev` is wrong here: `--base main --head dev`), wait for CI (`gh pr checks <n> --watch`), merge it, then publish a release on `main`: `gh release create vX.Y.Z --target main --generate-notes --notes "<its dated line from .workspace/docs/app/changelog.md>"`. Publishing deploys that tag to <https://fauconnier-n.github.io/fretboard_learn/> (watch `gh run list --workflow "Check and deploy"`), so the latest release is always what the site runs. Afterwards merge `main` back into `dev` if the release PR added anything. Versions are semantic with a `v`: minor for features, patch for fixes; the next one is the smallest bump that fits what `dev` holds since the last release.
- End every reply that finishes a change with the link to its pull request (and the release, after one).
- Personal practice data lives in `data/` (ignored); never commit it.

## Checks before a pull request
Node is at `C:\Program Files\nodejs` (prepend it to PATH): `npm test`, `npm run lint`, `npm run typecheck` must pass. Test in the app as profile `test`, never `user`. For varied practice data in `test`: `node tools/seed-test.mjs screenshots/seed-test.json`, then import it from Settings → Data (it replaces that profile's data). Restart the server after changing `serve.ps1`.

## Screenshots of every visible change
- Test UI changes in headless Edge: `node tools/browser-check.mjs tools/tour.mjs --out screenshots/<name>` (the server must be running; it uses the `test` profile; write other step files like `tools/tour.mjs` for specific states). It also writes `index.html`, a gallery of the shots. `tools/profiles.mjs` (`--fresh --no-seed`) covers the welcome screen and the Data page; `tools/hosted.mjs` the app as on GitHub Pages (`node tools/static.mjs`, `--host fretboard.test --secure`).
- Show the screenshots of the screens that changed in the reply, not in commits or pull requests. The chat does not display embedded images (`![](...)` shows "[Image]"), so keep them in the git-ignored `screenshots/` folder and put **markdown links** to the PNG files in the reply, with paths relative to the repo (e.g. `[Run summary](screenshots/x/4-practice-summary.png)`): they open in the app's file pane. Also open the gallery in the user's browser (`Start-Process screenshots/<name>/index.html`).
- Include plenty of phone screenshots, held **sideways (landscape, 844×390)**; `tools/tour.mjs` has them (`m*` steps, `mobile: true`).
- **Every set of screenshots includes a GIF of a run**: from the moment a note is asked, through the answer, to the confirmation (`runGif` in `tools/tour.mjs`; import it into other step files). Also one at phone width, sideways.
- When a change shows an **animation**, record it as a GIF: a step with `gif: { clip: '<selector>', ms }` (start the animation in the step's js without awaiting it) writes `<name>.gif` (`tools/gif.mjs`, no dependency). Link the GIF like the screenshots.

## Subagents
Use subagents in parallel when it clearly speeds things up or the pieces are independent (separate files or areas, research, reviews): preferably just a few, never more than about a dozen. Work that touches the same files stays in one place.

## Design
Colours come only from the palette (`.workspace/docs/app/design.md`; CSS custom properties in `css/app.css`, `PALETTE` in `js/palette.js`). White page; the poster's beige only for secondary backgrounds. Buttons are "stickers" (dark outline, offset shadow).

## Docs to keep in step with features
Docs are local, not versioned, in `.workspace/docs/` (index: its `README.md`): `app/features.md`, a dated line in `app/changelog.md`, `app/learning-algorithm.md` for anything that changes what is asked or how answers count, and `README.md`.
