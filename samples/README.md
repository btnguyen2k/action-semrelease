# Sample workflows

Copy the reusable CI file and **exactly one** release variant into your project's
`.github/workflows` directory. Keep the filenames, or update the release
workflow's local `uses` path. Setup and behavior are documented inline.

| Ecosystem | Reusable CI | Release from commit history | Release with committed metadata |
|-----------|-------------|-----------------------------|---------------------------------|
| Go | [go-ci.yaml](go-ci.yaml) | [go-release.yaml](go-release.yaml) | [go-release-metadata.yaml](go-release-metadata.yaml) |
| npm | [npm-ci.yaml](npm-ci.yaml) | [npm-release.yaml](npm-release.yaml) | [npm-release-metadata.yaml](npm-release-metadata.yaml) |
| NuGet | [nuget-ci.yaml](nuget-ci.yaml) | [nuget-release.yaml](nuget-release.yaml) | [nuget-release-metadata.yaml](nuget-release-metadata.yaml) |

## Release flow

All release samples trigger when a PR targeting the **`release` branch is closed**.
Only merged PRs proceed; closing without merging skips all jobs. Create the branch,
or update both `env.RELEASE_BRANCH` and the literal PR branch filter to use another
name. Trigger filters cannot reference `env`; the publishing action uses
`${{ env.RELEASE_BRANCH }}`.

The merged SHA is captured once and passed to reusable CI for testing and a
read-only release preview. A `SUCCESS` preview enables tag/release publication
at that same SHA; `SKIPPED` publishes nothing, and failures block downstream jobs.
Go modules need no uploaded assets. npm and NuGet publish directly to their
registries without GitHub artifact uploads. Publication is serialized
without cancelling an in-progress run.

All release workflows then open a PR from `RELEASE_BRANCH` to `main`,
reusing an existing open PR if present. Metadata variants wait for cleanup to succeed.
Failed, skipped, and dry-run releases create no PR; no workflow auto-merges it.
If PR creation fails, inspect existing PRs and retry only the `mergeToMain` job.

CI also runs on pushes and PR updates. Standalone PRs test the synthetic merge
commit but preview the base branch's history/metadata, not the proposed PR changes:
the synthetic merge is not yet reachable from the base branch. A caller-supplied
full 40-character `target-sha` overrides both targets.

## Choosing the metadata source

The `*-release.yaml` variants assume `.semrelease/this_release` is absent and use
commit history. Example message prefixes are `breaking change:` (major), `feat:`
(minor), and `fix:` (patch); preserve these messages in your merge strategy.

The `*-release-metadata.yaml` variants expect that file to be prepared in the PR;
each includes an inline format example with an optional `#!VERSION=x.y.z`.
File messages replace history; if none qualify, publication is skipped without
history fallback. Without file messages, history is used and any forced version is
retained; a version alone cannot force publication without qualifying messages.

Selection is automatic at the pinned GitHub SHA; neither variant enforces file
presence/absence, and no preparation commits are made. After successful publication,
the metadata workflows reset an existing file to comments and push a separate
cleanup commit to `RELEASE_BRANCH`; the released tag stays on the tested commit.
Dry runs (`DRY_RUN=true` or `.semrelease-dry-run`) leave metadata unchanged.
Branch protection must allow that `GITHUB_TOKEN` push. If the branch advances, the
non-forced push fails: inspect and finish cleanup manually without rerunning
publication.

## Project setup and permissions

- **Go:** root `go.mod` for a module/library; no `main` package is required.
  Publishes a version tag and release notes; Go tooling fetches the tagged source.
- **npm:** root project with committed `package-lock.json` and a `test` script;
  optional `build` script. Publishes a public package to npm using the GitHub release
  version, without committing package/version changes or attaching an artifact.
  Prereleases use the `next` dist-tag; stable versions keep npm's `latest` default.
- **NuGet:** root solution and one packable project; set `PACKAGE_PROJECT` in the
  release workflow. Builds one `.nupkg` using the GitHub release version and pushes
  it directly to NuGet.org, without editing the project or attaching an artifact.

Adapt SDK versions, project commands, and private dependency authentication.
Keep reusable CI available at the merged commit.
Pin external actions to reviewed SHAs if your policy requires it.

The automatic `GITHUB_TOKEN` needs `contents: read` for CI/packaging; only
publication requests `contents: write`. No custom secret is needed for public dependencies.
Ordinary fork PRs receive read-only CI.

The npm release job uses `id-token: write` for trusted publishing on GitHub-hosted
runners (Node 24, latest stable npm). `npm publish` automatically requests and
exchanges OIDC tokens; no `npm login`, separate authentication action, or
`NPM_TOKEN`/`NODE_AUTH_TOKEN` publishing secret is needed. Public source repositories
also get provenance automatically, without `--provenance`.

These samples assume an existing npm package: in its Settings > Trusted publishing,
configure GitHub Actions with your owner/repo and the exact selected workflow
filename (not a path), explicitly allowing `npm publish`, not only staging. Leave
the environment field blank unless you add a matching environment to the release
job. Complete the first publish within 2 days of setup; expired configurations
must be recreated. Set `package.json`'s `repository.url` to match the GitHub
repository. Bootstrap new packages separately; private dependencies still need
read-only credentials scoped to installation in both CI and the release job.

NuGet also uses `id-token: write`, but requires an explicit `NuGet/login@v1` step
after packing to obtain a 1-hour API key for `dotnet nuget push`. Configure a
NuGet.org Trusted Publishing policy for your owner/repo, selected workflow filename
(no path), and package IDs, with permission to publish the needed packages/versions.
Leave the environment blank unless the release job declares a matching environment.
Set repository secret `NUGET_USER` to your NuGet.org profile name, not your email;
no long-lived API-key secret is needed. Pending policies need a first publish
within their 7-day activation window, or the window must be restarted.

Each `mergeToMain` job requests `pull-requests: write`. Repository/organization
Actions settings must allow GitHub Actions to create pull requests.

npm and NuGet create the GitHub release first, then build and publish the package
using its actual version. Publication cannot be atomic across services: inspect
partial failures and finish missing publication/cleanup manually. NuGet version
conflicts fail rather than being silently skipped. Rerunning does not repair an
already-existing release; do not undo successful publication to retry.
