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

- zPods page: a List view next to the Table; Preferences sets the view the page opens in, and
  the page's toggle switches for that visit. Each zPod is a row with its status as a colored bar
  (striped and moving while it builds or is deleted), its live components in their topology
  colors (a building zPod also shows what is still to come), a status badge under its name and domain
  when it is not ACTIVE (deleting, building, failed), its /24 and the user networks it
  routes globally, endpoint, owners and age, so a whole factory reads at a glance. In both views,
  resting anywhere on a building zPod's row but its networks opens the build's progress, and resting on a zPod's networks opens, under the cursor, a short summary for
  administrators: a small network diagram (the zPod's
  segment as a vertical 802.1Q trunk, a line per VLAN, mgmt's native one muted, with the NSX T1
  (and its uplink to the endpoint's T0 and the fabric) and zcore tapping it: eth0 untagged on
  mgmt, an eth1 port in its VLAN's color for each VLAN /26, then for each user network routed
  globally, each with zcore's address on it and the subnet it routes), each storage's usage (a
  network or a storage opens in the zPod's Networks or Storage card); the row already shows the
  endpoint, owners and age, so the summary does not repeat them. The Columns menu applies to
  both views.
- zPods page and zPod detail page: profile, endpoint and owner names are links. They open the
  Profiles, Endpoints or Users page scrolled to that item and outlined for a few seconds (a profile
  also opens expanded), as a group badge already does on the Users page. A network opens the zPod's Networks table with
  it outlined; the zPod's /24 frames its whole zPod Networks group.
- Dashboard: each count opens the zPods page on that status and lists its zPods on hover; a
  profile's bar opens the zPods page filtered on it and lists its zPods as a tree, and so does each
  row of the new zPods per Endpoint card. A Needs attention strip appears only when a zPod failed
  or has components down. Recent zPods spans the page with the last 10, now with their owners
  and the time since each was deployed, profile, endpoint and owner as links, a Network column
  (the zPod's /24 and the user networks it routes globally, each opening its Networks table), and
  the zPod's summary on its Network cell and, as on the zPods page, a building zPod's progress
  anywhere else on its row.
- Endpoints page: an Advertised networks section on each endpoint. Its zPod range is drawn as a
  map of /24s, each zPod's in its status color (pulsing while it builds or is deleted) and marked with how many user networks it
  advertises globally (the zPod's summary on hover, its page on click), with how many
  are used; below it, the user networks the zPods route globally, which sit
  outside that range, as a tree that grows downward however many zPods advertise: physical
  network, the endpoint's T0, each zPod's T1 and the networks it advertises. A zPod outside the range, or a user network inside it, is
  flagged.
- Libraries page: each library shows how many components it holds and how many are active,
  refreshed with the page, so a resync's new components show as they land (after a resync the
  number pops as it changes); it opens the Components page on that library.
- Components page: a library filter next to the status one, as the zPods page's profile filter
  (offered when there is more than one library, highlighted while it narrows the list).
- Components page: deleted components are no longer listed, counted or offered in the filters, and
  the Status column says ACTIVE or INACTIVE instead of the download's NOT_STARTED or COMPLETED;
  it shows the download only while one runs (its progress) or after one failed (the reason on
  hover). The table keeps every column and fits its card instead of scrolling sideways: the
  description takes the room the others leave and truncates (the full text on hover).

### Changed

- zPods page: the profile, endpoint and owner filters and a sort menu sit in the toolbar for both
  views, so switching views keeps them in place; the table's Profile, Endpoint and Owner headers
  now sort like the others.
- A building zPod's progress bar moves at each stage instead of only when a component turns
  ACTIVE: 5% once the zPod leaves PENDING (its vApp and networking, before any component), then
  each component counts 30% of its share while BUILDING, 70% in POST_SCRIPTS, 90% in
  CONFIG_SCRIPTS and all of it once ACTIVE, on the zPods page, the zPod page and the Dashboard.
  The build tree starts with a "Network & vApp" step, so those first 5%
  read as work too.
- Every hover card waits the same 700 ms before opening (it used to vary from 150 to 700 ms by
  page), so sweeping the mouse across a page no longer pops cards open on the way. Button labels
  still show after 300 ms.

## [0.3.1] — 2026-11-02

### Security

- Dependencies updated within their ranges (axios 1.21, react-router 7.18.5 and what they pull
  in), which clears every advisory `npm audit` reported against the shipped app.

### Fixed

- Dialogs that reset or load their fields when opened (add component, profile editor, profile
  import, API target) now do it before the first paint, so the previous values no longer flash
  for a frame.

## [0.3.0] — 2026-10-29

### Added

- Component placement and network (zpodcore 0.9.x): the Add component dialog and each profile
  item have a folded "Placement & network" section: nested or on the endpoint, a VLAN ID, and
  for nested components the portgroup, IP/prefix, gateway and DNS. Components with a fixed
  placement (zcore, vyos, vcsa, esxi, proxmox…) only take a VLAN ID. Without a vCenter in the zPod (or in an
  earlier step of the profile), Nested is not offered and the network fields stay off. VLAN ID
  and IP exclude each other, as zpodapi requires. Profile cards show these
  settings on each component, so a VLAN or endpoint profile reads at a glance.
- Host ID: right of the label, live as you type: the address the component gets when the host ID
  fits (green), else the network (the VLAN ID's, or mgmt) and the host IDs it takes
  (`vlan64 [66–126]`, red when outside). The profile editor knows the deploy networks (mgmt, 64,
  128, 192) and shows the address as `x.x.x.N`.
- Network Topology: a component on a VLAN network gets a VLAN badge under its IP (with the
  network's name for a user network); untagged components stay as they were.

### Fixed

- Profiles: saving a profile in the editor, importing one or copying its JSON keeps the
  placement and network settings zcli can now set on an item (`nested`, `network`, `vlan_id`,
  zpodcore 0.9.x), where it used to drop them silently.
- zPod components: a Talos component shows a copyable `talosctl` command under API Access
  instead of an empty credentials cell, and images with their own login user (ubuntu, zbox,
  RHCOS) show it.
- Adding or removing a component, and creating, updating, importing or deleting a profile, now
  show zpodapi's reason when it refuses, not only "Failed to …".

### Changed

- zPod detail page: the zPod's details, Permissions and Network Topology now come first, above
  Networks, Storage and Components, so who can use the zPod and its shape are seen first.
- Users page: superadmins get an amber shield before their name instead of a badge, and your own
  row is marked by a blue edge instead of a "You" badge, so the names read cleanly. Rows are
  tighter, and a user's group badges open that group on the Groups page.

## [0.2.0] — 2026-10-26

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
