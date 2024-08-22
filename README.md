# SemRelease

[![Release](https://img.shields.io/github/release/btnguyen2k/action-semrelease.svg?style=flat-square)](RELEASE-NOTES.md)
[![Actions Status](https://github.com/btnguyen2k/action-semrelease/actions/workflows/test.yaml/badge.svg)](https://github.com/btnguyen2k/action-semrelease/actions)
[![codecov](https://codecov.io/gh/btnguyen2k/action-semrelease/branch/main/graph/badge.svg)](https://codecov.io/gh/btnguyen2k/action-semrelease)

GitHub Action to automatically create releases with tags, following [semantic versioning](https://semver.org/spec/v2.0.0.html) conventions.

## Usage

Use this Action as a step in your workflow file. For example:

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    outputs:
      RESULT: ${{ steps.release.outputs.result }}
      VERSION: ${{ steps.release.outputs.releaseVersion }}
      RELEASE_NOTES: ${{ steps.release.outputs.releaseNotes }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
      - name: Release
        id: release
        uses: btnguyen2k/action-semrelease@v3
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

  post-release:
    runs-on: ubuntu-latest
    needs: [release]
    steps:
      - name: Print release result
        run: |
          RESULT='${{ needs.release.outputs.RESULT }}'
          VERSION='${{ needs.release.outputs.VERSION }}'
          RELEASE_NOTES='${{ needs.release.outputs.RELEASE_NOTES }}'
          echo "- RESULT: ${RESULT}"
          echo "- VERSION: ${VERSION}"
          echo "- RELEASE_NOTES: ${RELEASE_NOTES}"
```

## How it works

This Action analyzes commit messages to determine if a new release is needed, and if so, automatically calculates the next version number and creates a new release tag with release notes compiled from commit messages. The following screenshot illustrates the result:

![Releases and Tags](docs/semrelease-releases-and-tags.png)

> The version number follows [semantic versioning](https://semver.org/spec/v2.0.0.html) conventions. The tag name can have an optional prefix, for example `v` (e.g. `v1.2.3`).

### Versioning rules

A new major version is released when a breaking change is detected in commit messages.
A new minor version is released when new or deprecated features are detected.
A new patch version is released when only bug fixes or improvements/optimizations are detected.

The following regular expressions are used to detect breaking changes, new features, and bug fixes:

```regexp
A breaking change is detected if any of the following rules match:

/^[^a-z]*(break(ing)?\s+)?change([ds])?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*break(ing)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*rem(ove([ds])?)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*ren(ame([ds])?)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*repl(ace([ds])?)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*redesign(ed|s)?(\([^)]+\)\s*)?:?\s+/i

A new/deprecated feature is detected if any of the following rules match:

/^[^a-z]*depr(ecate([ds])?)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*refactor(ed|s)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*add(ed|s)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*(new\s+)?feat(ure)?(\([^)]+\)\s*)?:?\s+/i

A bug fix/improvement/optimization is detected if any of the following rules match:

/^[^a-z]*fix(ed|es)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*patch(ed|es)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*improve(s|d|ment)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*dep(endenc(y|ies))?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*perf(ormance)?(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*optimiz(e|ation|es|ed)(\([^)]+\)\s*)?:?\s+/i
/^[^a-z]*sec(urity)?(\([^)]+\)\s*)?:?\s+/i
```

The following table illustrates how commit messages are mapped to release versions:

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

### Inputs and Outputs

Inputs are supplied via the `with` block. For example:

```yaml
uses: btnguyen2k/action-semrelease@v3
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  dry-run: true
```

The following inputs are accepted:

| Input                         | Required | Default         | Description                                                                   |
|-------------------------------|----------|-----------------|-------------------------------------------------------------------------------|
| github-token                  | Yes      |                 | Either a PAT or GITHUB_TOKEN to access the repository.                        |
| dry-run                       | No       | `false`         | If `true`, the Action will run in dry-run mode.                               |
| tag-prefix                    | No       | `'v'`           | Prefix for release tags.                                                      |
| tag-major-release             | No       | `true`          | If `true`, a major release tag will be created, e.g. `v1`                     |
| tag-minor-release             | No       | `false`         | If `true`, a minor release tag will be created, e.g. `v1.2`                   |
| branches                      | No       | `'main,master'` | Comma-separated list of branches to scan for commit messages.                 |
| path                          | No       | `''`            | Scan and Analyze only commits containing this file path.                      |

> ⚠️ **Deprecation notice**: beginning with version [v3.4.0](RELEASE-NOTES.md), the `auto-mode` and `changelog-file` inputs are deprecated
> and will be removed in future releases.

This Action outputs the following:

| Output         | Description                                                                          |
|----------------|--------------------------------------------------------------------------------------|
| result         | The result of the Action's run. Possible values are `FAILED`, `SKIPPED`, `SUCCESS`.  |
| releaseVersion | The releasing version string, e.g. `1.2.3` (`tag-prefix` is not included!)           |
| releaseNotes   | The release notes.                                                                   |

## Customizing Version Numbers and Commit Messages

There may be scenarios where you want to customize the version number for a release. For instance, if the current version is `3.4.5` but you prefer the new release to be `6.0.0` instead of `3.4.6` or `3.5.0` or `4.0.0`. Additionally, since commit messages are used to compile the release notes, you might want to customize which commit messages are analyzed and included.

These customizations can be achieved by using the `.semrelease/this_release` file located in the repository's root directory. This file is a simple text file containing the following information:

```text
# Lines starting with '#' are comments and will be ignored.

Lines not starting with '#' are commit messages and will be used to analyze and compile the release notes.

- Each line should contain a single commit message only.

= Leading spaces and markers such as `-`, '=', `+`, etc. will be trimmed before analyzing the commit message.
```

If the `.semrelease/this_release` file does not exist or contains no commit messages, the Action will fallback to analyzing commit messages from the repository's commits.

## License

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.

## Support and Contribution

Feel free to create [pull requests](https://github.com/btnguyen2k/action-semrelease/pulls) or [issues](https://github.com/btnguyen2k/action-semrelease/issues) to report bugs or suggest new features.
Please search the existing issues before filing new ones to avoid duplicates. For new issues, file your bug or feature request as a new issue.

If you find this project useful, please start it.
