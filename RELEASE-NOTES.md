# SemRelease release notes

## 2023-08-12 - v3.0.0

### Changed

- Change: Commit message starts with Dependency: triggers new patch release; while bumping version will no longer trigger new release

### Added/Refactoring

- Feature: Find latest release using tag-prefix

### Fixed/Improvement

- Improvement: log commit message that trigger new release version
- Bump btnguyen2k/action-semrelease from 1 to 2

Bumps [btnguyen2k/action-semrelease](https://github.com/btnguyen2k/action-semrelease) from 1 to 2.
- [Release notes](https://github.com/btnguyen2k/action-semrelease/releases)
- [Changelog](https://github.com/btnguyen2k/action-semrelease/blob/main/RELEASE-NOTES.md)
- [Commits](https://github.com/btnguyen2k/action-semrelease/compare/v1...v2)

---
updated-dependencies:
- dependency-name: btnguyen2k/action-semrelease
  dependency-type: direct:production
  update-type: version-update:semver-major
...

Signed-off-by: dependabot[bot] <support@github.com>
- Bump eslint from 8.46.0 to 8.47.0

Bumps [eslint](https://github.com/eslint/eslint) from 8.46.0 to 8.47.0.
- [Release notes](https://github.com/eslint/eslint/releases)
- [Changelog](https://github.com/eslint/eslint/blob/main/CHANGELOG.md)
- [Commits](https://github.com/eslint/eslint/compare/v8.46.0...v8.47.0)

---
updated-dependencies:
- dependency-name: eslint
  dependency-type: direct:development
  update-type: version-update:semver-minor
...

Signed-off-by: dependabot[bot] <support@github.com>

## 2023-08-11 - v2.0.2

### Fixed/Improvement

- Fix: duplicated commit messages

## 2023-08-11 - v2.0.1

### Fixed/Improvement

- Improvement: prevent duplicated commit messages

## 2023-08-11 - v2.0.0

### Changed

- Change: do not create new release if release notes are empty

### Added/Refactoring

- Add new input `branches`
- Feature: automatically generate release notes from commit messages
- Add: `auto-mode` input and '.semrelease-dry-run' file

## 2023-08-08 - v1.1.1

- Fix: missing doc.

## 2023-08-08 - v1.1.0

- Add input `tag-prefix`.
- Extend parsing to changelog file: `CHANGELOG.md`, `CHANGELOG.MD`, `CHANGELOG`, `CHANGE-LOG.md`, `CHANGE-LOG.MD`,
`CHANGE-LOG`, `CHANGE_LOG.md`, `CHANGE_LOG.MD`, `CHANGE_LOG`, `changelog.md`, `changelog`, `change-log.md`,
`change-log`, `change_log.md`, `change_log`.
- Bug fixes & refactoring.

## 2023-08-07 - v1.0.0

- Publish releases using tags, following semantic versioning.
