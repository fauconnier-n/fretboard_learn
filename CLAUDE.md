# Working on this repo

## Git workflow (always)
- Every change goes on a new branch created from an up-to-date `main` (`git fetch`, `git switch main`, `git pull --ff-only`, `git switch -c <type>/<short-name>`). Never commit on `main`.
- Commit in logical steps, then push and open a pull request against `main` with `gh pr create` (GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe`, not on PATH in Git Bash).
- End every reply that finishes a change with the link to its pull request.
- Personal practice data lives in `data/` (ignored); never commit it.

## Checks before a pull request
Node is at `C:\Program Files\nodejs` (prepend it to PATH): `npm test`, `npm run lint`, `npm run typecheck` must pass. Test in the app as user `test`, never `user`.

## Docs to keep in step with features
`docs/FEATURES.md` (sections plus a dated line under Changes), `docs/learning-algorithm.md` for anything that changes what is asked or how answers count, and `README.md`.
