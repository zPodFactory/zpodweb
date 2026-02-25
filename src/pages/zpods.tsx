import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { useAuthStore } from "@/stores/auth-store"
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
import { Plus, Info, Trash2, Settings2, KeyRound, Search } from "lucide-react"
import type { Zpod, ZpodComponentView, ZpodNetwork, Profile, ProfileItem } from "@/types"
import { StatusBadge } from "@/components/status-badge"
import { isInProgressStatus } from "@/lib/status-colors"
import {
  HoverCard,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import { ZpodCreateDialog } from "@/components/zpod-create-dialog"
import { BuildProgressHoverContent } from "@/components/build-progress-hover"
import { buildHoverRows } from "@/lib/build-progress"
import { flattenProfileItems } from "@/lib/profile-utils"
import { cn, copyToClipboard } from "@/lib/utils"

/** Group components by name and return "N x name" lines like the CLI */
function groupComponents(components: ZpodComponentView[]): string[] {
  const counts = new Map<string, number>()
  for (const c of components) {
    const name = c.component.component_name
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([name, count]) => `${count} x ${name}`)
}

/** Extract owner usernames from permissions */
function getOwners(zpod: Zpod): string {
  const owners = zpod.permissions
    ?.filter((p) => p.permission === "OWNER")
    .flatMap((p) => p.users.map((u) => u.username))
  return owners?.length ? owners.join(", ") : "—"
}

/** Compute the parent /24 CIDR from a list of /26 networks */
function parentCidr(networks: ZpodNetwork[]): string {
  const first = networks[0]?.cidr
  if (!first) return "—"
  const [ipStr, prefixStr] = first.split("/")
  const parts = ipStr.split(".").map(Number)
  const prefix = parseInt(prefixStr, 10)
  if (prefix <= 24) return first
  // Mask to /24
  const masked = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
  return masked
}

/** Extract VLAN ID from the last octet of the network address */
function cidrToVlanId(cidr: string): number {
  const ipStr = cidr.split("/")[0]
  const parts = ipStr.split(".").map(Number)
  return parts[3]
}

function NetworkSubnets({ networks }: { networks: ZpodNetwork[] }) {
  return (
    <div className="ml-4 mt-1 space-y-1 border-l border-muted-foreground/25 pl-2 text-muted-foreground">
      {networks.map((net, i) => {
        const vlan = cidrToVlanId(net.cidr)
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

function NetworkBlock({ networks }: { networks: ZpodNetwork[] }) {
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
  const [ownerFilter, setOwnerFilter] = useState("ALL")
  const [profileFilter, setProfileFilter] = useState("ALL")
  const [endpointFilter, setEndpointFilter] = useState("ALL")

  // Sync statusFilter when URL search params change (e.g. header badge click while already on /zpods)
  useEffect(() => {
    const fromUrl = parseStatusParam(searchParams.get("status"))
    setStatusFilter(fromUrl)
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

  const { sorted, sort, toggleSort } = useSort(filtered, "name")

  const [endpointCount, setEndpointCount] = useState<number | null>(null)

  const columnDefaults = useMemo<Record<ColumnKey, boolean>>(() => ({
    profile: true,
    endpoint: true,
    networks: true,
    owners: true,
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">zPods</h1>
          <Badge variant="outline">{sorted.length === zpods.length ? `${zpods.length} total` : `${sorted.length} / ${zpods.length}`}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Column visibility toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-1 h-3 w-3" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
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

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
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

      <Card>
        <CardContent className="p-0">
          {zpods.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No zpods found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Name / Domain" sortKey="name" sort={sort} onToggle={toggleSort} className="whitespace-nowrap" />
                  {OPTIONAL_COLUMNS.map((col) => {
                    if (!columns[col.key]) return null
                    const filterConfig = col.key === "owners"
                      ? { value: ownerFilter, onChange: setOwnerFilter, label: "Owner", options: allOwners }
                      : col.key === "profile"
                        ? { value: profileFilter, onChange: setProfileFilter, label: "Profile", options: allProfiles }
                        : col.key === "endpoint"
                          ? { value: endpointFilter, onChange: setEndpointFilter, label: "Endpoint", options: allEndpoints }
                          : null
                    if (filterConfig && filterConfig.options.length > 1) {
                      const isFiltered = filterConfig.value !== "ALL"
                      return (
                        <TableHead key={col.key} className={cn("whitespace-nowrap", col.breakpoint)}>
                          <Select value={filterConfig.value} onValueChange={filterConfig.onChange}>
                            <SelectTrigger className="h-7 border-none bg-transparent px-0 text-xs font-medium shadow-none gap-1">
                              <SelectValue>
                                {isFiltered ? (
                                  <span className="flex items-center gap-1.5">
                                    {filterConfig.label}:
                                    <Badge variant="outline" className="bg-[#89b4fa]/15 text-[#89b4fa] border-[#89b4fa]/30 text-xs px-1.5 py-0">
                                      {filterConfig.value}
                                    </Badge>
                                  </span>
                                ) : filterConfig.label}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ALL">All {filterConfig.label}s</SelectItem>
                              {filterConfig.options.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableHead>
                      )
                    }
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
                  <TableHead className="whitespace-nowrap w-px text-right pl-0 pr-2.5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((zpod) => {
                  const componentGroups = groupComponents(zpod.components ?? [])
                  const totalFromProfile = profileComponentCounts.get(zpod.profile) ?? 0
                  const done = (zpod.components ?? []).filter(
                    (c) => c.status === "ACTIVE"
                  ).length
                  const showProgress =
                    zpod.status !== "ACTIVE" &&
                    zpod.status !== "DELETED" &&
                    zpod.status !== "DELETING" &&
                    !zpod.status.endsWith("_FAILED") &&
                    totalFromProfile > 0
                  const pct = totalFromProfile > 0
                    ? Math.round((done / totalFromProfile) * 100)
                    : 0
                  const deployedComponents = zpod.components ?? []
                  const profileSteps = profileStepsMap.get(zpod.profile) ?? []
                  const deployedByUid = new Map(deployedComponents.map((c) => [c.component.component_uid, c]))
                  const hoverRows = buildHoverRows(profileSteps)
                  return (
                    <React.Fragment key={zpod.id}>
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
                            <div className="font-medium">{zpod.profile}</div>
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
                            {zpod.endpoint?.name ?? "—"}
                          </TableCell>
                        )}

                        {columns.networks && (
                          <TableCell className="hidden xl:table-cell whitespace-nowrap font-mono">
                            {zpod.networks?.length ? (
                              <NetworkBlock networks={zpod.networks} />
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        )}

                        {columns.owners && (
                          <TableCell className="hidden 2xl:table-cell whitespace-nowrap">
                            {getOwners(zpod)}
                          </TableCell>
                        )}

                        <TableCell className="whitespace-nowrap text-center">
                          {showProgress ? (
                            <HoverCard openDelay={200} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <span className="cursor-default">
                                  <StatusBadge status={zpod.status} />
                                </span>
                              </HoverCardTrigger>
                              <BuildProgressHoverContent
                                creationDate={zpod.creation_date}
                                pct={pct}
                                hoverRows={hoverRows}
                                deployedByUid={deployedByUid}
                              />
                            </HoverCard>
                          ) : (
                            <StatusBadge status={zpod.status} />
                          )}
                        </TableCell>
                        <TableCell className="text-right pl-0 pr-2.5">
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
                          </div>
                        </TableCell>
                      </TableRow>
                      {showProgress && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={visibleCount + 1} className="p-0">
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
    </div>
  )
}
