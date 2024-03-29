# SemRelease

[![Release](https://img.shields.io/github/release/btnguyen2k/action-semrelease.svg?style=flat-square)](RELEASE-NOTES.md)
[![Actions Status](https://github.com/btnguyen2k/action-semrelease/actions/workflows/test.yaml/badge.svg)](https://github.com/btnguyen2k/action-semrelease/actions)
[![codecov](https://codecov.io/gh/btnguyen2k/action-semrelease/branch/main/graph/badge.svg)](https://codecov.io/gh/btnguyen2k/action-semrelease)

GitHub Action to publish releases using tags, following semantic versioning.

## Usage

```yaml
uses: btnguyen2k/action-semrelease@v3
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
```

## How it works

This action extract release information either from a release notes or changelog file located in the root of the repository; or from commit messages if `auto-mode` is enabled.

> `auto-mode` is available since version [v2.0.0](RELEASE-NOTES.md).

### auto-mode: false (disable auto-mode)

The release notes or changelog file is expected to be in Markdown, with each release information in a section with the following format:

```markdown
## 2023-08-07 - v1.0.0

- Publish releases using tags, following semantic versioning.

## 2023-08-06 - v0.9.1

- Minor typo fixed.
```

👉 The section for the latest release must be at the top of the file. Version string and release notes are automatically extracted from the section title and content.

👉 The version string must follow [Semantic Versioning spec](https://semver.org), and can be optionally prefixed by letter `v`.

👉 This action scans the following files, in order, to extract release information: `RELEASE-NOTES.md`, `RELEASE_NOTES.MD`, `RELEASE-NOTES`,
`RELEASE_NOTES.md`, `RELEASE_NOTES.MD`, `RELEASE_NOTES`, `release-notes.md`, `release-notes`, `release_notes.md`,
`release_notes`, `CHANGELOG.md`, `CHANGELOG.MD`, `CHANGELOG`, `CHANGE-LOG.md`, `CHANGE-LOG.MD`, `CHANGE-LOG`,
`CHANGE_LOG.md`, `CHANGE_LOG.MD`, `CHANGE_LOG`, `changelog.md`, `changelog`, `change-log.md`, `change-log`,
`change_log.md`, `change_log`.

### auto-mode: true (enable auto-mode)

This action scans commit messages to determine to release a new version. Release notes are automatically compiled from commit messages.

| Sample commit message                                                  | Release version   |
|------------------------------------------------------------------------|-------------------|
| BREAKING: hash function parameter is no longer optional                | New major release |
| Changed hash function from MD5 to SHA1                                 | New major release |
| Replace function `GetRelease()` with `GetLatestRelease()`              | New major release |
| Removed: deprecated function `GetBranches()`                           | New major release |
|                                                                        |                   |
| Deprecated: class `CommitMessage` is now deprecated                    | New minor release |
| Refactor class `HashUtils`                                             | New minor release |
| Added new hash function `HashUtils::hashSha1()`                        | New minor release |
| New feature: scan commit messages to build new release                 | New minor release |
|                                                                        |                   |
| Fixed typo in function `HashUtils::hashMd5()`                          | New patch release |
| Patched: function `HashUtils::Crc32()` now returns correct value       | New patch release |
| Improve performance of function `HashUtils::hashChain()`               | New patch release |
| Dependency: bump `krypto` to v1.2.3                                    | New patch release |
| Security: fix potential SQLi security vulnerability in class `DbUtils` | New patch release |

Since [v3.3.0](RELEASE-NOTES.md), if the file `.semrelease/this_release` exists, commit messages are pulled from this file, with one commit message per line.
Otherwise, commit messages are pulled from the GitHub repository.

> The rules exemplified in the table above are applied to commit messages found in both the file `.semrelease/this_release` and the commit messages in the GitHub repository.

- This action leaves the file `.semrelease/this_release` intact after execution. Remember to update the file content if necessary.
- The content of the file `.semrelease/this_release` can be quickly generated using the following command:

```shell
$ git log origin..HEAD | grep "^\s" > .semrelease/this_release
```

## Inputs

Inputs are supplied via the `with` block. The following inputs are accepted:

| Input                         | Required | Default         | Description                                                                   |
|-------------------------------|----------|-----------------|-------------------------------------------------------------------------------|
| github-token                  | Yes      |                 | Either a PAT or GITHUB_TOKEN to access the repository.                        |
| dry-run                       | No       | `false`         | If `true`, the action will run in dry-run mode.                               |
| tag-major-release             | No       | `true`          | If `true`, a major release tag will be created, e.g. `v1`                     |
| tag-minor-release             | No       | `false`         | If `true`, a minor release tag will be created, e.g. `v1.2`                   |
| tag-prefix                    | No       | `'v'`           | Prefix for release tags.                                                      |
| auto-mode <sup>[1]</sup>      | No       | `false`         | If `true`, _auto-mode_ is enabled.                                            |
|                               |          |                 |                                                                               |
| branches                      | No       | `'main,master'` | Comma-separated list of branches to scan commit messages (_auto-mode_ only!). |
| path                          | No       | `''`            | Scan only commits containing this file path (_auto-mode_ only).               |
|                               |          |                 |                                                                               |
| changelog-file <sup>[2]</sup> | No       | `''`            | Path to changelog file (_non auto-mode_ only).                                |

[1] `auto-mode` is available since [v2.0.0](RELEASE-NOTES.md).

[2] `changelog-file` is available since [v3.3.0](RELEASE-NOTES.md).

## Outputs

| Output         | Description                                                                |
|----------------|----------------------------------------------------------------------------|
| result         | The result of the action. Possible values: `FAILED`, `SKIPPED`, `SUCCESS`. |
| releaseVersion | The released version string.                                               |
| releaseNotes   | The release notes.                                                         |

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Support and Contribution

Feel free to create [pull requests](https://github.com/btnguyen2k/action-semrelease/pulls) or [issues](https://github.com/btnguyen2k/action-semrelease/issues) to report bugs or suggest new features.
Please search the existing issues before filing new issues to avoid duplicates. For new issues, file your bug or feature request as a new issue.

If you find this project useful, please start it.
