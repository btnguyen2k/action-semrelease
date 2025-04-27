# SemRelease release notes

## 2025-04-27 - v4.0.0

### Added/Refactoring/Deprecation

- Feature: release version number can now be specified via `.semrelease/this_release`.

### Fixed/Improvements

- Improved commit message analyzing rules.
- Improvement: capitalize the first letter of each commit message.
- Improved format of release notes with bullet points.

## 2024-08-26 - v4.0.0-rc2

### Fixed/Improvements

- Improved commit message analyzing rules.

## 2024-08-23 - v4.0.0-rc1

### Added/Refactoring

- Feature: release version number can now be specified via `.semrelease/this_release`.

### Fixed/Improvement

- Improvement: capitalize the first letter of each commit message.
- Improved format of release notes with bullet points.

## 2024-08-19 - v3.4.0

### Added/Refactoring

Deprecated parsing changelog file for release info.

### Fixed/Improvement

Improved commit message parsing rules.

## 2024-01-21 - v3.3.0

### Added/Refactoring

- Add new input changelog-file
- Feature: Load custom commit messages from file .semrelease/this_release

## 2023-12-19 - v3.2.1

### Fixed/Improvement

- Fixed: typo that causes breaking changes not detected

## 2023-08-13 - v3.2.0

### Added/Refactoring

- Add new input `path`

## 2023-08-12 - v3.1.1

### Fixed/Improvement

- Fix: version from tag_name is incorrectly parsed

## 2023-08-12 - v3.1.0

### Added/Refactoring

- Feature: do not create release if tag-only=true
- Feature: fallback to scanning tags if no release found for tag-prefix
- Add new input tag-only

## 2023-08-12 - v3.0.0

### Changed

- Change: Commit message starts with Dependency: triggers new patch release; while bumping version will no longer trigger new release

### Added/Refactoring

- Feature: Find latest release using tag-prefix

### Fixed/Improvement

- Improvement: log commit message that trigger new release version

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
