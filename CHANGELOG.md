# Changelog

Notable changes to the zPodFactory web UI, newest first. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version lives in
`package.json` only, its git tag is `vX.Y.Z`, and the About page shows it through
`__APP_VERSION__` (Vite `define`).

Entries describe what changed for the person using the web UI: a page, a dialog, a column, a
connection setting. The commit history has the reasoning. The `0.x` line stays pre-1.0 while
the shape of the UI can still move; a change that breaks a saved target, a URL someone may
have bookmarked or an environment variable is named in a **Breaking** section, which is what
warns a reader, not the digit.

**Cutting a release.** Changes land under `[Unreleased]` as they are made. When enough has
accumulated, `python3 tools/release.py X.Y.Z --push` does the rest: `[Unreleased]` becomes
`[X.Y.Z] — date`, `"version"` moves in `package.json` and `package-lock.json`, `npm run build`
must pass, the commit is tagged `vX.Y.Z` and pushed, and the tag publishes this file's section
as the GitHub release note (`.github/workflows/release.yml`, `tools/release_notes.py`). The
script refuses a dirty tree, an empty `[Unreleased]` (`--from-commits` fills it from the
commits), a version not above the last tag, a tracked `.env`, log, `dist/`, `docs/` or `runs/`,
and any string from the local `.release-denylist`; `--check` runs the same rules, and CI runs
it on every push. Preview a note with `python3 tools/release_notes.py X.Y.Z`.

## [Unreleased]

## [0.1.0] — 2026-10-04

### Added

- **The web UI for zPodFactory**, as a React single-page application talking to `zpodapi`
  through a reverse proxy: dashboard, zPods and zPod detail, components, libraries, profiles,
  endpoints, factory settings, and an About page.
- **Several API targets.** Connection profiles (URL and token) are saved in the browser, one is
  active at a time, a single saved target connects on its own, and the tab title names the
  target you are on.
- **zPod lifecycle from the browser**: create with input groups that follow the factory's
  username-prefix restriction and default domain (the domain is editable by superadmins
  only), enable and disable components, and act on a zPod while its workflow runs without
  double-firing, since action buttons block until it completes.
- **zPod permissions on the detail page**: view, grant and revoke access for users and groups.
- **Endpoints CRUD**, with an optional vSphere Distributed Switch picked from the connected
  vCenter and shown on the endpoints page.
- **Component uploads** through an upload manager with chunked, resumable transfers, and a
  correct build-progress display when several components build in parallel.
- **Profiles**: import and export, where the export carries `host_id` when it is set so a
  profile re-imports as it was.
- **Superadmin views**: how many and which profiles depend on a component, with direct
  navigation to them.
- **Tables** sortable on every column, including creation date.
- **Catppuccin Mocha theme** across the app, with a themed scrollbar and the zPodFactory logo
  as the favicon.
- **Versioning and releases follow the shared zPodFactory standard.** The version comes from
  `package.json` and is shown on the About page; `tools/release.py` (cut, `--check`, `--draft`,
  `--from-commits`) and `tools/release_notes.py` are the same files as in every other
  repository, configured here for `package.json` and `package-lock.json`, and
  `.github/workflows/release.yml` publishes a tag's changelog section as its GitHub release.

### Changed

- **zbox is now zcore** everywhere the UI names the management component.

### Fixed

- **The zPod create dialog scrolls** on short viewports with a large profile: the topology
  diagram can be collapsed and the Create button is always reachable.
