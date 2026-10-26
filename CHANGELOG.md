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

### Added

- **Users page.** Superadmins create users (the API token is shown with a copy button), edit
  them, reset their token, enable, disable or delete them, and see which groups each one
  belongs to; other users see and edit their own profile only.
- **Groups page.** Superadmins create, rename and delete permission groups and manage their
  members, so zPod and endpoint access can be granted to a team at once.
- **Endpoint access.** Each endpoint card gets an Access section where superadmins grant or
  revoke the users and groups who can see and use it.
- **zPod networks on the zPod detail page**, the web side of `zcli zpod network` (zpodapi with
  user networks). The Networks card, now full width, lists every network on zcore with its live
  status, grouped by kind (zPod networks, routed globally; zCore networks, local; user
  networks) in groups you can fold, remembered between visits. A maintainer adds a VLAN network
  (the dialog derives the subnet from the gateway, shows the usable range and how many IPs it
  holds, and catches reserved VLANs, duplicates and overlaps before sending), enables or
  disables it, turns masquerade on or off, and removes it; a superadmin advertises it to the
  NSX fabric or withdraws it, optionally as a dry run of the checks, and follows the routing
  run to its verdict, with the failing check shown when it fails. After a dry run passes,
  "Advertise for real" starts the real run at once.
- **A Topology tab in the Networks card** that draws zcore and everything upstream of it,
  with the T1's interface and address on the zPod segment, and for a picked network animates
  the path to the internet, from the fabric and to the management network, saying why each
  one works or is blocked. The tab, network and path are
  in the URL, so a link opens the same view.
- **zPod storage on the zPod detail page**, the web side of `zcli zpod disk`, `zcli zpod storage`
  and `zcli zpod nfs` (zcore with zboxapi 0.2.1). A Storage card under Networks lists the
  storages with their folders as a tree, each with a usage bar coloured by how full it is (the
  sizes on hover), its raw or LVM layout, mount, disk and NFS clients, and a pulsing dot on a
  folder some host has mounted (who, on hover), with its share (`zcore.<domain>:<path>`) one
  click from the clipboard; above it a line gives the NFS server's state,
  and below it come the blank and leftover disks and the system exports outside /FILER. A
  Layout tab draws each of zcore's disks with what is on it, and the space they add up to. A
  maintainer adds a storage on a new disk or a blank one (following the vCenter run, then
  zcore's steps), grows it, adds folders, changes their owner and mode, exports them to any
  host or chosen clients (the zPod's networks offered in one click, with ready-to-copy ESXi
  and Linux mount commands), deletes a storage either keeping its data on the disk or removing
  the disk too, after typing its name, and removes a blank or leftover disk. What cannot be
  changed (STORAGE01, NFS-01, the deploy's disks, system exports) shows disabled with the
  reason, and an older zcore gets a note instead of failing on click.

### Changed

- **The Network Topology card** lists every zcore interface grouped by kind with a live status
  dot, and its T1 static routes include the user networks that are advertised or being
  advertised.
- On a zPod whose zcore is older than 13.7, masquerade and enable/disable are shown as
  unavailable instead of failing after the click, since zboxapi before 0.2.0 has neither.
- **The zPods list's Networks column** shows only the zPod's own subnets, with the VLAN zpodapi
  reports, so a user network no longer appears there as "VLAN 0"; user networks are on the
  zPod's detail page.

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
