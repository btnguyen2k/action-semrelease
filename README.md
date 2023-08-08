# SemRelease

[![Release](https://img.shields.io/github/release/btnguyen2k/action-semrelease.svg?style=flat-square)](RELEASE-NOTES.md)
[![Actions Status](https://github.com/btnguyen2k/action-semrelease/actions/workflows/test.yaml/badge.svg)](https://github.com/btnguyen2k/action-semrelease/actions)
[![codecov](https://codecov.io/gh/btnguyen2k/action-semrelease/branch/main/graph/badge.svg)](https://codecov.io/gh/btnguyen2k/action-semrelease)

GitHub Action to publish releases using tags, following sematic versioning.

## Usage

```yaml
uses: btnguyen2k/action-semrelease@v1
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
```

## How it works

This action reads release information from a release notes file located in the root of the repository. The release notes file is expected to be in Markdown format, with each release information in a section with the following format:

```markdown
## 2023-08-07 - v1.0.0

- Publish releases using tags, following semantic versioning.

## 2023-08-06 - v0.9.1

- Minor typo fixed.
```

👉 The section for the latest release must be at the top of the file. Version string and release notes are automatically extracted from the section title and content.

👉 The version string must follow [Semantic Versioning spec](https://semver.org), and can be optionally prefixed by letter `v`.

👉 Name of the release notes file must be one of the following `RELEASE-NOTES.md`, `RELEASE_NOTES.MD`, `RELEASE-NOTES`, `RELEASE_NOTES.md`, `RELEASE_NOTES.MD`, `RELEASE_NOTES`, `release-notes.md`, `release-notes`, `release_notes.md` and `release_notes`.

## Inputs

Inputs are supplied via the `with` block. The following inputs are accepted:

| Input             | Required | Default | Description                                                 |
|-------------------|----------|---------|-------------------------------------------------------------|
| github-token      | Yes      |         | Either a PAT or GITHUB_TOKEN to access the repository.      |
| dry-run           | No       | `false` | If `true`, the action will run in dry-run mode.             |
| tag-major-release | No       | `true`  | If `true`, a major release tag will be created, e.g. `v1`   |
| tag-minor-release | No       | `false` | If `true`, a minor release tag will be created, e.g. `v1.2` |
| tag-prefix        | No       | `'v'`   | Prefix for release tags.                                    |

## License

MIT - See [LICENSE.md](LICENSE.md).
