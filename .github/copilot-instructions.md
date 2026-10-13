# Copilot instructions

A JavaScript GitHub Action (`action.yml`, `runs.using: node*`, `main: dist/index.cjs`) that creates semver tags/releases from commit messages or `.semrelease/this_release`.

## Commands

- Lint: `npm run lint`
- Clean generated files: `npm run clean` (removes generated JavaScript, source maps and licenses from `dist/`, preserving `package.json`)
- Build bundle: `npm run prepare` (cleans first, then `ncc` bundles `src/index.cjs` into `dist/` with source maps and `licenses.txt`)
- All (lint + build + test): `npm run all`
- Tests: `npm test` (Jest, 60s timeout, coverage)
- Offline unit tests: `npm test -- test/utils-offline.test.js test/app-offline.test.js --coverage=false` (mocked GitHub APIs; no token or repository setup required). Full-suite coverage thresholds still apply to `npm test`.
- Single test file: `npm test -- test/rules.test.js`; single test: `npm test -- test/utils.test.js -t "name"`
- Dry run against the real repo: `npm run dryrun`

Tests call the GitHub API, so they need env vars (see `.dev.md`):

```
export GITHUB_TOKEN="$(gh auth token)"
export TAG_PREFIX=v
export GITHUB_REPOSITORY=btnguyen2k/action-semrelease
```

## Architecture

- `src/index.js`: entry point. It calls `app.semrelease()` and sets the `result`, `releaseVersion` and `releaseNotes` outputs.
- `src/app.js`: orchestration. `computeReleaseMeta` finds the latest release (falling back to the latest tag) for `tag-prefix`. It then loads commit messages from `.semrelease/this_release` or from the repo's commits since that point, and bumps the version. `semrelease()` then skips if the release already exists, creates the tag(s) (full, major, optional minor) and creates the release.
- `src/rules.js`: regex rules that classify commit messages as major, minor or patch bumps and generate the release notes. Each rule has several regex variants (`reX`, `reX1` for `[x]`, `reX2` for `(x)`, `reX3` for sentence form).
- `src/utils.js`: option parsing (`getOptions`), GitHub API helpers, semver parsing and bumping, and `.semrelease/this_release` parsing.
- `testdata/`: fixtures for tests, one directory per scenario.

## Conventions

- Source and tests use native ESM with explicit `.js` extensions on local imports. Jest runs through the npm scripts with `--experimental-vm-modules` and transforms disabled.
- `src/index.cjs` imports the ESM entry point so ncc emits a CommonJS `dist/index.cjs` bundle and supporting chunks. Keep `dist/package.json` set to `"type": "commonjs"` so `.js` chunks load correctly.

- **`dist/` is committed and is what runs.** Validate source/runtime dependency changes with `npm run prepare`. The build workflow commits generated artifacts; do not commit them from the dev machine. Commit the manually maintained `dist/package.json` from the dev machine.
- Input handling uses `core.getInput(name)` with defaults and supported environment fallbacks (`DRY_RUN`, `TAG_PREFIX`, `BRANCHES`, `TAG_ONLY`, `SCAN_PATH`). When adding an input, update `action.yml`, `getOptions()` and the README.
- Dry-run is enabled by the `dry-run` input, `DRY_RUN=true`, or a `.semrelease-dry-run` file in the repo root. Every write to GitHub (tags, refs, releases) must go through the `dryRun` guard.
- `.semrelease/this_release` can force a version with a `#!VERSION=x.y.z` line. The action never cleans this file up.
- Release metadata reads `.semrelease/this_release` from GitHub at the resolved `target-sha` (default: event SHA). Commit scanning intersects pinned branch histories with the target's reachable history. Full version tags are verified/reused, never moved; enabled major/minor aliases remain movable. Partial custom versions are padded to valid SemVer or rejected.
- Before metadata reads, validate that the target (explicit or event SHA) is reachable from a configured branch. Resolve deduplicated branch tips once and reuse them for history scanning; membership checks have no date/path filters. Warn and skip branch-lookup 404/422, fail if the branch list is empty or all branches are missing, and propagate other lookup/comparison errors.
- Version calculation always uses `computeReleaseMeta`; changelog/release-notes documents are not parsed for release metadata.
- Pinned-file messages take precedence even when unqualified (skip without history fallback). Scan history only when the file has no messages, retaining its forced version; no qualifying messages means skip even with a valid forced version.
- Code style: no semicolons, single quotes, 2-space indent (see `eslint.config.mjs` and `.editorconfig`). Log messages are prefixed with emoji, e.g. `ℹ️`, `⚠️`, `✅`, `🕘`.
- Release notes live in `RELEASE-NOTES.md`; the CI workflows (`.github/workflows/test.yaml`, `release.yaml`) run the action against itself in dry-run mode.
