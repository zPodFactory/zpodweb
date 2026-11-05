import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock,
  Hammer,
  Layers,
  Server,
} from "lucide-react"
import { toast } from "sonner"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useCursorCard, useRowHoverCard } from "@/hooks/use-cursor-card"
import { HOVER_CARD_DELAY } from "@/lib/hover"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { StatusBadge } from "@/components/status-badge"
import { TreeConnector, TreeTrunk } from "@/components/tree-trunk"
import { BuildProgressHoverContent } from "@/components/build-progress-hover"
import { EndpointLink, OwnerLinks, ProfileLink } from "@/components/entity-links"
import { ZpodDetails } from "@/components/zpod-list-view"
import { buildHoverRows, groupDeployedByUid } from "@/lib/build-progress"
import { flattenProfileItems } from "@/lib/profile-utils"
import { extractComponentType } from "@/lib/component-colors"
import { isInProgressStatus, statusHex } from "@/lib/status-colors"
import { parentCidr, timeAgo, zpodBuildPct, zpodSetupStatus, zpodShowsProgress, zpodSubnets } from "@/lib/zpod-utils"
import { cn, formatDateTime } from "@/lib/utils"
import type { Profile, ProfileItem, Zpod } from "@/types"

const BAR_PALETTE = [
  "#89b4fa", "#f5c2e7", "#a6e3a1", "#fab387", "#f38ba8", "#cba6f7", "#94e2d5",
  "#f9e2af", "#74c7ec", "#b4befe", "#eba0ac", "#89dceb", "#f2cdcd", "#f5e0dc",
]

/** How many recent zPods the dashboard lists */
const RECENT = 10
/** Most zPods a tree lists in a hover card or tooltip; the rest are counted */
const TREE_MAX = 12

const isFailed = (z: Zpod) => z.status.endsWith("_FAILED")

/** Components of a zPod that are not ACTIVE */
function downComponents(z: Zpod) {
  return (z.components ?? []).filter((c) => c.status !== "ACTIVE")
}

/**
 * zPods as a tree, each with its status: the layout of the build progress hover card's
 * components, so the dashboard's hover cards read the same way.
 */
function ZpodTree({ zpods }: { zpods: Zpod[] }) {
  const shown = zpods.slice(0, TREE_MAX)
  return (
    <>
      <div>
        {shown.map((z, i) => (
          <div key={z.id} className="flex min-h-[28px] items-center text-sm">
            <TreeTrunk first={i === 0} last={i === shown.length - 1} />
            <TreeConnector />
            <span className="ml-1.5 truncate text-zinc-300">{z.name}</span>
            <span className="ml-auto shrink-0 pl-3">
              <StatusBadge status={z.status} />
            </span>
          </div>
        ))}
      </div>
      {zpods.length > shown.length && (
        <p className="mt-1 pl-5 text-xs text-zinc-500">and {zpods.length - shown.length} more</p>
      )}
    </>
  )
}

const CARD_SURFACE = "border-[#313244] bg-[#181825] shadow-lg shadow-black/30"

/** The header and tree of a hover card or tooltip listing zPods */
function ZpodTreeCard({ title, zpods, hint }: { title: string; zpods: Zpod[]; hint?: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-sm font-bold text-zinc-100">{title}</p>
        <span className="shrink-0 text-xs tabular-nums text-zinc-400">
          {zpods.length} zPod{zpods.length !== 1 ? "s" : ""}
        </span>
      </div>
      {zpods.length > 0 && (
        <div className="mt-2">
          <ZpodTree zpods={zpods} />
        </div>
      )}
      {hint && <p className="mt-2 text-[11px] text-zinc-500">{hint}</p>}
    </>
  )
}

/** How long the cursor rests on a profile's bar before its tooltip shows, as for every hover card:
 *  recharts shows a tooltip at once, so the delay is kept here */
const PROFILE_TOOLTIP_DELAY = HOVER_CARD_DELAY

/** A profile bar's tooltip: its zPods as a tree */
function ProfileTooltip({
  active,
  label,
  zpodsByProfile,
}: {
  active?: boolean
  label?: string | number
  zpodsByProfile: Map<string, Zpod[]>
}) {
  // The bar whose tooltip is due: set once the cursor has rested on it, cleared when it leaves
  // the chart (both from a timer, so a bar entered again waits again)
  const [shown, setShown] = useState<string | null>(null)
  const key = active && label !== undefined ? String(label) : null
  useEffect(() => {
    const timer = setTimeout(() => setShown(key), key ? PROFILE_TOOLTIP_DELAY : 0)
    return () => clearTimeout(timer)
  }, [key])
  if (!key) return null
  // Rendered, but hidden, through the delay: recharts places a tooltip once it has measured it,
  // so it is already at the bar when it shows rather than one frame at its last place
  return (
    <div className={cn("min-w-[260px] rounded-md border px-4 py-3", CARD_SURFACE, shown !== key && "invisible")}>
      <ZpodTreeCard
        title={String(label)}
        zpods={zpodsByProfile.get(String(label)) ?? []}
        hint="Click to list them on the zPods page"
      />
    </div>
  )
}

interface Stat {
  label: string
  value: number
  caption: string
  icon: typeof Server
  accent: string
  to: string
  zpods: Zpod[]
  /** Striped accent: something is happening */
  busy?: boolean
}

/** A count opening the zPods page on that status; its zPods on hover */
function StatTile({ stat }: { stat: Stat }) {
  const Icon = stat.icon
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Link
          to={stat.to}
          className="group relative block overflow-hidden rounded-lg border bg-card transition-colors hover:border-[#89b4fa]/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div
            className={cn("absolute inset-x-0 top-0 h-1", stat.busy && "status-stripes")}
            style={{ backgroundColor: stat.value > 0 ? stat.accent : "#45475a" }}
          />
          <div className="flex items-center gap-4 p-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: `${stat.accent}1a`, color: stat.accent }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="truncate border-t px-4 py-1.5 text-[11px] text-muted-foreground">{stat.caption}</p>
        </Link>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className={cn("w-auto min-w-[280px] px-4 py-3", CARD_SURFACE)}>
        <ZpodTreeCard
          title={stat.label}
          zpods={stat.zpods}
          hint={stat.zpods.length ? "Click to list them on the zPods page" : "None right now"}
        />
      </HoverCardContent>
    </HoverCard>
  )
}

interface Breakdown {
  key: string
  label: string
  zpods: Zpod[]
}

/** A ranked list with bars (zPods per endpoint, per owner): a row opens the zPods page filtered
 *  on it, and its zPods show on hover */
function BreakdownCard({
  title,
  icon: Icon,
  items,
  to,
  color,
}: {
  title: string
  icon: typeof Server
  items: Breakdown[]
  to: (key: string) => string
  color: string
}) {
  const max = Math.max(1, ...items.map((i) => i.zpods.length))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {items.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">None yet</p>}
        {items.map((item) => (
          <HoverCard key={item.key}>
            <HoverCardTrigger asChild>
              <Link
                to={to(item.key)}
                className="group -mx-2 block rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate group-hover:text-[#89b4fa]">{item.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.zpods.length}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(item.zpods.length / max) * 100}%`, backgroundColor: color, opacity: 0.8 }}
                  />
                </div>
              </Link>
            </HoverCardTrigger>
            <HoverCardContent side="left" align="start" className={cn("w-auto min-w-[280px] px-4 py-3", CARD_SURFACE)}>
              <ZpodTreeCard title={item.label} zpods={item.zpods} hint="Click to list them on the zPods page" />
            </HoverCardContent>
          </HoverCard>
        ))}
      </CardContent>
    </Card>
  )
}

/** A zPod's endpoint T0, for the summary card's network diagram */
function t0Of(z: Zpod, t0ByEndpoint: Map<number, string>) {
  return z.endpoint ? t0ByEndpoint.get(z.endpoint.id) : undefined
}

/** Shown only when something needs looking at: failed zPods, and active ones with components
 *  down, each opening its zPod (its summary on hover) */
function AttentionStrip({ zpods, t0ByEndpoint }: { zpods: Zpod[]; t0ByEndpoint: Map<number, string> }) {
  const card = useCursorCard()
  const rows = [
    ...zpods.filter(isFailed).map((z) => ({ z, why: z.status.replace(/_/g, " ").toLowerCase() })),
    ...zpods
      .filter((z) => z.status === "ACTIVE" && downComponents(z).length > 0)
      .map((z) => {
        const down = downComponents(z)
        const names = down.slice(0, 3).map((c) => c.hostname ?? extractComponentType(c.component.component_uid))
        return {
          z,
          why: `${down.length} component${down.length !== 1 ? "s" : ""} down: ${names.join(", ")}${down.length > 3 ? "…" : ""}`,
        }
      }),
  ]
  if (!rows.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#f38ba8]/40 bg-[#f38ba8]/5 px-4 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium text-[#f38ba8]">
        <AlertTriangle className="h-4 w-4" />
        Needs attention
      </span>
      {rows.map(({ z, why }) => (
        <HoverCard key={z.id} onOpenChange={card.onOpenChange}>
          <HoverCardTrigger asChild onPointerMove={card.onPointerMove}>
            <Link
              to={`/zpods/${z.id}`}
              className="flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-xs transition-colors hover:border-[#89b4fa]/40 hover:bg-muted/40"
            >
              <span className="h-3 w-1 shrink-0 rounded-full" style={{ backgroundColor: statusHex(z.status) }} />
              <span className="font-medium text-primary">{z.name}</span>
              <span className="text-muted-foreground">{why}</span>
            </Link>
          </HoverCardTrigger>
          <ZpodDetails zpod={z} t0={t0Of(z, t0ByEndpoint)} alignOffset={card.alignOffset} />
        </HoverCard>
      ))}
    </div>
  )
}

/** A Recent zPods row's networks, as in the zPods List view: the zPod's /24, then the user
 *  networks it routes globally; each opens the zPod's Networks table with it outlined */
function RecentNetworks({ zpod }: { zpod: Zpod }) {
  const subnets = zpodSubnets(zpod.networks ?? [])
  const globalUserNets = (zpod.networks ?? []).filter((n) => n.kind === "user" && n.routing === "GLOBAL")
  if (!subnets.length) return <span className="text-muted-foreground">—</span>
  const link = (cidr: string, title: string) => (
    <Link
      key={cidr}
      to={`/zpods/${zpod.id}?network=${encodeURIComponent(cidr)}`}
      // leading-5: the row's other text's line height, so the first line sits level with theirs
      className="block whitespace-nowrap font-mono text-xs leading-5 underline-offset-2 hover:underline"
      title={title}
    >
      {cidr}
    </Link>
  )
  return (
    <div>
      <span className="text-[#b4befe]">
        {link(parentCidr(subnets), `Show ${zpod.name}'s subnets in its Networks table (${subnets.map((n) => n.cidr).join(", ")})`)}
      </span>
      {globalUserNets.map((n) => (
        <span key={n.cidr} className="text-[#94e2d5]">
          {link(n.cidr, `${n.name}: a user network routed globally${n.vlan_id ? `, VLAN ${n.vlan_id}` : ""}`)}
        </span>
      ))}
    </div>
  )
}

/** The recent zPods as a table: name, profile, endpoint, owners and networks as links, status (a
 *  bar under the row while it builds), then the time since it was deployed. The Network cell
 *  opens the zPod's summary, and the rest of a building zPod's row its progress */
function RecentTable({
  zpods,
  profileSteps,
  t0ByEndpoint,
}: {
  zpods: Zpod[]
  profileSteps: Map<string, (ProfileItem | ProfileItem[])[]>
  t0ByEndpoint: Map<number, string>
}) {
  // As on the zPods page: the zPod's summary from its Network cell (under the cursor), and a
  // building zPod's progress from anywhere else on its row. The summary card counts as the
  // network: it is rendered inside the row
  const card = useCursorCard()
  const buildCard = useRowHoverCard("[data-zpod-networks], [data-zpod-card]")
  return (
    <Table
      // Tighter cells than the default (px-3, not p-4 all round), as on the zPods and Components
      // pages; the progress bar's cell keeps none with !
      className="[&_td]:px-3 [&_th]:px-3"
    >
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="hidden md:table-cell">Profile</TableHead>
          <TableHead className="hidden lg:table-cell">Endpoint</TableHead>
          <TableHead className="hidden md:table-cell">Owner</TableHead>
          <TableHead className="hidden lg:table-cell">Network</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Deployed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {zpods.map((zpod) => {
          const steps = profileSteps.get(zpod.profile) ?? []
          const total = flattenProfileItems(steps).length
          const showProgress = zpodShowsProgress(zpod, total)
          const pct = zpodBuildPct(zpod, total)
          return (
            <Fragment key={zpod.id}>
              <HoverCard {...buildCard.root(zpod.id)}>
              <HoverCardTrigger asChild {...buildCard.trigger()}>
              <TableRow className={showProgress ? "border-b-0" : ""}>
                <TableCell className="py-2">
                  <Link to={`/zpods/${zpod.id}`} className="font-medium text-primary hover:underline">
                    {zpod.name}
                  </Link>
                  <div className="font-mono text-[11px] text-muted-foreground">{zpod.domain}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <ProfileLink name={zpod.profile} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <EndpointLink endpoint={zpod.endpoint} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <OwnerLinks zpod={zpod} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {/* The card hangs off a box inside the cell: rendered as a child of the row, its
                      wrapper would count as a table cell and shift the row's columns */}
                  <HoverCard onOpenChange={card.onOpenChange}>
                    <HoverCardTrigger asChild onPointerMove={card.onPointerMove}>
                      <div data-zpod-networks className="cursor-default">
                        <RecentNetworks zpod={zpod} />
                      </div>
                    </HoverCardTrigger>
                    <ZpodDetails zpod={zpod} t0={t0Of(zpod, t0ByEndpoint)} alignOffset={card.alignOffset} />
                  </HoverCard>
                </TableCell>
                <TableCell>
                  <StatusBadge status={zpod.status} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground" title={formatDateTime(zpod.creation_date)}>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
                    <Clock className="h-3.5 w-3.5" />
                    {timeAgo(zpod.creation_date)}
                  </span>
                </TableCell>
              </TableRow>
              </HoverCardTrigger>
              {/* Only a building zPod's row opens a card: its progress, under the cursor */}
              {showProgress && (
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
              )}
              </HoverCard>
              {showProgress && (
                <TableRow>
                  <TableCell colSpan={7} className="!p-0">
                    <Progress value={pct} className="h-1 w-full rounded-none" />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** Groups zPods by one or more keys each, largest group first */
function breakdown(zpods: Zpod[], keys: (z: Zpod) => { key: string; label: string }[]): Breakdown[] {
  const map = new Map<string, Breakdown>()
  for (const z of zpods) {
    for (const { key, label } of keys(z)) {
      const entry = map.get(key) ?? { key, label, zpods: [] }
      entry.zpods.push(z)
      map.set(key, entry)
    }
  }
  return [...map.values()].sort((a, b) => b.zpods.length - a.zpods.length || a.label.localeCompare(b.label))
}

export function DashboardPage() {
  const { fetchZpods, fetchProfiles, fetchEndpoints } = useApi()
  const navigate = useNavigate()
  const [zpods, setZpods] = useState<Zpod[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const loadZpods = useCallback(() => {
    fetchZpods().then(setZpods).catch(() => {})
  }, [fetchZpods])

  useEffect(() => {
    Promise.all([fetchZpods(), fetchProfiles()])
      .then(([z, p]) => {
        setZpods(z)
        setProfiles(p)
      })
      .catch(() => toast.error("Failed to fetch zpods"))
      .finally(() => setLoading(false))
  }, [fetchZpods, fetchProfiles])

  usePolling(loadZpods)

  // Each endpoint's NSX T0, for the network diagram in a zPod's summary card
  const [t0ByEndpoint, setT0ByEndpoint] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    fetchEndpoints()
      .then((eps) => setT0ByEndpoint(new Map(eps.map((e) => [e.id, e.endpoints.network.t0]))))
      .catch(() => {})
  }, [fetchEndpoints])

  // Sorted by name once, so every list and tree below reads alphabetically
  const byName = useMemo(() => [...zpods].sort((a, b) => a.name.localeCompare(b.name)), [zpods])

  const profileSteps = useMemo(() => new Map(profiles.map((p) => [p.name, p.profile])), [profiles])

  const byProfile = useMemo(
    () => breakdown(byName, (z) => [{ key: z.profile || "unknown", label: z.profile || "unknown" }]),
    [byName]
  )
  const zpodsByProfile = useMemo(() => new Map(byProfile.map((b) => [b.key, b.zpods])), [byProfile])
  const chartData = byProfile.map((b) => ({ profile: b.key, count: b.zpods.length }))

  const byEndpoint = useMemo(
    () => breakdown(byName, (z) => (z.endpoint ? [{ key: z.endpoint.name, label: z.endpoint.name }] : [])),
    [byName]
  )

  const recent = useMemo(
    () =>
      [...zpods]
        .sort((a, b) => new Date(b.creation_date).getTime() - new Date(a.creation_date).getTime())
        .slice(0, RECENT),
    [zpods]
  )

  const active = byName.filter((z) => z.status === "ACTIVE")
  const inProgress = byName.filter((z) => isInProgressStatus(z.status))
  const failed = byName.filter(isFailed)
  const pctOf = (n: number) => (zpods.length ? Math.round((n / zpods.length) * 100) : 0)
  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`

  const stats: Stat[] = [
    {
      label: "Total zPods",
      value: zpods.length,
      caption: `on ${plural(byEndpoint.length, "endpoint")}, from ${plural(byProfile.length, "profile")}`,
      icon: Server,
      accent: "#b4befe",
      to: "/zpods",
      zpods: byName,
    },
    {
      label: "Active",
      value: active.length,
      caption: `${pctOf(active.length)}% of all zPods`,
      icon: Activity,
      accent: "#a6e3a1",
      to: "/zpods?status=ACTIVE",
      zpods: active,
    },
    {
      label: "In progress",
      value: inProgress.length,
      caption: inProgress.length ? "pending, building, running scripts or deleting" : "nothing running",
      icon: Hammer,
      accent: "#89b4fa",
      to: "/zpods?status=BUILDING",
      zpods: inProgress,
      busy: inProgress.length > 0,
    },
    {
      label: "Failed",
      value: failed.length,
      caption: failed.length ? "a deploy or a destroy failed" : "no failures",
      icon: AlertTriangle,
      accent: "#f38ba8",
      to: "/zpods?status=FAILED",
      zpods: failed,
    },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatTile key={stat.label} stat={stat} />
        ))}
      </div>

      <AttentionStrip zpods={byName} t0ByEndpoint={t0ByEndpoint} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-muted-foreground" />
              zPods per Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No zPods yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={chartData}
                  margin={{ left: 10, right: 10, bottom: 5 }}
                  // Anywhere in a profile's column: the zPods page filtered on that profile
                  onClick={(state) => {
                    if (state.activeLabel !== undefined && state.activeLabel !== "unknown")
                      navigate(`/zpods?profile=${encodeURIComponent(String(state.activeLabel))}`)
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <XAxis
                    dataKey="profile"
                    tick={{ fontSize: 11, fill: "#a6adc8" }}
                    tickLine={false}
                    axisLine={{ stroke: "#45475a" }}
                    interval={0}
                  />
                  <YAxis hide allowDecimals={false} />
                  {/* No animation: recharts slides its tooltip from where it last was, which after the delay
                      is the chart's left edge, so it would glide in from there */}
                  <Tooltip
                    content={<ProfileTooltip zpodsByProfile={zpodsByProfile} />}
                    cursor={{ fill: "#585b7033" }}
                    isAnimationActive={false}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <BreakdownCard
          title="zPods per Endpoint"
          icon={Server}
          items={byEndpoint}
          to={(key) => `/zpods?endpoint=${encodeURIComponent(key)}`}
          color="#89b4fa"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Recent zPods
          </CardTitle>
          <Link to="/zpods" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#89b4fa]">
            All zPods <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No zpods found</p>
          ) : (
            <RecentTable zpods={recent} profileSteps={profileSteps} t0ByEndpoint={t0ByEndpoint} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
