import { isInProgressStatus } from "@/lib/status-colors"
import type { User, Zpod, ZpodNetwork } from "@/types"

/** The OWNER users of a zPod, once each, for links to the Users page */
export function getOwnerUsers(zpod: Zpod): { id: number; username: string }[] {
  const seen = new Map<number, string>()
  for (const p of zpod.permissions ?? []) {
    if (p.permission !== "OWNER") continue
    for (const u of p.users) seen.set(u.id, u.username)
  }
  return [...seen].map(([id, username]) => ({ id, username }))
}

/**
 * Is the given user a maintainer of this zpod? Mirrors the backend
 * ZpodMaintainer rule: superadmin OR OWNER/ADMIN directly OR via a group.
 *
 * On the detail page we use GET /zpods/{id}/permissions/mine — for the list
 * we derive from the already-returned permissions field to avoid N+1 calls.
 */
export function isZpodMaintainer(zpod: Zpod, user: User | null): boolean {
  if (!user) return false
  if (user.superadmin) return true
  return (zpod.permissions ?? []).some(
    (p) =>
      (p.permission === "OWNER" || p.permission === "ADMIN") &&
      (p.users.some((u) => u.id === user.id) ||
        (p.permission_groups ?? []).some((g) =>
          g.users.some((u) => u.id === user.id)
        ))
  )
}

/** Compute the parent /24 CIDR from a list of /26 networks */
export function parentCidr(networks: ZpodNetwork[]): string {
  const first = networks[0]?.cidr
  if (!first) return "—"
  const [ipStr, prefixStr] = first.split("/")
  const parts = ipStr.split(".").map(Number)
  const prefix = parseInt(prefixStr, 10)
  if (prefix <= 24) return first
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}

/** The zPod's own /26s: zpodapi with user networks also returns those (kind "user"),
 *  which belong on the detail page, not in this summary. Older zpodapi has no kind. */
export function zpodSubnets(networks: ZpodNetwork[]): ZpodNetwork[] {
  return networks.filter((n) => !n.kind || n.kind === "zpod")
}

/**
 * How far along a component counts toward its zPod's build, by status, as zpodengine's
 * zpod_component_add flow moves it: BUILDING from prep through the deploy, then POST_SCRIPTS,
 * CONFIG_SCRIPTS, and ACTIVE once finalized. A failed or unknown status counts for nothing.
 */
const COMPONENT_BUILD_WEIGHT: Record<string, number> = {
  BUILDING: 0.3,
  POST_SCRIPTS: 0.7,
  CONFIG_SCRIPTS: 0.9,
  ACTIVE: 1,
}

/** The part of a build that comes before any component: the zPod's vApp and its networking (T1,
 *  segment), done once the zPod leaves PENDING, while every component is still to come */
const ZPOD_SETUP_PCT = 5

/** A building zPod's progress in %: the zPod's own setup first, then each of the profile's
 *  components as an equal share of the rest, filled as far as its status has gone, so the bar
 *  moves at every stage, not only as each one turns ACTIVE. Capped at 100, since a component
 *  added beside the profile counts too. */
export function zpodBuildPct(zpod: Zpod, profileTotal: number): number {
  if (profileTotal <= 0) return 0
  const setup = zpod.status === "PENDING" ? 0 : ZPOD_SETUP_PCT
  const done = (zpod.components ?? []).reduce((sum, c) => sum + (COMPONENT_BUILD_WEIGHT[c.status] ?? 0), 0)
  return Math.min(100, Math.round(setup + (done / profileTotal) * (100 - ZPOD_SETUP_PCT)))
}

/** Where a zPod's own setup stands, the step its build tree shows before any component: zpodengine
 *  sets up DNS, the NSX networking (T1, segment) and the vSphere vApp, then deploys the
 *  components, so it is done as soon as the first component appears */
export function zpodSetupStatus(zpod: Zpod): string {
  if (zpod.status === "PENDING") return "PENDING"
  return (zpod.components ?? []).length > 0 ? "ACTIVE" : "BUILDING"
}

/** Does a zPod show a build progress bar: still building, with a known profile size */
export function zpodShowsProgress(zpod: Zpod, profileTotal: number): boolean {
  return (
    zpod.status !== "ACTIVE" &&
    zpod.status !== "DELETED" &&
    zpod.status !== "DELETING" &&
    !zpod.status.endsWith("_FAILED") &&
    profileTotal > 0
  )
}

/** "just now", "12m ago", "5h ago", "3d ago", then the date */
export function timeAgo(date: string): string {
  const utc = date.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(date) ? date : `${date}Z`
  const secs = Math.max(0, (Date.now() - new Date(utc).getTime()) / 1000)
  if (secs < 60) return "just now"
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d ago`
  return new Date(utc).toLocaleDateString()
}

/** A zPod being built: its profile still has components to deploy (DELETING is in progress too,
 *  but nothing more is coming) */
export function isBuilding(status: string): boolean {
  return isInProgressStatus(status) && status !== "DELETING"
}
