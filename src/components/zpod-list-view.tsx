import { Fragment, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useApi } from "@/hooks/use-api"
import { useCursorCard, useRowHoverCard } from "@/hooks/use-cursor-card"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import { IconTooltip } from "@/components/icon-tooltip"
import { StatusBadge } from "@/components/status-badge"
import { EndpointLink, OwnerLinks, ProfileLink } from "@/components/entity-links"
import { BuildProgressHoverContent } from "@/components/build-progress-hover"
import {
  CalendarClock,
  Info,
  KeyRound,
  Layers,
  Loader2,
  Network,
  Server,
  Trash2,
  User as UserIcon,
} from "lucide-react"
import { buildHoverRows, groupDeployedByUid } from "@/lib/build-progress"
import {
  componentStyles,
  extractComponentType,
  extractComponentVersion,
  getComponentHex,
} from "@/lib/component-colors"
import { flattenProfileItems } from "@/lib/profile-utils"
import { isInProgressStatus, statusHex } from "@/lib/status-colors"
import { cn, formatDateTime } from "@/lib/utils"
import { cidrToGateway, cidrToNetworkIp, cidrToVlanId, cidrToZcoreIp } from "@/lib/network-utils"
import { isNotImplemented } from "@/lib/storage-utils"
import { isBuilding, isZpodMaintainer, parentCidr, timeAgo, zpodBuildPct, zpodSetupStatus, zpodShowsProgress, zpodSubnets } from "@/lib/zpod-utils"
import type { ProfileItem, User, Zpod, ZpodNetwork, ZpodStorageView } from "@/types"

type Steps = (ProfileItem | ProfileItem[])[]


interface Chip {
  uid: string
  total: number
  active: number
}

/** One chip per component uid, from the zPod's live components: the profile it came from may
 *  have changed since (another version, more or fewer VMs). Only while it builds does its profile
 *  add what is still to come, as pending chips; `active` is how many instances are up. */

function componentChips(zpod: Zpod, steps: Steps): Chip[] {
  const chips = new Map<string, Chip>()
  const chip = (uid: string) => {
    let c = chips.get(uid)
    if (!c) chips.set(uid, (c = { uid, total: 0, active: 0 }))
    return c
  }
  const deployed = new Map<string, number>()
  for (const c of zpod.components ?? []) {
    const uid = c.component.component_uid
    deployed.set(uid, (deployed.get(uid) ?? 0) + 1)
    if (c.status === "ACTIVE") chip(uid).active++
    else chip(uid)
  }
  const planned = new Map<string, number>()
  if (isBuilding(zpod.status)) {
    for (const item of flattenProfileItems(steps)) {
      chip(item.component_uid)
      planned.set(item.component_uid, (planned.get(item.component_uid) ?? 0) + 1)
    }
  }
  for (const c of chips.values()) c.total = Math.max(planned.get(c.uid) ?? 0, deployed.get(c.uid) ?? 0)
  return [...chips.values()]
}

/** A quiet chip, so a zPod with many components does not drown its row: small type, a faint
 *  border and tint in the component's color, the version muted. */
function ComponentChip({ chip, building }: { chip: Chip; building: boolean }) {
  const isZcore = extractComponentType(chip.uid) === "zcore"
  const hex = getComponentHex(chip.uid)
  const s = componentStyles(hex)
  const pending = building && chip.active < chip.total
  return (
    <span
      title={chip.uid}
      className={cn(
        "inline-flex items-baseline gap-1 rounded border px-1.5 text-[11px] leading-[18px] whitespace-nowrap",
        isZcore && "border-amber-500/30 bg-amber-500/[0.06]",
        pending && "border-dashed opacity-70"
      )}
      style={isZcore ? undefined : { borderColor: `${hex}40`, backgroundColor: `${hex}0f` }}
    >
      <span className={cn("font-medium uppercase tracking-wide", isZcore && "text-amber-300/90")} style={isZcore ? undefined : s.text}>
        {extractComponentType(chip.uid)}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">{extractComponentVersion(chip.uid)}</span>
      {(chip.total > 1 || pending) && (
        <span className="font-mono text-[10px] font-semibold text-foreground/70">
          {pending ? `${chip.active}/${chip.total}` : `×${chip.total}`}
        </span>
      )}
    </span>
  )
}

function Meta({ icon: Icon, children, title }: { icon: typeof Server; children: React.ReactNode; title?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap" title={title}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      {children}
    </span>
  )
}

/** The zPods' storages, fetched when a hover card opens and kept a minute: hovering along the
 *  list does not refetch, and a card reopened later shows fresh numbers. */
/** Why a zPod's storages could not be read, as the zPod page's Storage card tells them apart:
 *  "old" is zpodapi's 501 (zcore before 13.7 / zboxapi 0.2.1), "denied" a 403, "failed" the rest */
type StorageError = { error: "old" | "denied" | "failed" }
type StorageResult = ZpodStorageView[] | StorageError
const storageCache = new Map<number, { at: number; storages: StorageResult }>()
const STORAGE_TTL_MS = 60_000

function useZpodStorages(zpodId: number) {
  const { fetchZpodStorages } = useApi()
  // The cached result shows at once; undefined while loading
  const [storages, setStorages] = useState<StorageResult | undefined>(() => storageCache.get(zpodId)?.storages)
  useEffect(() => {
    const cached = storageCache.get(zpodId)
    if (cached && Date.now() - cached.at < STORAGE_TTL_MS) return
    let live = true
    fetchZpodStorages(zpodId)
      .then(
        (list): StorageResult => list,
        (err): StorageResult => ({
          error: isNotImplemented(err)
            ? "old"
            : (err as { response?: { status?: number } })?.response?.status === 403
              ? "denied"
              : "failed",
        })
      )
      .then((list) => {
        storageCache.set(zpodId, { at: Date.now(), storages: list })
        if (live) setStorages(list)
      })
    return () => {
      live = false
    }
  }, [zpodId, fetchZpodStorages])
  return storages
}

/** Sizes for a glance: whole GB from 10 GB up, one decimal below, TB from 1000 GB */
function gb(bytes: number): string {
  const g = bytes / 1024 ** 3
  if (g >= 1000) return `${(g / 1024).toFixed(1)} TB`
  return g >= 10 ? `${Math.round(g)} GB` : `${g.toFixed(1)} GB`
}

function UsageBar({ used, size }: { used: number; size: number }) {
  const pct = size > 0 ? Math.min(100, Math.round((used / size) * 100)) : 0
  const color = pct >= 90 ? "#f38ba8" : pct >= 75 ? "#f9e2af" : "#a6e3a1"
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#313244]" title={`${pct}% used`}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/** What a row does not show, for an administrator: status and component health, its storages
 *  with usage and exports, then the facts. (No vCPU or memory: zpodapi does not report the
 *  deployed VMs' sizing, and the profile's numbers miss everything added later.) */
const T1_COLOR = "#cba6f7"
const T0_COLOR = "#89b4fa"
const ZCORE_COLOR = "#fab387"
const ZPOD_NET_COLOR = "#b4befe"
const USER_NET_COLOR = "#94e2d5"
/** mgmt's line in the trunk, and its row: a muted grey, as it is the native (untagged) VLAN */
const MGMT_LINE = "#7f849c"
/** One color per tagged VLAN, along a gradient (peach to mauve), so each tap matches its line */
const VLAN_GRADIENT = ["#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89dceb", "#74c7ec", "#89b4fa", "#b4befe", "#cba6f7", "#f5c2e7"]

/** A tap off the trunk: a horizontal line in the color of the trunk line it takes */
function Tap({ color }: { color: string }) {
  return <span className="h-0.5 w-5 shrink-0" style={{ backgroundColor: color }} />
}

/**
 * The zPod's network as a minimal diagram, no components, the way the Networks card's topology
 * wires it: the zPod's segment, an 802.1Q trunk, drawn as a vertical tube down the left with a
 * line per network (mgmt untagged in grey, a color per tagged VLAN). Everything on it taps off
 * horizontally in the color of the line it uses: the NSX T1 and zcore's eth0 on mgmt, and zcore's
 * eth1 port for each of the zPod's VLAN /26s, then each user network routed globally (LOCAL ones
 * stay out). Every network opens the zPod's Networks table on it.
 */
function MiniNetworkDiagram({ zpod, t0 }: { zpod: Zpod; t0?: string }) {
  const subnets = [...zpodSubnets(zpod.networks ?? [])].sort((a, b) => cidrToNetworkIp(a.cidr) - cidrToNetworkIp(b.cidr))
  // The VLAN zpodapi reports, else the one the /26's last octet implies (older zpodapi)
  const vlanOf = (n: ZpodNetwork) => n.vlan_id ?? cidrToVlanId(n.cidr)
  const mgmt = subnets.find((n) => !vlanOf(n)) ?? subnets[0]
  if (!mgmt) return null
  const zpodVlans = subnets.filter((n) => n !== mgmt)
  const userNets = (zpod.networks ?? []).filter((n) => n.kind === "user" && n.routing === "GLOBAL")
  // Each tagged VLAN's color in the trunk, the same on its tap
  const ports = [
    ...zpodVlans.map((n) => ({ n, vlan: vlanOf(n), name: n.name ?? `vlan${vlanOf(n)}`, color: ZPOD_NET_COLOR, user: false })),
    ...userNets.map((n) => ({ n, vlan: n.vlan_id, name: n.name ?? "user network", color: USER_NET_COLOR, user: true })),
  ].map((p, i) => ({ ...p, line: VLAN_GRADIENT[i % VLAN_GRADIENT.length] }))
  const netLink = (cidr: string) => `/zpods/${zpod.id}?network=${encodeURIComponent(cidr)}`
  const showTitle = (cidr: string) => `Show ${cidr} in ${zpod.name}'s Networks table`
  const row = "flex h-5 items-center"
  // One of zcore's interfaces, in aligned columns and all in its trunk line's color: interface,
  // network, zcore's address on it (the gateway it routes that subnet with), and the subnet
  const ifaceRow = (o: {
    key: string
    tap: string
    iface: string
    name: React.ReactNode
    ip: string
    cidr: string
    title?: string
  }) => (
    <div key={o.key} className={row}>
      <Tap color={o.tap} />
      <Link
        to={netLink(o.cidr)}
        className="group/net grid min-w-0 flex-1 grid-cols-[3rem_minmax(0,1fr)_5.25rem_6rem] items-baseline gap-x-1.5 pl-2 pr-2"
        title={o.title ?? showTitle(o.cidr)}
      >
        <span className="font-mono text-[10px]" style={{ color: o.tap }}>
          {o.iface}
        </span>
        <span className="truncate" style={{ color: o.tap }}>{o.name}</span>
        <span className="font-mono text-[10px]" style={{ color: o.tap }} title={`zcore's address on ${o.cidr}`}>
          {o.ip}
        </span>
        <span
          className="text-right font-mono text-[10px] underline-offset-2 group-hover/net:underline"
          style={{ color: o.tap }}
        >
          {o.cidr}
        </span>
      </Link>
    </div>
  )
  const portRow = (p: (typeof ports)[number]) =>
    ifaceRow({
      key: p.n.cidr,
      tap: p.line,
      iface: `eth1.${p.vlan}`,
      name: p.name,
      ip: p.n.gateway?.split("/")[0] || cidrToGateway(p.n.cidr),
      cidr: p.n.cidr,
    })
  return (
    <div className="text-[11px]">
      <div className="flex">
        {/* The trunk: a tube with mgmt's line and one line per tagged VLAN */}
        <div className="flex shrink-0 gap-px rounded-full border border-[#45475a] bg-[#11111b] px-[3px] py-1.5">
          {[MGMT_LINE, ...ports.map((p) => p.line)].map((c, i) => (
            <span key={i} className="w-0.5 self-stretch rounded-full" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="min-w-0 flex-1 py-1">
          {/* The T1 centered over zcore's box, its mgmt tap running out to it. Its uplink hangs above
              it, out of the flow: the endpoint's T0 (by name) and the physical network over it,
              drawn in the empty strip right of the card's "Network" title, so it costs no height */}
          <div className={row}>
            <Tap color={MGMT_LINE} />
            <span className="h-0.5 flex-1" style={{ backgroundColor: MGMT_LINE }} />
            <div className="relative flex shrink-0">
              {/* Centered: each line meets the boxes in their middle. Its height puts "physical
                  network" level with the zPod's name at the top of the card */}
              <div className="pointer-events-auto absolute bottom-full left-1/2 flex -translate-x-1/2 flex-col items-center">
                <div
                  data-uplink-label
                  className="flex h-3.5 items-center gap-1 whitespace-nowrap text-[10px] leading-3 text-muted-foreground"
                  title="Physical network fabric, and the internet beyond"
                >
                  <Network className="h-3 w-3 shrink-0" aria-hidden />
                  physical network
                </div>
                <span className="block h-[15px] border-l border-dashed border-muted-foreground/60" />
                <span
                  className="inline-flex max-w-[12rem] items-baseline rounded border px-1.5 text-[11px] leading-[14px]"
                  style={{ borderColor: `${T0_COLOR}66`, backgroundColor: `${T0_COLOR}14`, color: T0_COLOR }}
                  title={t0 ? `NSX T0 ${t0}` : "NSX T0"}
                >
                  <span className="truncate font-mono">{t0 || "T0"}</span>
                </span>
                <span className="block h-[14px] w-px" style={{ backgroundColor: T0_COLOR }} />
              </div>
              <span
                className="inline-flex shrink-0 items-baseline gap-1.5 rounded border px-1.5 text-[11px] leading-4"
                style={{ borderColor: `${T1_COLOR}66`, backgroundColor: `${T1_COLOR}14`, color: T1_COLOR }}
              >
                <span className="whitespace-nowrap font-mono">zPod-{zpod.name}-tier1</span>
                <span className="font-mono text-[10px] text-muted-foreground">{cidrToGateway(mgmt.cidr)}</span>
              </span>
            </div>
            <span className="flex-1" />
          </div>
          {/* zcore: a box around its interfaces, each tapping its own line */}
          <div className="relative mt-1">
            <div
              className="pointer-events-none absolute inset-y-0 left-5 right-0 rounded border"
              style={{ borderColor: `${ZCORE_COLOR}55`, backgroundColor: `${ZCORE_COLOR}0a` }}
            />
            <div className="h-1" />
            {ifaceRow({
              key: "eth0",
              tap: MGMT_LINE,
              iface: "eth0",
              name: mgmt.name ?? "mgmt",
              // Untagged: the native VLAN, as its muted line says
              title: `eth0, untagged (native): ${showTitle(mgmt.cidr)}`,
              ip: cidrToZcoreIp(mgmt.cidr),
              cidr: mgmt.cidr,
            })}
            <div className="relative">{ports.filter((p) => !p.user).map(portRow)}</div>
            {userNets.length > 0 && (
              <div className="relative">
                <div className="flex h-4 items-end pl-7 text-[10px] leading-3 text-muted-foreground">user networks · routed globally</div>
                {ports.filter((p) => p.user).map(portRow)}
              </div>
            )}
            <div className="h-1" />
          </div>
        </div>
      </div>
      {/* The segment and what it is, under the tube; zcore names its box on the same line, under
          its corner */}
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[10px] leading-3">
        <span className="truncate text-muted-foreground">
          <span className="font-mono">zPod-{zpod.name}-segment</span> · 802.1Q trunk
        </span>
        <span className="pr-1" style={{ color: ZCORE_COLOR }}>zcore</span>
      </div>
    </div>
  )
}

/** The network diagram's "physical network" sits on the name's line: the name gets the width up to
 *  it, less a gap, and is cut short past that. Measured once the card is laid out, since where the
 *  label lands depends on the T1 box under it, which carries the zPod's name too. */
function fitBesideUplink(name: HTMLSpanElement | null) {
  const card = name?.closest("[data-zpod-card]") as HTMLElement | null
  const label = card?.querySelector("[data-uplink-label]")
  if (!name || !card || !label) return
  const scale = card.getBoundingClientRect().width / card.offsetWidth || 1 // the open animation scales it
  const free = (label.getBoundingClientRect().left - name.getBoundingClientRect().left) / scale - 12
  name.style.maxWidth = `${Math.max(free, 48)}px`
}

/** A zPod's summary card. `alignOffset` moves it right from its trigger's left edge, so a list
 *  row can open it under the cursor. */
export function ZpodDetails({ zpod, t0, alignOffset = 0 }: { zpod: Zpod; t0?: string; alignOffset?: number }) {
  const components = zpod.components ?? []
  const storages = useZpodStorages(zpod.id)
  const zcoreUid = components.find((c) => extractComponentType(c.component.component_uid) === "zcore")?.component.component_uid
  const zcoreVersion = zcoreUid ? `zcore ${extractComponentVersion(zcoreUid)}` : null
  return (
    <HoverCardContent
      side="bottom"
      align="start"
      alignOffset={alignOffset}
      data-zpod-card
      className="w-[min(26rem,calc(100vw-2rem))] space-y-3 border-[#313244] bg-[#181825] p-4 text-xs shadow-lg shadow-black/30"
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <span ref={fitBesideUplink} className="min-w-0 truncate text-sm font-semibold" title={zpod.name}>
            {zpod.name}
          </span>
          <StatusBadge status={zpod.status} />
        </div>
        {zpod.description && <p className="mt-1 text-muted-foreground">{zpod.description}</p>}
      </div>

      {(zpod.networks ?? []).length > 0 && (
        <div className="space-y-1.5">
          <div className="text-muted-foreground">Network</div>
          <MiniNetworkDiagram zpod={zpod} t0={t0} />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-muted-foreground">Storage</div>
        {storages === undefined ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Reading storages…
          </div>
        ) : "error" in storages ? (
          <div className="text-muted-foreground">
            {storages.error === "old"
              ? `Needs zcore 13.7 or later${zcoreVersion ? ` (this zPod runs ${zcoreVersion})` : ""}`
              : storages.error === "denied"
                ? "Not visible with your access to this zPod"
                : "Could not be read from zcore right now"}
          </div>
        ) : storages.length === 0 ? (
          <div className="text-muted-foreground">No storage</div>
        ) : (
          // One grid for every storage: the bars share a column, so they are all the same width
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
          {storages.map((st) => (
            <div key={st.name} className="contents">
              <Link
                to={`/zpods/${zpod.id}?storage=${encodeURIComponent(st.name)}`}
                className="truncate font-mono hover:text-[#89b4fa] hover:underline underline-offset-2"
                title={`Open ${st.name} in ${zpod.name}'s Storage card`}
              >
                {st.name}
              </Link>
              <UsageBar used={st.used_bytes} size={st.size_bytes} />
              <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                <span className="text-foreground/90">{gb(st.used_bytes)}</span> / {gb(st.size_bytes)}
              </span>
            </div>
          ))}
          </div>
        )}
      </div>

    </HoverCardContent>
  )
}

/** The zPods page's Columns menu: the same choices decide what each row shows */
export type ZpodListColumns = Record<"profile" | "endpoint" | "networks" | "owners" | "created", boolean>

interface ZpodListViewProps {
  zpods: Zpod[]
  columns: ZpodListColumns
  profileSteps: Map<string, Steps>
  /** Each endpoint's NSX T0 by endpoint id, for the hover card's network diagram */
  t0ByEndpoint?: Map<number, string>
  user: User | null
  onCopyPassword: (zpod: Zpod) => void
  onDestroy: (zpod: Zpod) => void
}

/** The zPods as a list of rich rows: status accent, name and domain, the components it runs
 *  (colored as in the topology), its network, endpoint, owners and age, and the actions. */
export function ZpodListView({ zpods, columns, profileSteps, t0ByEndpoint, user, onCopyPassword, onDestroy }: ZpodListViewProps) {
  const navigate = useNavigate()
  const details = columns.endpoint || columns.owners || columns.created
  // The zPod's summary opens from its networks only (under the cursor); a building zPod's
  // progress from anywhere else on its row. An active zPod's row opens nothing else: a card on
  // the whole row is too much while scanning the list
  const card = useCursorCard()
  // The summary card counts too: it is rendered inside the row, so the cursor in it is on the row
  const buildCard = useRowHoverCard("[data-zpod-networks], [data-zpod-card]")
  return (
    <div className="space-y-2">
      {zpods.map((zpod) => {
        const steps = profileSteps.get(zpod.profile) ?? []
        const total = flattenProfileItems(steps).length
        const showProgress = zpodShowsProgress(zpod, total)
        const pct = zpodBuildPct(zpod, total)
        const chips = componentChips(zpod, steps)
        const subnets = zpodSubnets(zpod.networks ?? [])
        // User networks routed through the factory's T0: reachable from outside, worth seeing here
        const globalUserNets = (zpod.networks ?? []).filter((n) => n.kind === "user" && n.routing === "GLOBAL")
        // The badge's own color, so the bar and the badge always agree
        const accent = statusHex(zpod.status)
        const rowBody = (
          <div className="group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-[#89b4fa]/40 hover:bg-muted/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            {/* The status, as a bar in the status badge's color: striped and moving while something
                happens */}
            <div
              className={cn("absolute inset-y-0 left-0 w-1.5", isInProgressStatus(zpod.status) && "status-stripes")}
              style={{ backgroundColor: accent }}
              title={zpod.status}
            />
            <span className="sr-only">Status: {zpod.status}</span>
            <div className="flex flex-col gap-3 py-3 pl-6 pr-3 md:flex-row md:items-start md:gap-5">
              {/* Identity */}
              <div className="min-w-0 md:w-52 md:shrink-0">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/zpods/${zpod.id}`)}
                    className="truncate text-left text-base font-semibold text-primary outline-none after:absolute after:inset-0 after:content-[''] group-hover:underline"
                  >
                    {zpod.name}
                  </button>
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{zpod.domain}</div>
                {/* The status in words when it is not ACTIVE: the bar alone does not say whether
                    the zPod is building, being deleted or failed (a spinner while in progress) */}
                {zpod.status !== "ACTIVE" && (
                  <div className="mt-1.5 text-[10px] [&>*]:px-1.5 [&>*]:py-0 [&>*]:text-[10px]">
                    <StatusBadge status={zpod.status} />
                  </div>
                )}
              </div>

              {/* Profile and its components */}
              {/* flex-1 even when hidden: status and actions stay on the right */}
              <div className="min-w-0 flex-1 space-y-1.5">
                {columns.profile && (
                <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Profile">
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  <ProfileLink name={zpod.profile} className="font-medium text-foreground" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {chips.length ? (
                    chips.map((chip) => <ComponentChip key={chip.uid} chip={chip} building={isBuilding(zpod.status)} />)
                  ) : (
                    <span className="text-xs text-muted-foreground">No components yet</span>
                  )}
                </div>
                </>
                )}
              </div>

              {/* Where it runs: the zPod's /24 and the user networks routed globally, then endpoint, owners, age */}
              {(columns.networks || details) && (
              <div
                className={cn(
                  "grid shrink-0 gap-x-4 text-xs text-muted-foreground",
                  // Sized to what the columns hold (a /24 with its subnet count; a short endpoint,
                  // owner or age), so the details sit close to the actions; longer text truncates
                  columns.networks && details
                    ? "grid-cols-2 md:grid-cols-[220px_100px]"
                    : columns.networks ? "md:w-[220px]" : "md:w-[100px]"
                )}
              >
                {columns.networks && (
                <HoverCard onOpenChange={card.onOpenChange}>
                {/* Above the row's link (z-10), so resting anywhere on it opens the zPod's summary */}
                <HoverCardTrigger asChild onPointerMove={card.onPointerMove}>
                <div data-zpod-networks className="relative z-10 min-w-0 cursor-default space-y-1">
                  <Meta icon={Network} title={subnets.map((n) => n.cidr).join("\n")}>
                    {subnets.length ? (
                      <Link
                        to={`/zpods/${zpod.id}?network=${encodeURIComponent(parentCidr(subnets))}`}
                        className="relative z-10 font-mono text-[#b4befe] underline-offset-2 hover:underline"
                        title={`Show ${zpod.name}'s subnets in its Networks table`}
                      >
                        {parentCidr(subnets)}
                      </Link>
                    ) : (
                      <span className="font-mono">—</span>
                    )}
                    {subnets.length > 1 && <span className="text-muted-foreground/70">· {subnets.length} subnets</span>}
                  </Meta>
                  {/* pl-5: the icon's width and gap, so each subnet sits right under the /24 */}
                  {globalUserNets.map((n) => (
                    <div key={n.cidr} className="whitespace-nowrap pl-5 font-mono">
                      <Link
                        to={`/zpods/${zpod.id}?network=${encodeURIComponent(n.cidr)}`}
                        className="relative z-10 text-[#94e2d5] underline-offset-2 hover:underline"
                        title={`User network${n.name ? ` ${n.name}` : ""}, routed globally: show it in ${zpod.name}'s Networks table`}
                      >
                        {n.cidr}
                      </Link>
                    </div>
                  ))}
                </div>
                </HoverCardTrigger>
                <ZpodDetails zpod={zpod} t0={zpod.endpoint ? t0ByEndpoint?.get(zpod.endpoint.id) : undefined} alignOffset={card.alignOffset} />
                </HoverCard>
                )}
                {details && (
                <div className="min-w-0 space-y-1">
                  {columns.endpoint && (
                    <Meta icon={Server}>
                      <EndpointLink endpoint={zpod.endpoint} className="truncate text-foreground/90" />
                    </Meta>
                  )}
                  {columns.owners && (
                    <Meta icon={UserIcon}>
                      <OwnerLinks zpod={zpod} className="truncate" />
                    </Meta>
                  )}
                  {columns.created && (
                    <Meta icon={CalendarClock} title={formatDateTime(zpod.creation_date)}>
                      <span className="tabular-nums">{timeAgo(zpod.creation_date)}</span>
                    </Meta>
                  )}
                </div>
                )}
              </div>
              )}

              {/* Actions, above the stretched link. A fixed width from md up, so a missing Destroy
                  button (not a maintainer) never moves a column. */}
              <div className="relative z-10 flex shrink-0 items-center md:justify-end">
                <div className="flex items-center gap-1 md:w-[92px]">
                  <IconTooltip label="Copy password">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onCopyPassword(zpod)} aria-label="Copy password">
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                  </IconTooltip>
                  <IconTooltip label="View details">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate(`/zpods/${zpod.id}`)} aria-label="View details">
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </IconTooltip>
                  {isZpodMaintainer(zpod, user) && (
                    <IconTooltip label="Destroy">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => onDestroy(zpod)}
                        aria-label="Destroy"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </IconTooltip>
                  )}
                </div>
              </div>
            </div>
            {showProgress && <Progress value={pct} className="h-1 w-full rounded-none" />}
          </div>
        )
        if (!showProgress) return <Fragment key={zpod.id}>{rowBody}</Fragment>
        // A building zPod's row opens its progress under the cursor, its networks excepted
        return (
          <HoverCard key={zpod.id} {...buildCard.root(zpod.id)}>
            <HoverCardTrigger asChild {...buildCard.trigger()}>
              {rowBody}
            </HoverCardTrigger>
            <BuildProgressHoverContent
              setupStatus={zpodSetupStatus(zpod)}
              creationDate={zpod.creation_date}
              pct={pct}
              hoverRows={buildHoverRows(steps)}
              deployedByUid={groupDeployedByUid(zpod.components ?? [])}
              side="bottom"
              align="start"
              alignOffset={buildCard.alignOffset}
            />
          </HoverCard>
        )
      })}
    </div>
  )
}
