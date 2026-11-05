import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { useAuthStore } from "@/stores/auth-store"
import { usePreferencesStore } from "@/stores/preferences-store"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmationDialog } from "@/components/confirmation-dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SortableHead } from "@/components/sortable-head"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { IconTooltip } from "@/components/icon-tooltip"
import { Plus, Info, Trash2, Settings2, KeyRound, Search, Rows3, LayoutList, ArrowUpNarrowWide, ArrowDownWideNarrow } from "lucide-react"
import { cidrToVlanId } from "@/lib/network-utils"
import type { Zpod, ZpodComponentView, ZpodNetwork, Profile, ProfileItem } from "@/types"
import { ZpodDetails, ZpodListView } from "@/components/zpod-list-view"
import { useCursorCard, useRowHoverCard } from "@/hooks/use-cursor-card"
import { EndpointLink, OwnerLinks, ProfileLink } from "@/components/entity-links"
import { isZpodMaintainer, parentCidr, zpodBuildPct, zpodSetupStatus, zpodShowsProgress, zpodSubnets } from "@/lib/zpod-utils"
import { StatusBadge } from "@/components/status-badge"
import { isInProgressStatus } from "@/lib/status-colors"
import {
  HoverCard,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import { ZpodCreateDialog } from "@/components/zpod-create-dialog"
import { BuildProgressHoverContent } from "@/components/build-progress-hover"
import { buildHoverRows, groupDeployedByUid } from "@/lib/build-progress"
import { flattenProfileItems } from "@/lib/profile-utils"
import { cn, copyToClipboard, formatDateTime } from "@/lib/utils"

/** Group components by name and return "N x name" lines like the CLI */
function groupComponents(components: ZpodComponentView[]): string[] {
  const counts = new Map<string, number>()
  for (const c of components) {
    const name = c.component.component_name
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([name, count]) => `${count} x ${name}`)
}

function NetworkSubnets({ networks }: { networks: ZpodNetwork[] }) {
  return (
    <div className="ml-4 mt-1 space-y-1 border-l border-muted-foreground/25 pl-2 text-muted-foreground">
      {networks.map((net, i) => {
        const vlan = net.vlan_id ?? cidrToVlanId(net.cidr)
        return (
          <div key={net.id} className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
            {net.cidr}
            {i === 0 ? (
              <>
                <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0 uppercase">
                  Native
                </Badge>
                <Badge variant="outline" className="text-xs px-1.5 py-0 uppercase border-[#a6e3a1]/40 text-[#a6e3a1]">
                  Mgmt
                </Badge>
              </>
            ) : (
              <Badge variant="outline" className="ml-1 text-xs px-1.5 py-0 uppercase">
                VLAN {vlan}
              </Badge>
            )}
          </div>
        )
      })}
    </div>
  )
}

function NetworkBlock({ networks: all }: { networks: ZpodNetwork[] }) {
  const networks = zpodSubnets(all)
  const summary = parentCidr(networks)
  return (
    <div>
      <span>{summary}</span>
      <NetworkSubnets networks={networks} />
    </div>
  )
}

// --- Column visibility ---

/** All toggleable columns with their table config */
const OPTIONAL_COLUMNS = [
  { key: "profile",    label: "Profile / Components", sortKey: "profile",                      breakpoint: "hidden lg:table-cell" },
  { key: "endpoint",   label: "Endpoint",   sortKey: "endpoint.name",                         breakpoint: "hidden 2xl:table-cell" },
  { key: "networks",   label: "Networks",   sortKey: "networks.0.cidr",                       breakpoint: "hidden xl:table-cell" },
  { key: "owners",     label: "Owner(s)",   sortKey: "permissions.0.users.0.username",         breakpoint: "hidden 2xl:table-cell" },
  { key: "created",    label: "Creation date", sortKey: "creation_date",                       breakpoint: "hidden 3xl:table-cell" },
] as const

type ColumnKey = (typeof OPTIONAL_COLUMNS)[number]["key"]

const STORAGE_KEY_PREFIX = "zpodweb:columns:"

function loadColumnPrefs(username: string, defaults: Record<ColumnKey, boolean>): Record<ColumnKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + username)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>
      // Merge with defaults so new columns get their default value
      const result = { ...defaults }
      for (const k of Object.keys(result) as ColumnKey[]) {
        if (k in parsed) result[k] = parsed[k]
      }
      return result
    }
  } catch { /* ignore corrupt data */ }
  return defaults
}

function saveColumnPrefs(username: string, prefs: Record<ColumnKey, boolean>) {
  localStorage.setItem(STORAGE_KEY_PREFIX + username, JSON.stringify(prefs))
}

const VIEWS = [
  { id: "table", label: "Table", icon: Rows3 },
  { id: "list", label: "List", icon: LayoutList },
] as const

/** The toolbar's sort menu, the same keys the table's column headers sort on */
const SORT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "profile", label: "Profile" },
  { key: "endpoint.name", label: "Endpoint" },
  { key: "networks.0.cidr", label: "Network" },
  { key: "permissions.0.users.0.username", label: "Owner" },
  { key: "creation_date", label: "Creation date" },
] as const

const VALID_STATUS_FILTERS = ["ACTIVE", "BUILDING", "FAILED"] as const
type StatusFilter = "ALL" | (typeof VALID_STATUS_FILTERS)[number]

function parseStatusParam(value: string | null): StatusFilter {
  if (value && (VALID_STATUS_FILTERS as readonly string[]).includes(value)) {
    return value as StatusFilter
  }
  return "ALL"
}

export function ZpodsPage() {
  const { fetchZpods, fetchProfiles, fetchEndpoints, deleteZpod } = useApi()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const [zpods, setZpods] = useState<Zpod[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [destroyTarget, setDestroyTarget] = useState<Zpod | null>(null)
  const [destroying, setDestroying] = useState(false)
  const [filter, setFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => parseStatusParam(searchParams.get("status")))
  const [ownerFilter, setOwnerFilter] = useState(() => searchParams.get("owner") ?? "ALL")
  // ?profile=, ?endpoint= and ?owner= (names), from the dashboard's breakdowns
  const [profileFilter, setProfileFilter] = useState(() => searchParams.get("profile") ?? "ALL")
  // Each endpoint's NSX T0, for the network diagram in a List row's hover card
  const [t0ByEndpoint, setT0ByEndpoint] = useState<Map<number, string>>(new Map())
  const [endpointFilter, setEndpointFilter] = useState(() => searchParams.get("endpoint") ?? "ALL")

  // Sync the filters when URL search params change (e.g. header badge click while already on /zpods)
  useEffect(() => {
    const fromUrl = parseStatusParam(searchParams.get("status"))
    setStatusFilter(fromUrl)
    const profile = searchParams.get("profile")
    if (profile) setProfileFilter(profile)
    const endpoint = searchParams.get("endpoint")
    if (endpoint) setEndpointFilter(endpoint)
    const owner = searchParams.get("owner")
    if (owner) setOwnerFilter(owner)
  }, [searchParams])

  // Unique filter values across all zpods
  const allOwners = useMemo(() => {
    const set = new Set<string>()
    for (const z of zpods) {
      for (const p of z.permissions ?? []) {
        if (p.permission === "OWNER") {
          for (const u of p.users) set.add(u.username)
        }
      }
    }
    return Array.from(set).sort()
  }, [zpods])

  const allProfiles = useMemo(() =>
    Array.from(new Set(zpods.map((z) => z.profile))).sort()
  , [zpods])

  const allEndpoints = useMemo(() =>
    Array.from(new Set(zpods.map((z) => z.endpoint?.name).filter(Boolean) as string[])).sort()
  , [zpods])

  const filtered = useMemo(() => {
    return zpods.filter((z) => {
      const q = filter.toLowerCase()
      const matchesText = !q ||
        z.name.toLowerCase().includes(q) ||
        z.domain.toLowerCase().includes(q) ||
        z.profile.toLowerCase().includes(q) ||
        (z.endpoint?.name ?? "").toLowerCase().includes(q)
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && z.status === "ACTIVE") ||
        (statusFilter === "BUILDING" && isInProgressStatus(z.status)) ||
        (statusFilter === "FAILED" && z.status.endsWith("_FAILED"))
      const matchesOwner =
        ownerFilter === "ALL" ||
        (z.permissions ?? []).some((p) =>
          p.permission === "OWNER" && p.users.some((u) => u.username === ownerFilter)
        )
      const matchesProfile = profileFilter === "ALL" || z.profile === profileFilter
      const matchesEndpoint = endpointFilter === "ALL" || z.endpoint?.name === endpointFilter
      return matchesText && matchesStatus && matchesOwner && matchesProfile && matchesEndpoint
    })
  }, [zpods, filter, statusFilter, ownerFilter, profileFilter, endpointFilter])

  const { sorted, sort, setSort, toggleSort } = useSort(filtered, "name")
  // Opens in the default view from Preferences; the toggle switches for this visit only
  const defaultView = usePreferencesStore((s) => s.zpodsView)
  const [view, setView] = useState(defaultView)
  // A table row's cards, as in the List view: the zPod's summary from its Networks cell (under the
  // cursor), and a building zPod's progress from anywhere else on its row. The summary card counts
  // as the networks: it is rendered inside the row
  const netCard = useCursorCard()
  const buildCard = useRowHoverCard("[data-zpod-networks], [data-zpod-card]")

  const [endpointCount, setEndpointCount] = useState<number | null>(null)

  const columnDefaults = useMemo<Record<ColumnKey, boolean>>(() => ({
    profile: true,
    endpoint: true,
    networks: true,
    owners: true,
    created: false,
  }), [])

  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(columnDefaults)
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  // Load saved prefs once we know the user AND endpoint count
  useEffect(() => {
    if (!user?.username || endpointCount === null) return
    const prefs = loadColumnPrefs(user.username, columnDefaults)
    setColumns(prefs)
    setPrefsLoaded(true)
  }, [user?.username, endpointCount, columnDefaults])

  const toggleColumn = (key: ColumnKey) => {
    setColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (user?.username) saveColumnPrefs(user.username, next)
      return next
    })
  }

  // The filters in the toolbar, the same for the table and the list
  const listFilters = [
    { label: "Profile", value: profileFilter, onChange: setProfileFilter, options: allProfiles },
    { label: "Endpoint", value: endpointFilter, onChange: setEndpointFilter, options: allEndpoints },
    { label: "Owner", value: ownerFilter, onChange: setOwnerFilter, options: allOwners },
  ]

  const visibleCount = 2 + Object.values(columns).filter(Boolean).length // Name + Actions/Status are always shown; + toggled cols

  const loadZpods = useCallback(() => {
    fetchZpods().then(setZpods).catch(() => {})
  }, [fetchZpods])

  const loadProfiles = useCallback(() => {
    fetchProfiles().then(setProfiles).catch(() => {})
  }, [fetchProfiles])

  useEffect(() => {
    Promise.all([fetchZpods(), fetchProfiles(), fetchEndpoints()])
      .then(([z, p, eps]) => {
        setZpods(z)
        setProfiles(p)
        setEndpointCount(eps.length)
        setT0ByEndpoint(new Map(eps.map((e) => [e.id, e.endpoints.network.t0])))
      })
      .catch(() => toast.error("Failed to fetch zpods"))
      .finally(() => setLoading(false))
  }, [fetchZpods, fetchProfiles, fetchEndpoints])

  const loadAll = useCallback(() => {
    loadZpods()
    // Only re-fetch profiles during polling if any zpod is in a transitional state
    if (zpods.some((z) => isInProgressStatus(z.status))) {
      loadProfiles()
    }
  }, [loadZpods, loadProfiles, zpods])

  usePolling(loadAll)

  const handleCopyPassword = async (zpod: Zpod) => {
    if (!zpod.password) {
      toast.error("No password available")
      return
    }
    const ok = await copyToClipboard(zpod.password)
    if (ok) {
      toast.success("Password copied")
    } else {
      toast.error("Failed to copy password")
    }
  }

  const handleDestroy = async () => {
    if (!destroyTarget) return
    setDestroying(true)
    try {
      await deleteZpod(destroyTarget.id)
      toast.success(`Destroying zpod "${destroyTarget.name}"`)
      setDestroyTarget(null)
      loadAll()
    } catch {
      toast.error(`Failed to destroy zpod "${destroyTarget.name}"`)
    } finally {
      setDestroying(false)
    }
  }

  /** Build a map of profile name -> total component count */
  const profileComponentCounts = new Map<string, number>()
  /** Map of profile name -> raw step structure (serial/parallel) */
  const profileStepsMap = new Map<string, (ProfileItem | ProfileItem[])[]>()
  for (const p of profiles) {
    const items = flattenProfileItems(p.profile)
    profileComponentCounts.set(p.name, items.length)
    profileStepsMap.set(p.name, p.profile)
  }

  if (loading || !prefsLoaded) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">zPods</h1>
          <Badge variant="outline">{sorted.length === zpods.length ? `${zpods.length} total` : `${sorted.length} / ${zpods.length}`}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <IconTooltip key={id} label={`${label} view`}>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={view === id}
                  aria-label={`${label} view`}
                  onClick={() => setView(id)}
                  className={cn("h-7 gap-1.5 px-2.5 text-xs", view === id ? "bg-[#89b4fa]/15 text-foreground" : "text-muted-foreground")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Button>
              </IconTooltip>
            ))}
          </div>
          {/* Column visibility: the table's columns, and what the list's rows show */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-1 h-3 w-3" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{view === "table" ? "Toggle columns" : "Show in each row"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {OPTIONAL_COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={columns[col.key]}
                  onCheckedChange={() => toggleColumn(col.key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Create
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter zpods..."
            className="pl-8"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex border">
          {(["ACTIVE", "BUILDING", "FAILED", "ALL"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "ghost"}
              className="text-xs"
              onClick={() => {
                setStatusFilter(s)
                if (s === "ALL") {
                  setSearchParams({}, { replace: true })
                } else {
                  setSearchParams({ status: s }, { replace: true })
                }
              }}
            >
              {s === "FAILED" ? "Failed" : s === "BUILDING" ? "In Progress" : s === "ACTIVE" ? "Active" : "All"}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {listFilters.map((f) =>
            f.options.length > 1 ? (
              <Select key={f.label} value={f.value} onValueChange={f.onChange}>
                <SelectTrigger
                  className={cn("h-8 w-auto gap-1.5 text-xs", f.value !== "ALL" && "border-[#89b4fa]/50 bg-[#89b4fa]/10")}
                  aria-label={f.label}
                >
                  <SelectValue>{f.value === "ALL" ? `All ${f.label.toLowerCase()}s` : `${f.label}: ${f.value}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All {f.label.toLowerCase()}s</SelectItem>
                  {f.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null
          )}
          {/* One control: the focus ring goes around both parts, as each part's own would stop at
              the seam and run under the other */}
          <div className="flex items-center rounded-md ring-offset-background has-[:focus]:ring-2 has-[:focus]:ring-ring has-[:focus]:ring-offset-2">
            <Select value={sort.key} onValueChange={(key) => setSort({ key, direction: sort.direction })}>
              <SelectTrigger className="h-8 w-auto gap-1.5 rounded-r-none text-xs focus:ring-0 focus:ring-offset-0" aria-label="Sort by">
                <span className="text-muted-foreground">Sort</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <IconTooltip label={sort.direction === "asc" ? "Ascending" : "Descending"}>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-l-none border-l-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                aria-label={sort.direction === "asc" ? "Sorted ascending, switch to descending" : "Sorted descending, switch to ascending"}
                onClick={() => setSort({ key: sort.key, direction: sort.direction === "asc" ? "desc" : "asc" })}
              >
                {sort.direction === "asc" ? <ArrowUpNarrowWide className="h-3.5 w-3.5" /> : <ArrowDownWideNarrow className="h-3.5 w-3.5" />}
              </Button>
            </IconTooltip>
          </div>
        </div>
      </div>

      <ZpodCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreateComplete={loadAll}
      />

      <ConfirmationDialog
        open={!!destroyTarget}
        onOpenChange={(open) => !open && setDestroyTarget(null)}
        title="Destroy zPod"
        description={<>Are you sure you want to destroy{" "}<span className="font-semibold">{destroyTarget?.name}</span>? This action cannot be undone.</>}
        onConfirm={handleDestroy}
        loading={destroying}
        confirmText="Destroy"
      />

      {view === "list" ? (
        sorted.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {zpods.length === 0 ? "No zpods found" : "No zpods match these filters"}
            </CardContent>
          </Card>
        ) : (
          <ZpodListView
            zpods={sorted}
            profileSteps={profileStepsMap}
            t0ByEndpoint={t0ByEndpoint}
            user={user}
            onCopyPassword={handleCopyPassword}
            onDestroy={setDestroyTarget}
            columns={columns}
          />
        )
      ) : (
      <Card>
        <CardContent className="p-0">
          {zpods.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No zpods found
            </p>
          ) : (
            <Table
              // Tighter cells than the default (px-3, not p-4 all round), as on the Components page;
              // the cells with their own padding (actions, the progress bar) keep it with !
              className="[&_td]:px-3 [&_th]:px-3"
            >
              <TableHeader>
                <TableRow>
                  <SortableHead label="Name / Domain" sortKey="name" sort={sort} onToggle={toggleSort} className="whitespace-nowrap" />
                  {OPTIONAL_COLUMNS.map((col) => {
                    if (!columns[col.key]) return null
                    return (
                      <SortableHead
                        key={col.key}
                        label={col.label}
                        sortKey={col.sortKey}
                        sort={sort}
                        onToggle={toggleSort}
                        className={cn("whitespace-nowrap", col.breakpoint)}
                      />
                    )
                  })}
                  <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggleSort} className="whitespace-nowrap w-px text-center" />
                  <TableHead className="whitespace-nowrap w-px text-right !pl-0 !pr-2.5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((zpod) => {
                  const componentGroups = groupComponents(zpod.components ?? [])
                  const totalFromProfile = profileComponentCounts.get(zpod.profile) ?? 0
                  const showProgress = zpodShowsProgress(zpod, totalFromProfile)
                  const pct = zpodBuildPct(zpod, totalFromProfile)
                  const deployedComponents = zpod.components ?? []
                  const profileSteps = profileStepsMap.get(zpod.profile) ?? []
                  const deployedByUid = groupDeployedByUid(deployedComponents)
                  const hoverRows = buildHoverRows(profileSteps)
                  return (
                    <React.Fragment key={zpod.id}>
                      <HoverCard {...buildCard.root(zpod.id)}>
                      <HoverCardTrigger asChild {...buildCard.trigger()}>
                      <TableRow className={showProgress ? "border-b-0" : ""}>
                        <TableCell className="whitespace-nowrap">
                          <button
                            className="font-medium text-primary hover:underline text-left"
                            onClick={() => navigate(`/zpods/${zpod.id}`)}
                          >
                            {zpod.name}
                          </button>
                          <div className="text-muted-foreground mt-0.5">
                            {zpod.domain}
                          </div>
                        </TableCell>

                        {columns.profile && (
                          <TableCell className="hidden lg:table-cell whitespace-nowrap">
                            <ProfileLink name={zpod.profile} className="font-medium" />
                            {componentGroups.length > 0 && (
                              <div className="ml-4 mt-1 space-y-1 border-l border-muted-foreground/25 pl-2 text-muted-foreground">
                                {componentGroups.map((line) => (
                                  <div key={line} className="flex items-center gap-1.5">
                                    <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                                    {line}
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        )}

                        {columns.endpoint && (
                          <TableCell className="hidden 2xl:table-cell whitespace-nowrap">
                            <EndpointLink endpoint={zpod.endpoint} />
                          </TableCell>
                        )}

                        {columns.networks && (
                          <TableCell className="hidden xl:table-cell whitespace-nowrap font-mono">
                            {zpod.networks?.length ? (
                              // The card hangs off a box inside the cell: as a child of the row,
                              // its wrapper would count as a cell and shift the columns
                              <HoverCard onOpenChange={netCard.onOpenChange}>
                                <HoverCardTrigger asChild onPointerMove={netCard.onPointerMove}>
                                  <div data-zpod-networks className="cursor-default">
                                    <NetworkBlock networks={zpod.networks} />
                                  </div>
                                </HoverCardTrigger>
                                <ZpodDetails
                                  zpod={zpod}
                                  t0={zpod.endpoint ? t0ByEndpoint.get(zpod.endpoint.id) : undefined}
                                  alignOffset={netCard.alignOffset}
                                />
                              </HoverCard>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        )}

                        {columns.owners && (
                          <TableCell className="hidden 2xl:table-cell whitespace-nowrap">
                            <OwnerLinks zpod={zpod} />
                          </TableCell>
                        )}

                        {columns.created && (
                          <TableCell className="hidden 3xl:table-cell whitespace-nowrap tabular-nums">
                            {formatDateTime(zpod.creation_date)}
                          </TableCell>
                        )}

                        <TableCell className="whitespace-nowrap text-center">
                          <StatusBadge status={zpod.status} />
                        </TableCell>
                        <TableCell className="text-right !pl-0 !pr-2.5">
                          <div className="flex items-center gap-1">
                            <IconTooltip label="Copy password">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleCopyPassword(zpod)}
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                            </IconTooltip>
                            <IconTooltip label="View details">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => navigate(`/zpods/${zpod.id}`)}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </Button>
                            </IconTooltip>
                            {isZpodMaintainer(zpod, user) && (
                              <IconTooltip label="Destroy">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDestroyTarget(zpod)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </IconTooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      </HoverCardTrigger>
                      {/* Only a building zPod's row opens a card: its progress, under the cursor */}
                      {showProgress && (
                        <BuildProgressHoverContent
                          setupStatus={zpodSetupStatus(zpod)}
                          creationDate={zpod.creation_date}
                          pct={pct}
                          hoverRows={hoverRows}
                          deployedByUid={deployedByUid}
                          side="bottom"
                          align="start"
                          alignOffset={buildCard.alignOffset}
                        />
                      )}
                      </HoverCard>
                      {showProgress && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={visibleCount + 1} className="!p-0">
                            <Progress value={pct} className="h-1 w-full rounded-none" />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  )
}
