import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import {
  ChevronRight,
  Globe,
  Lock,
  MoreHorizontal,
  Network,
  Plus,
  Power,
  Route,
  Share2,
  Trash2,
  Undo2,
  Workflow,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmationDialog } from "@/components/confirmation-dialog"
import { IconTooltip } from "@/components/icon-tooltip"
import { ZpodNetworkAddDialog } from "@/components/zpod-network-add-dialog"
import { ZpodNetworkRoutingDialog, type RoutingRun } from "@/components/zpod-network-routing-dialog"
import { ZpodNetworksTopology } from "@/components/zpod-networks-topology"
import { useApi } from "@/hooks/use-api"
import { usePreferencesStore, type NetworkGroupsOpen } from "@/stores/preferences-store"
import { cn } from "@/lib/utils"
import {
  apiErrorMessage,
  cidrToVlanId,
  cidrToZcoreIp,
  cidrsOverlap,
  hasNetworksApi,
  isMissingZboxapiRoute,
  managementNetwork,
} from "@/lib/network-utils"
import { networkKindTextClass, networkRoutingClasses, networkStatusClasses } from "@/lib/status-colors"
import type { TopologyPath } from "@/lib/zpod-topology"
import type { Zpod, ZpodDnsEntry, ZpodNetworkView } from "@/types"

interface ZpodNetworksCardProps {
  zpod: Zpod
  pool: string | null // the endpoint's zPod pool, e.g. "10.96.0.0/16"
  t0Name: string
  isMaintainer: boolean
  isSuperadmin: boolean
  zcoreActive: boolean
  zcoreVersion: string
  features: { masquerade: boolean; toggle: boolean }
  dnsEntries: ZpodDnsEntry[]
  /** GET /zpods/{id}/networks, polled by the page; null until the first answer. */
  live: ZpodNetworkView[] | null
  liveFailed: boolean
  onRefresh: () => void
}

const GROUPS: { kind: keyof NetworkGroupsOpen; label: string }[] = [
  // The protected groups are named by their routing, which never changes: GLOBAL for the
  // zPod's networks, LOCAL for zcore's own.
  { kind: "zpod", label: "zPod Networks (global)" },
  { kind: "zcore", label: "zCore Networks (local)" },
  { kind: "user", label: "User Networks" },
]
const NEEDS_137 = "Needs zcore 13.7 (zboxapi 0.2.0)"

/** The embedded zPod networks as views, for when the live list cannot be read. */
function embeddedViews(zpod: Zpod): ZpodNetworkView[] {
  return zpod.networks.map((n) => ({
    id: n.id,
    name: n.name ?? n.cidr,
    cidr: n.cidr,
    vlan_id: n.vlan_id ?? 0,
    gateway: n.gateway ?? "",
    kind: n.kind ?? "zpod",
    masquerade: n.masquerade ?? false,
    routing: n.routing ?? "LOCAL",
    status: "UNKNOWN",
  }))
}

function groupSummary(kind: string, rows: ZpodNetworkView[]): string {
  const byStatus = rows.reduce<Record<string, number>>((acc, n) => ({ ...acc, [n.status]: (acc[n.status] ?? 0) + 1 }), {})
  const statuses = Object.keys(byStatus)
  const status =
    statuses.length === 1 ? `all ${statuses[0]}` : statuses.map((s) => `${byStatus[s]} ${s}`).join(" · ")
  if (kind === "zcore") return `VLAN ${rows.map((n) => n.vlan_id).join(" · ")} · ${status}`
  if (kind === "zpod")
    return `mgmt + VLAN ${rows.filter((n) => n.vlan_id !== 0).map((n) => n.vlan_id).join(" · ")} · ${status}`
  const global = rows.filter((n) => n.routing === "GLOBAL").length
  const pending = rows.filter((n) => n.routing === "PENDING").length
  return [`${rows.length} networks`, global && `${global} global`, pending && `${pending} pending`, status]
    .filter(Boolean)
    .join(" · ")
}

export function ZpodNetworksCard({
  zpod,
  pool,
  t0Name,
  isMaintainer,
  isSuperadmin,
  zcoreActive,
  zcoreVersion,
  features,
  dnsEntries,
  live,
  liveFailed,
  onRefresh: load,
}: ZpodNetworksCardProps) {
  const { removeZpodNetwork, setZpodNetworkEnabled, setZpodNetworkMasquerade } = useApi()
  const apiAvailable = hasNetworksApi(zpod.networks)
  const [busy, setBusy] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<ZpodNetworkView | null>(null)
  const [removing, setRemoving] = useState(false)
  const [routingTarget, setRoutingTarget] = useState<{ network: ZpodNetworkView; target: "GLOBAL" | "LOCAL" } | null>(null)
  const [runs, setRuns] = useState<Record<string, RoutingRun>>({})

  const { networksView, setNetworksView, networkGroupsOpen, setNetworkGroupOpen } = usePreferencesStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = (searchParams.get("view") as "table" | "topology" | null) ?? networksView
  const topoNet = searchParams.get("net") ?? ""
  const topoPath = (searchParams.get("path") as TopologyPath | null) ?? "internet"

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const selectView = (v: "table" | "topology") => {
    setNetworksView(v)
    setParams({ view: v })
  }

  const networks = useMemo(() => live ?? (apiAvailable ? embeddedViews(zpod) : []), [live, apiAvailable, zpod])
  const grouped = useMemo(
    () => GROUPS.map((g) => ({ ...g, rows: networks.filter((n) => n.kind === g.kind) })).filter((g) => g.rows.length),
    [networks]
  )
  const mgmt = managementNetwork(networks)
  const zcoreIp = mgmt ? cidrToZcoreIp(mgmt.cidr) : ""

  const onChanged = useCallback(() => load(), [load])
  const onRunStarted = useCallback((name: string, run: RoutingRun) => setRuns((r) => ({ ...r, [name]: run })), [])

  // --- row actions ---
  const toggleEnabled = async (n: ZpodNetworkView, enabled: boolean) => {
    setBusy(n.name)
    try {
      await setZpodNetworkEnabled(zpod.id, n.name, enabled)
      toast.success(`${n.name} ${enabled ? "enabled" : "disabled"}`)
      load()
    } catch (err) {
      toast.error(`Could not ${enabled ? "enable" : "disable"} ${n.name}`, {
        description: isMissingZboxapiRoute(err)
          ? "This zcore's zboxapi cannot enable or disable interfaces; it needs zboxapi 0.2.0 (zcore 13.7)."
          : apiErrorMessage(err, "zpodapi refused the change"),
      })
    } finally {
      setBusy(null)
    }
  }

  const toggleMasquerade = async (n: ZpodNetworkView, enabled: boolean) => {
    setBusy(n.name)
    try {
      await setZpodNetworkMasquerade(zpod.id, n.name, enabled)
      toast.success(`Masquerade ${enabled ? "on" : "off"} for ${n.name}`)
      load()
    } catch (err) {
      toast.error(`Could not turn masquerade ${enabled ? "on" : "off"}`, {
        description: apiErrorMessage(err, "zpodapi refused the change"),
      })
    } finally {
      setBusy(null)
    }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await removeZpodNetwork(zpod.id, removeTarget.name)
      toast.success(`${removeTarget.name} removed`)
      setRemoveTarget(null)
      load()
    } catch (err) {
      toast.error(`Could not remove ${removeTarget.name}`, {
        description: apiErrorMessage(err, "zpodapi refused the removal"),
      })
    } finally {
      setRemoving(false)
    }
  }

  const dnsInside = (n: ZpodNetworkView) =>
    dnsEntries.filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d.ip) && cidrsOverlap(`${d.ip}/32`, n.cidr))

  const showInTopology = (n: ZpodNetworkView) => {
    setNetworksView("topology")
    setParams({ view: "topology", net: n.name })
  }

  // --- legacy zpodapi (no user networks): today's read-only table ---
  if (!apiAvailable) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-4 w-4" />
            Networks
            {zpod.networks?.length > 0 && <Badge variant="outline" className="ml-1">{zpod.networks.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {zpod.networks?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CIDR</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>VLAN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zpod.networks.map((net, idx) => {
                  const isFirst = idx === 0
                  const [a, b, c, d] = net.cidr.split("/")[0].split(".").map(Number)
                  return (
                    <TableRow key={net.cidr}>
                      <TableCell className="whitespace-nowrap font-mono">{net.cidr}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono">
                        {`${a}.${b}.${c}.${d + 1}`}{" "}
                        <span className={isFirst ? "text-purple-400/80" : "text-amber-400/80"}>
                          ({isFirst ? "NSX-T1" : "zcore"})
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {isFirst ? (
                          <span className="text-muted-foreground">Untagged</span>
                        ) : (
                          <span className="font-mono">{cidrToVlanId(net.cidr)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No networks</p>
          )}
        </CardContent>
      </Card>
    )
  }

  const userNames = networks.filter((n) => n.kind === "user").map((n) => n.name)
  const topoSelected = userNames.includes(topoNet) ? topoNet : topoNet === "all" ? "all" : userNames[0] ?? "all"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              Networks
              <Badge variant="outline" className="ml-1">{networks.length}</Badge>
            </CardTitle>
            <div className="inline-flex overflow-hidden rounded-md border" role="tablist" aria-label="Networks view">
              {(["table", "topology"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => selectView(v)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors first:border-r",
                    view === v
                      ? "bg-accent text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]"
                      : "text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  {v === "table" ? "Table" : "Topology"}
                </button>
              ))}
            </div>
          </div>
          {isMaintainer && (
            <span title={zcoreActive ? undefined : "zcore is not ACTIVE yet"}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!zcoreActive}
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Network
              </Button>
            </span>
          )}
        </div>
        {liveFailed && (
          <p className="mt-2 text-xs text-muted-foreground">
            The live state could not be read from zcore; showing the networks as zPodFactory records them.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {view === "topology" ? (
          <ZpodNetworksTopology
            zpodName={zpod.name}
            zpodDomain={zpod.domain}
            t0Name={t0Name}
            t1Name={`zPod-${zpod.name}-tier1`}
            segmentName={`zPod-${zpod.name}-segment`}
            zcoreIp={zcoreIp}
            eth0={mgmt ? `${zcoreIp}/${mgmt.cidr.split("/")[1]}` : ""}
            mgmtCidr={mgmt?.cidr ?? ""}
            networks={networks}
            masqueradeSupported={features.masquerade}
            selected={topoSelected}
            path={topoPath}
            onSelect={(name) => setParams({ view: "topology", net: name })}
            onPath={(p) => setParams({ view: "topology", path: p })}
          />
        ) : (
          <div className="overflow-x-auto">
            {/* Compact cells and no Kind column (the group headers say it), so the table fits a
                laptop screen. Below 1340px the CIDR goes (the gateway carries the prefix) and the routing
                badge moves into the Status cell. */}
            <Table className="[&_td]:px-2.5 [&_td]:py-2 [&_td]:align-middle [&_th]:h-10 [&_th]:px-2.5">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>VLAN</TableHead>
                  <TableHead className="hidden min-[1340px]:table-cell">CIDR</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Masquerade</TableHead>
                  <TableHead className="hidden min-[1340px]:table-cell">Routing</TableHead>
                  <TableHead>
                    <span className="min-[1340px]:hidden">Routing · Status</span>
                    <span className="hidden min-[1340px]:inline">Status</span>
                  </TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((g) => {
                  const open = networkGroupsOpen[g.kind]
                  return [
                    <TableRow key={`grp-${g.kind}`} className="bg-muted/30 hover:bg-muted/50">
                      <TableCell colSpan={8} className="!p-0">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setNetworkGroupOpen(g.kind, !open)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
                          <span className={cn("normal-case tracking-normal", networkKindTextClass(g.kind))}>{g.label}</span>
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px] normal-case tracking-normal">
                            {g.rows.length}
                          </Badge>
                          {!open && (
                            <span className="ml-1 font-mono text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                              {groupSummary(g.kind, g.rows)}
                            </span>
                          )}
                        </button>
                      </TableCell>
                    </TableRow>,
                    ...(open
                      ? g.rows.map((n) => (
                          <NetworkRow
                            key={`${g.kind}-${n.name}`}
                            n={n}
                            busy={busy === n.name}
                            isMaintainer={isMaintainer}
                            isSuperadmin={isSuperadmin}
                            features={features}
                            run={runs[n.name]}
                            dnsInside={dnsInside(n)}
                            onToggle={toggleEnabled}
                            onMasquerade={toggleMasquerade}
                            onRouting={(network, target) => setRoutingTarget({ network, target })}
                            onShowRun={(network) =>
                              setRoutingTarget({ network, target: runs[network.name].target })
                            }
                            onRemove={setRemoveTarget}
                            onShowInTopology={showInTopology}
                          />
                        ))
                      : []),
                  ]
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ZpodNetworkAddDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        zpodId={zpod.id}
        zpodName={zpod.name}
        networks={networks}
        pool={pool}
        isSuperadmin={isSuperadmin}
        masqueradeSupported={features.masquerade}
        zcoreVersion={zcoreVersion}
        onAdded={load}
      />

      {routingTarget && (
        <ZpodNetworkRoutingDialog
          open={!!routingTarget}
          onOpenChange={(o) => !o && setRoutingTarget(null)}
          zpodId={zpod.id}
          zpodName={zpod.name}
          network={networks.find((n) => n.name === routingTarget.network.name) ?? routingTarget.network}
          target={routingTarget.target}
          run={routingTarget.network.routing === "PENDING" ? runs[routingTarget.network.name] ?? null : null}
          masqueradeSupported={features.masquerade}
          onRunStarted={onRunStarted}
          onChanged={onChanged}
        />
      )}

      <ConfirmationDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? ""}?`}
        description={
          <>
            Are you sure you want to remove network <span className="font-mono">{removeTarget?.name}</span> from zPod{" "}
            <span className="font-mono">{zpod.name}</span>? Interface eth1.{removeTarget?.vlan_id} and its subnet{" "}
            <span className="font-mono">{removeTarget?.cidr}</span> are deleted from zcore.
          </>
        }
        onConfirm={handleRemove}
        loading={removing}
        confirmText="Remove"
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
      />
    </Card>
  )
}

function NetworkRow({
  n,
  busy,
  isMaintainer,
  isSuperadmin,
  features,
  run,
  dnsInside,
  onToggle,
  onMasquerade,
  onRouting,
  onShowRun,
  onRemove,
  onShowInTopology,
}: {
  n: ZpodNetworkView
  busy: boolean
  isMaintainer: boolean
  isSuperadmin: boolean
  features: { masquerade: boolean; toggle: boolean }
  run: RoutingRun | undefined
  dnsInside: ZpodDnsEntry[]
  onToggle: (n: ZpodNetworkView, enabled: boolean) => void
  onMasquerade: (n: ZpodNetworkView, enabled: boolean) => void
  onRouting: (n: ZpodNetworkView, target: "GLOBAL" | "LOCAL") => void
  onShowRun: (n: ZpodNetworkView) => void
  onRemove: (n: ZpodNetworkView) => void
  onShowInTopology: (n: ZpodNetworkView) => void
}) {
  const system = n.kind !== "user"
  const pending = n.routing === "PENDING"
  const viaT1 = n.vlan_id === 0
  const masqueradeCell = (() => {
    if (n.kind === "zpod") return <span className="text-muted-foreground">—</span>
    if (!features.masquerade)
      return (
        <span className="text-muted-foreground" title={NEEDS_137}>
          n/a
        </span>
      )
    if (n.status === "UNKNOWN") return <span className="text-muted-foreground">?</span>
    return n.masquerade ? (
      <span className="font-medium text-[#a6e3a1]">True</span>
    ) : (
      <span className="text-muted-foreground">False</span>
    )
  })()

  const routingBadge = (
    <Badge variant="outline" className={cn("gap-1", networkRoutingClasses(n.routing))}>
      {pending && <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" />}
      {n.routing}
    </Badge>
  )

  return (
    <TableRow className={cn(system && "text-muted-foreground")}>
      <TableCell className="min-w-[7.5rem] max-w-[16rem] font-mono [overflow-wrap:anywhere]">{n.name}</TableCell>
      <TableCell className="whitespace-nowrap font-mono">
        {n.vlan_id === 0 ? <span className="font-sans text-xs text-muted-foreground">untagged</span> : n.vlan_id}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap font-mono min-[1340px]:table-cell">{n.cidr}</TableCell>
      <TableCell className="font-mono">
        <span className="whitespace-nowrap">{n.gateway}</span>{" "}
        <span className={cn("whitespace-nowrap text-xs", viaT1 ? "text-purple-400/80" : "text-amber-400/80")}>
          ({viaT1 ? "NSX-T1" : "zcore"})
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap">{masqueradeCell}</TableCell>
      <TableCell className="hidden whitespace-nowrap min-[1340px]:table-cell">{routingBadge}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <span className="min-[1340px]:hidden">{routingBadge}</span>
          <Badge variant="outline" className={networkStatusClasses(n.status)}>
            {n.status}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        {system ? (
          <IconTooltip label={n.kind === "zcore" ? "Configured by the zcore image" : "Created and removed with the zPod"}>
            <span className="inline-flex p-1 text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
            </span>
          </IconTooltip>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy} aria-label={`Actions for ${n.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {isMaintainer && (
                <>
                  <MenuItem
                    icon={<Power />}
                    label={n.status === "DISABLED" ? "Enable" : "Disable"}
                    hint={
                      !features.toggle
                        ? NEEDS_137
                        : pending
                          ? "A routing change is running"
                          : n.status === "DISABLED"
                            ? `Bring eth1.${n.vlan_id} up on zcore`
                            : `Bring eth1.${n.vlan_id} down on zcore. Not kept across a zcore reboot.`
                    }
                    disabled={!features.toggle || pending || (n.status !== "ACTIVE" && n.status !== "DISABLED")}
                    onSelect={() => onToggle(n, n.status === "DISABLED")}
                  />
                  <MenuItem
                    icon={<Globe />}
                    label={n.masquerade ? "Turn masquerade off" : "Turn masquerade on"}
                    hint={
                      !features.masquerade
                        ? NEEDS_137
                        : pending
                          ? "A routing change is running"
                          : !n.masquerade && n.routing !== "LOCAL"
                            ? "Set routing local first"
                            : n.masquerade
                              ? `Hosts on ${n.cidr} keep their own source address`
                              : `Hosts on ${n.cidr} leave with zcore's address`
                    }
                    disabled={!features.masquerade || pending || (!n.masquerade && n.routing !== "LOCAL")}
                    onSelect={() => onMasquerade(n, !n.masquerade)}
                  />
                </>
              )}
              {(isSuperadmin || (pending && run)) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                    Routing
                  </DropdownMenuLabel>
                  {pending ? (
                    run && <MenuItem icon={<Workflow />} label="Show routing run" hint="Follow the run to its verdict" onSelect={() => onShowRun(n)} />
                  ) : n.routing === "GLOBAL" ? (
                    <MenuItem
                      icon={<Undo2 />}
                      label="Withdraw from the fabric"
                      hint="Deletes the T1 static route to zcore"
                      onSelect={() => onRouting(n, "LOCAL")}
                    />
                  ) : (
                    <MenuItem
                      icon={<Route />}
                      label="Advertise to the fabric"
                      hint={`Adds a T1 static route to zcore${n.masquerade ? ". Turns masquerade off." : ""}`}
                      onSelect={() => onRouting(n, "GLOBAL")}
                    />
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <MenuItem icon={<Share2 />} label="Show in topology" hint={`Opens the Topology tab on ${n.name}`} onSelect={() => onShowInTopology(n)} />
              {isMaintainer && (
                <>
                  <DropdownMenuSeparator />
                  <MenuItem
                    icon={<Trash2 />}
                    label="Remove network"
                    destructive
                    hint={
                      n.routing === "GLOBAL"
                        ? "Withdraw it from the fabric first"
                        : pending
                          ? "A routing change is running"
                          : dnsInside.length
                            ? `${dnsInside.length} DNS record(s) point into ${n.cidr} (${dnsInside.map((d) => d.hostname).join(", ")}); delete them first`
                            : undefined
                    }
                    disabled={n.routing !== "LOCAL" || dnsInside.length > 0}
                    onSelect={() => onRemove(n)}
                  />
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  )
}

function MenuItem({
  icon,
  label,
  hint,
  disabled,
  destructive,
  onSelect,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  disabled?: boolean
  destructive?: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={onSelect}
      className={cn("items-start", destructive && "text-destructive focus:text-destructive")}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="grid gap-0.5">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
    </DropdownMenuItem>
  )
}
