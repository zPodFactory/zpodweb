import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/status-badge"
import { toast } from "sonner"
import { IconTooltip } from "@/components/icon-tooltip"
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  Network,
  Plus,
  Server,
  Trash2,
} from "lucide-react"
import type { Zpod, EndpointFull, ZpodNetwork, ZpodComponentView, ComponentFull, ProfileItemCreate, ZpodDnsEntry, Profile, ProfileItem } from "@/types"
import { AddComponentDialog } from "@/components/add-component-dialog"
import { ElapsedTime } from "@/components/elapsed-time"
import { flattenProfileItems } from "@/lib/profile-utils"
import { copyToClipboard, formatDateTime } from "@/lib/utils"
import { extractComponentType, extractComponentVersion, getComponentHex, componentStyles } from "@/lib/component-colors"
import { groupDeployedByUid } from "@/lib/build-progress"

// --- CIDR helpers ---

function cidrToNetworkIp(cidr: string): number {
  const [ipStr, prefixStr] = cidr.split("/")
  const prefixLen = parseInt(prefixStr, 10)
  if (isNaN(prefixLen)) return 0
  const parts = ipStr.split(".").map(Number)
  const ip = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0
  return (ip & mask) >>> 0
}

function ipToString(ip: number): string {
  return [
    (ip >>> 24) & 0xff,
    (ip >>> 16) & 0xff,
    (ip >>> 8) & 0xff,
    ip & 0xff,
  ].join(".")
}

function cidrToGateway(cidr: string): string {
  return ipToString((cidrToNetworkIp(cidr) | 1) >>> 0)
}

/** Network address + 2 = zbox IP (DNS server for all networks) */
function cidrToZboxIp(cidr: string): string {
  return ipToString((cidrToNetworkIp(cidr) | 2) >>> 0)
}

/** VLAN ID: last octet of the network address. 0 = untagged. */
function cidrToVlanId(cidr: string): number {
  return cidrToNetworkIp(cidr) & 0xff
}

function cidrPrefix(cidr: string): string {
  return cidr.split("/")[1] ?? "0"
}

// --- Detail row ---

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
}

// --- Password row with eye toggle + copy ---

function PasswordRow({ value }: { value: string | null }) {
  const [visible, setVisible] = useState(false)
  const display = value ?? "—"
  const masked = value ? "*".repeat(Math.min(value.length, 24)) : "—"

  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-muted-foreground">Password</span>
      <div className="flex items-center gap-1">
        <span className="text-sm font-mono">{visible ? display : masked}</span>
        {value && (
          <>
            <IconTooltip label={visible ? "Hide password" : "Show password"}>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </IconTooltip>
            <IconTooltip label="Copy password">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={async () => {
                  const ok = await copyToClipboard(value)
                  if (ok) toast.success("Password copied")
                  else toast.error("Failed to copy password")
                }}
              >
                <KeyRound className="h-3 w-3" />
              </Button>
            </IconTooltip>
          </>
        )}
      </div>
    </div>
  )
}

// --- Component type label ---

function componentTypeLabel(uid: string): string {
  return extractComponentType(uid)
}

// --- Network topology diagram (Visio-style) ---

function NetworkTopology({
  networks,
  t0Name,
  components,
  zpodName,
  endpointNetwork,
}: {
  networks: ZpodNetwork[]
  t0Name: string
  components: ZpodComponentView[]
  zpodName: string
  endpointNetwork: EndpointFull["endpoints"]["network"] | null
}) {
  const prefix = networks.length > 0 ? cidrPrefix(networks[0].cidr) : "26"
  const firstNet = networks.length > 0 ? networks[0] : null
  const restNets = networks.slice(1)
  const zboxIp = firstNet ? cidrToZboxIp(firstNet.cidr) : "—"
  const t1InterfaceIp = firstNet
    ? `${cidrToGateway(firstNet.cidr)}/${prefix}`
    : "—"
  const t1Name = `zPod-${zpodName}-tier1`
  const segmentName = `zPod-${zpodName}-segment`
  const edgeCluster = endpointNetwork?.edgecluster ?? "—"
  const transportZone = endpointNetwork?.transportzone ?? "—"

  // Find zbox component for version display
  const zboxComp = components.find((c) => extractComponentType(c.component.component_uid) === "zbox")
  const zboxVersion = zboxComp ? extractComponentVersion(zboxComp.component.component_uid) : ""

  // Sort components by IP address (numerically), exclude zbox (shown separately)
  const sortedComponents = [...components]
    .filter((c) => !c.component.component_uid.toLowerCase().includes("zbox"))
    .sort((a, b) => {
      const ipToNum = (ip: string | null) => {
        if (!ip) return Number.MAX_SAFE_INTEGER
        const parts = ip.split(".").map(Number)
        return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
      }
      return ipToNum(a.ip) - ipToNum(b.ip)
    })

  return (
    <div className="py-6 px-2 overflow-x-auto">
      <div className="flex flex-col items-center min-w-fit">
        {/* Upper diagram: boxes with side-text, left-aligned as a group */}
        <div className="flex flex-col items-start">
          {/* ── NSX T0 Router ── */}
          <div className="flex items-start gap-4">
            <div className="rounded-lg border-2 border-blue-500/50 bg-blue-500/10 px-6 py-3 text-center shadow-md shadow-blue-500/5 min-w-[180px]">
              <div className="text-xs uppercase tracking-widest text-blue-400/70 font-medium">
                NSX T0
              </div>
              <div className="text-sm font-bold text-blue-300">{t0Name || "T0"}</div>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
              {endpointNetwork && (
                <>
                  <div>
                    zPodFactory Endpoint:{" "}
                    <span className="font-mono text-foreground/80">{endpointNetwork.hostname}</span>
                    <span className="ml-1">({endpointNetwork.driver.toLowerCase()})</span>
                  </div>
                  <div>
                    zPodFactory Networks:{" "}
                    <span className="font-mono text-foreground/80">{endpointNetwork.networks}</span>
                  </div>
                  <div>
                    Edge Cluster:{" "}
                    <span className="font-mono text-foreground/80">{edgeCluster}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Vertical connector T0 → T1 with CGNAT label */}
          <div className="flex items-stretch gap-4 ml-[89px]">
            <div className="w-px bg-gradient-to-b from-blue-500/40 to-purple-500/40 min-h-[48px]" />
            <div className="text-xs text-muted-foreground/70 italic py-3">
              NSX T0/T1 Auto-plumbing (100.64.0.0/10 CGNAT)
            </div>
          </div>

          {/* ── NSX T1 Router ── */}
          <div className="flex items-center gap-4">
            <div className="rounded-lg border-2 border-purple-500/50 bg-purple-500/10 px-6 py-3 text-center shadow-md shadow-purple-500/5 min-w-[180px]">
              <div className="text-xs uppercase tracking-widest text-purple-400/70 font-medium">
                NSX T1
              </div>
              <div className="text-sm font-bold text-purple-300">{t1Name}</div>
            </div>
            <div className="text-xs text-muted-foreground">
              Edge Cluster:{" "}
              <span className="font-mono text-foreground/80">{edgeCluster}</span>
            </div>
          </div>

          {/* Vertical connector T1 → Segment with interface + static routes */}
          <div className="flex items-stretch gap-4 ml-[89px]">
            <div className="w-0.5 bg-purple-500/30 min-h-[20px]" />
            <div className="text-xs font-mono text-foreground/80 py-1">
              {t1InterfaceIp}{" "}
              <span className="text-muted-foreground font-sans">(zPod Management Network)</span>
            </div>
          </div>
          {restNets.length > 0 && (
            <>
              <div className="flex items-stretch gap-4 ml-[89px]">
                <div className="w-0.5 bg-purple-500/25 min-h-[12px]" />
                <div className="text-xs text-muted-foreground py-0.5" />
              </div>
              <div className="flex items-stretch gap-4 ml-[89px]">
                <div className="w-0.5 bg-purple-500/20 min-h-[20px]" />
                <div className="text-xs text-muted-foreground space-y-0.5 py-1">
                  <div className="font-medium">NSX-T1 Static routes to <span className="text-amber-400/80">zbox</span> (eth0):</div>
                  {restNets.map((net) => (
                    <div key={net.id} className="font-mono ml-2">
                      <span className="text-foreground/80">{net.cidr}</span>
                      {" → "}
                      <span className="text-foreground/80">{zboxIp}</span>
                      <span className="font-sans text-amber-400/80"> (zbox)</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {/* Segment info — connector continues to trunk line */}
          <div className="flex items-stretch gap-4 ml-[89px]">
            <div className="w-0.5 bg-gradient-to-b from-purple-500/20 to-zinc-500/40 min-h-[40px]" />
            <div className="text-xs text-muted-foreground space-y-0.5 py-2">
              <div>
                <span className="font-mono text-foreground/80">{segmentName}</span>
                <span className="ml-1">({transportZone})</span>
              </div>
              <div className="italic">This NSX Segment carries VLANs [0-4094] (802.1Q Trunk)</div>
            </div>
          </div>

          {/* Final connector reaching the trunk line */}
          <div className="flex items-stretch ml-[89px]">
            <div className="w-0.5 bg-zinc-500/40 min-h-[12px]" />
          </div>
        </div>
        <div className="relative w-full mt-0 overflow-hidden" style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)' }}>
          <div className="flex justify-center gap-5 mt-0 flex-wrap">
            {/* zBox card with interface details — always first */}
            <div className="flex flex-col items-center relative">
              <div className="absolute top-0 h-0.5 pointer-events-none" style={{ left: '-50vw', right: '-50vw', background: 'rgb(113 113 122 / 0.35)' }} />
              <div className="w-px h-5 bg-amber-500/40" />
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-center min-w-[110px] shadow-sm whitespace-nowrap">
                <div className="text-xs uppercase tracking-wider text-amber-400/70 font-medium">
                  zBox
                  {zboxVersion && <span className="ml-1 normal-case">{zboxVersion}</span>}
                </div>
                <div className="text-xs font-semibold text-amber-300 mt-0.5">{zboxComp?.hostname ?? "zbox"}</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {zboxIp}
                </div>
                {/* Interface details */}
                <div className="mt-1.5 pt-1.5 border-t border-amber-500/20 space-y-0.5 text-left">
                  {firstNet && (
                    <div className="text-xs font-mono whitespace-nowrap">
                      <span className="text-amber-300">eth0</span>
                      <span className="text-muted-foreground ml-1">
                        {cidrToZboxIp(firstNet.cidr)}/{prefix}
                      </span>
                      <span className="text-muted-foreground/60 font-sans ml-1">(Untagged)</span>
                    </div>
                  )}
                  {restNets.map((net) => {
                    const vlan = cidrToVlanId(net.cidr)
                    return (
                      <div key={net.id} className="text-xs font-mono whitespace-nowrap">
                        <span className="text-amber-300">eth1.{vlan}</span>
                        <span className="text-muted-foreground ml-1">
                          {cidrToGateway(net.cidr)}/{prefix}
                        </span>
                        <span className="text-muted-foreground/60 font-sans ml-1">(VLAN {vlan})</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Other components sorted by IP */}
            {sortedComponents.map((comp) => {
              const hex = getComponentHex(comp.component.component_uid)
              const s = componentStyles(hex)
              const typeLabel = componentTypeLabel(comp.component.component_uid)
              const version = extractComponentVersion(comp.component.component_uid)
              return (
                <div key={`${comp.component.id}-${comp.hostname}`} className="flex flex-col items-center relative">
                  <div className="absolute top-0 h-0.5 pointer-events-none" style={{ left: '-50vw', right: '-50vw', background: 'rgb(113 113 122 / 0.35)' }} />
                  <div className="w-px h-5" style={s.line} />
                  <div
                    className="rounded-lg border px-3 py-2 text-center min-w-[110px] shadow-sm whitespace-nowrap"
                    style={{ ...s.border, ...s.bg }}
                  >
                    <div
                      className="text-xs uppercase tracking-wider font-medium"
                      style={s.textMuted}
                    >
                      {typeLabel}
                      {version && <span className="ml-1 normal-case">{version}</span>}
                    </div>
                    <div className="text-xs font-semibold mt-0.5" style={s.text}>
                      {comp.hostname ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {comp.ip ?? "no ip"}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main page ---

export function ZpodDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { fetchZpod, deleteZpod, fetchEndpoints, fetchComponents, fetchProfiles, addZpodComponent, deleteZpodComponent, fetchZpodDns, createZpodDns, deleteZpodDns } = useApi()

  const [zpod, setZpod] = useState<Zpod | null>(null)
  const [endpoints, setEndpoints] = useState<EndpointFull[]>([])
  const [allComponents, setAllComponents] = useState<ComponentFull[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showDestroy, setShowDestroy] = useState(false)
  const [destroying, setDestroying] = useState(false)
  const [showAddComponent, setShowAddComponent] = useState(false)
  const [addingComponent, setAddingComponent] = useState(false)
  const [deleteCompTarget, setDeleteCompTarget] = useState<ZpodComponentView | null>(null)
  const [deletingComponent, setDeletingComponent] = useState(false)

  // DNS state
  const [dnsEntries, setDnsEntries] = useState<ZpodDnsEntry[]>([])
  const [showAddDns, setShowAddDns] = useState(false)
  const [dnsHostname, setDnsHostname] = useState("")
  const [dnsIp, setDnsIp] = useState("")
  const [addingDns, setAddingDns] = useState(false)
  const [deleteDnsTarget, setDeleteDnsTarget] = useState<ZpodDnsEntry | null>(null)
  const [deletingDns, setDeletingDns] = useState(false)

  const zpodId = Number(id)

  // Check if zbox component is ACTIVE (DNS server must be up before querying DNS)
  const zboxActive = zpod?.components?.some(
    (c) => extractComponentType(c.component.component_uid) === "zbox" && c.status === "ACTIVE"
  ) ?? false

  const loadZpod = useCallback(() => {
    fetchZpod(zpodId).then((z) => {
      setZpod(z)
      // Only fetch DNS when zbox is ACTIVE
      const hasActiveZbox = z.components?.some(
        (c) => extractComponentType(c.component.component_uid) === "zbox" && c.status === "ACTIVE"
      )
      if (hasActiveZbox) {
        fetchZpodDns(zpodId).then(setDnsEntries).catch(() => {})
      }
    }).catch(() => {})
  }, [fetchZpod, fetchZpodDns, zpodId])

  useEffect(() => {
    Promise.all([fetchZpod(zpodId), fetchEndpoints(), fetchComponents(), fetchProfiles()])
      .then(async ([z, eps, comps, profs]) => {
        setZpod(z)
        setEndpoints(eps)
        setAllComponents(comps)
        setProfiles(profs)
        // Only fetch DNS when zbox is ACTIVE
        const hasActiveZbox = z.components?.some(
          (c) => extractComponentType(c.component.component_uid) === "zbox" && c.status === "ACTIVE"
        )
        if (hasActiveZbox) {
          try {
            const dns = await fetchZpodDns(zpodId)
            setDnsEntries(dns)
          } catch { /* ignore */ }
        }
      })
      .catch(() => toast.error("Failed to fetch zpod"))
      .finally(() => setLoading(false))
  }, [fetchZpod, fetchEndpoints, fetchComponents, fetchProfiles, fetchZpodDns, zpodId])

  usePolling(loadZpod)

  const handleDestroy = async () => {
    if (!zpod) return
    setDestroying(true)
    try {
      await deleteZpod(zpod.id)
      toast.success(`Destroying zpod "${zpod.name}"`)
      navigate("/zpods")
    } catch {
      toast.error(`Failed to destroy zpod "${zpod.name}"`)
    } finally {
      setDestroying(false)
      setShowDestroy(false)
    }
  }

  const handleAddComponent = async (payload: ProfileItemCreate) => {
    if (!zpod) return
    setAddingComponent(true)
    try {
      await addZpodComponent(zpod.id, payload)
      toast.success(`Component "${payload.component_uid}" added`)
      setShowAddComponent(false)
      loadZpod()
    } catch {
      toast.error(`Failed to add component "${payload.component_uid}"`)
    } finally {
      setAddingComponent(false)
    }
  }

  const handleDeleteComponent = async () => {
    if (!zpod || !deleteCompTarget) return
    setDeletingComponent(true)
    try {
      const identifier = deleteCompTarget.hostname
        ? `hostname=${deleteCompTarget.hostname}`
        : String(deleteCompTarget.component.id)
      await deleteZpodComponent(zpod.id, identifier)
      toast.success(`Component "${deleteCompTarget.hostname ?? deleteCompTarget.component.component_uid}" removed`)
      setDeleteCompTarget(null)
      loadZpod()
    } catch {
      toast.error(`Failed to remove component "${deleteCompTarget.hostname ?? deleteCompTarget.component.component_uid}"`)
    } finally {
      setDeletingComponent(false)
    }
  }

  const handleAddDns = async () => {
    if (!zpod || !dnsHostname.trim()) return
    setAddingDns(true)
    try {
      const payload: { hostname: string; ip?: string } = {
        hostname: dnsHostname.trim(),
      }
      if (dnsIp.trim()) payload.ip = dnsIp.trim()
      await createZpodDns(zpod.id, payload)
      toast.success(`DNS entry "${dnsHostname.trim()}" added`)
      setShowAddDns(false)
      setDnsHostname("")
      setDnsIp("")
      loadZpod()
    } catch {
      toast.error(`Failed to add DNS entry "${dnsHostname.trim()}"`)
    } finally {
      setAddingDns(false)
    }
  }

  const handleDeleteDns = async () => {
    if (!zpod || !deleteDnsTarget) return
    setDeletingDns(true)
    try {
      await deleteZpodDns(zpod.id, deleteDnsTarget.ip, deleteDnsTarget.hostname)
      toast.success(`DNS entry "${deleteDnsTarget.hostname}" removed`)
      setDeleteDnsTarget(null)
      loadZpod()
    } catch {
      toast.error(`Failed to remove DNS entry "${deleteDnsTarget.hostname}"`)
    } finally {
      setDeletingDns(false)
    }
  }

  // Hostnames that belong to zbox (protected from deletion)
  const zboxHostnames = new Set<string>()
  if (zpod) {
    const zboxComp = zpod.components?.find((c) => extractComponentType(c.component.component_uid) === "zbox")
    if (zboxComp?.hostname) {
      zboxHostnames.add(zboxComp.hostname)
      zboxHostnames.add(`${zboxComp.hostname}.${zpod.domain}`)
    }
    zboxHostnames.add("zbox")
    zboxHostnames.add(`zbox.${zpod.domain}`)
    zboxHostnames.add("localhost")
  }

  // Build progress hover card data (must be before early returns for hook rules)
  const zpodProfile = zpod ? profiles.find((p) => p.name === zpod.profile) : undefined
  const profileSteps = zpodProfile?.profile ?? []
  const totalFromProfile = zpodProfile ? flattenProfileItems(zpodProfile.profile).length : 0
  const doneCount = (zpod?.components ?? []).filter((c) => c.status === "ACTIVE").length
  const showBuildProgress = zpod != null &&
    zpod.status !== "ACTIVE" &&
    zpod.status !== "DELETED" &&
    zpod.status !== "DELETING" &&
    !zpod.status.endsWith("_FAILED") &&
    totalFromProfile > 0
  const buildPct = totalFromProfile > 0 ? Math.round((doneCount / totalFromProfile) * 100) : 0

  const buildHoverRows = useMemo(() => {
    if (!showBuildProgress || !zpod) return null
    const deployedByUid = groupDeployedByUid(zpod.components ?? [])
    type HoverRow = {
      pi: ProfileItem; key: string
      firstInTrunk: boolean; lastInTrunk: boolean
      parallel: boolean; firstInGroup: boolean; lastInGroup: boolean
    }
    const rows: HoverRow[] = []
    const total = profileSteps.reduce((n, s) => n + (Array.isArray(s) ? s.length : 1), 0)
    let idx = 0
    profileSteps.forEach((step, si) => {
      const items = Array.isArray(step) ? step : [step]
      const isParallel = items.length > 1
      items.forEach((pi, ii) => {
        rows.push({
          pi, key: `${si}-${ii}`,
          firstInTrunk: idx === 0, lastInTrunk: idx === total - 1,
          parallel: isParallel, firstInGroup: ii === 0, lastInGroup: ii === items.length - 1,
        })
        idx++
      })
    })
    return { rows, deployedByUid }
  }, [showBuildProgress, zpod, profileSteps])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!zpod) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/zpods")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to zPods
        </Button>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">
              zPod not found
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Resolve endpoint details
  const endpointFull = endpoints.find((ep) => ep.id === zpod.endpoint?.id)

  // Owner list
  const owners = zpod.permissions
    ?.filter((p) => p.permission === "OWNER")
    .flatMap((p) => p.users.map((u) => u.username))
  const ownerStr = owners?.length ? owners.join(", ") : "—"

  // Features
  const featureStr =
    zpod.features && Object.keys(zpod.features).length > 0
      ? Object.entries(zpod.features)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : "None"

  // T0 name from endpoint
  const t0Name = endpointFull?.endpoints.network.t0 ?? ""

  const statusBadgeElement = showBuildProgress ? (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="cursor-default">
          <StatusBadge status={zpod.status} />
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto min-w-[280px] px-4 py-3 bg-[#181825] border-[#313244]" side="bottom">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-zinc-100">Build Progress</p>
          <span className="text-xs text-zinc-400 tabular-nums">(<ElapsedTime date={zpod.creation_date} />)</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={buildPct} className="h-2 flex-1" />
          <span className="text-xs font-medium text-zinc-300 tabular-nums">{buildPct}%</span>
        </div>
        {buildHoverRows && "rows" in buildHoverRows && (
          <div className="mt-2.5">
            {buildHoverRows.rows.map((row) => {
              const candidates = buildHoverRows.deployedByUid.get(row.pi.component_uid) ?? []
              const deployed = (row.pi.hostname
                ? candidates.find((c) => c.hostname === row.pi.hostname)
                : candidates[0]) ?? null
              const name = deployed
                ? (deployed.hostname ?? deployed.component.component_name)
                : (row.pi.hostname ?? extractComponentType(row.pi.component_uid))
              const status = deployed ? deployed.status : "TBD"
              const textColor = deployed ? "text-zinc-300" : "text-zinc-500"
              return (
                <div key={row.key} className="flex items-center min-h-[28px] text-sm">
                  <div className="flex flex-col items-center w-0.5 shrink-0 self-stretch">
                    <div className={`flex-1 w-full${row.firstInTrunk ? "" : " bg-zinc-600/60"}`} />
                    <span className="h-[5px] w-[5px] rounded-full bg-zinc-400 shrink-0" />
                    <div className={`flex-1 w-full${row.lastInTrunk ? "" : " bg-zinc-600/60"}`} />
                  </div>
                  {row.parallel ? (
                    <>
                      {row.firstInGroup ? (
                        <span className="w-2.5 border-t-2 border-[#f5c2e7]/70 shrink-0" />
                      ) : (
                        <span className="w-2.5 shrink-0" />
                      )}
                      <div className="flex flex-col items-center w-0.5 shrink-0 self-stretch">
                        <div className={`flex-1 w-full${row.firstInGroup ? "" : " bg-[#f5c2e7]/70"}`} />
                        <span className="h-[5px] w-[5px] rounded-full bg-[#f5c2e7] shrink-0" />
                        <div className={`flex-1 w-full${row.lastInGroup ? "" : " bg-[#f5c2e7]/70"}`} />
                      </div>
                      <span className="w-2.5 border-t-2 border-[#f5c2e7]/70 shrink-0" />
                    </>
                  ) : (
                    <span className="w-3.5 border-t border-zinc-500/70 shrink-0" />
                  )}
                  <span className={`${textColor} ml-1.5 truncate text-left`}>{name}</span>
                  <span className="ml-auto pl-3 shrink-0"><StatusBadge status={status} /></span>
                </div>
              )
            })}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  ) : (
    <StatusBadge status={zpod.status} />
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/zpods")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {zpod.name}
              <span className="text-muted-foreground font-normal ml-2 text-lg">({zpod.domain})</span>
            </h1>
          </div>
          {statusBadgeElement}
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDestroy(true)}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Destroy
        </Button>
      </div>

      {/* Destroy dialog */}
      <Dialog open={showDestroy} onOpenChange={setShowDestroy}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Destroy zPod</DialogTitle>
            <DialogDescription>
              Are you sure you want to destroy{" "}
              <span className="font-semibold">{zpod.name}</span>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDestroy(false)}
              disabled={destroying}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDestroy}
              disabled={destroying}
            >
              {destroying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Destroy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Basic Info + Networks table side by side */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Basic Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <DetailRow label="Name" value={zpod.name} />
            <DetailRow label="Domain" value={zpod.domain} mono />
            <DetailRow
              label="DNS"
              value={
                zpod.networks?.length > 0 ? (
                  <span className="font-mono">
                    {cidrToZboxIp(zpod.networks[0].cidr)}
                    <span className="text-amber-400/80 font-sans ml-1">(zbox)</span>
                  </span>
                ) : "—"
              }
            />
            <DetailRow label="Profile" value={zpod.profile} />
            <DetailRow
              label="Endpoint"
              value={
                endpointFull ? (
                  <div>
                    <div className="font-bold text-foreground">{endpointFull.name}</div>
                    <div className="text-muted-foreground text-xs">{endpointFull.endpoints.compute.hostname} (compute)</div>
                    <div className="text-muted-foreground text-xs">{endpointFull.endpoints.network.hostname} (network)</div>
                  </div>
                ) : (
                  zpod.endpoint?.name ?? "—"
                )
              }
            />
            <DetailRow label="Description" value={zpod.description ?? "—"} />
            <DetailRow label="Owner(s)" value={ownerStr} />
            <Separator className="my-2" />
            <PasswordRow value={zpod.password} />
            <Separator className="my-2" />
            <DetailRow label="Features" value={featureStr} />
            <DetailRow
              label="Created"
              value={formatDateTime(zpod.creation_date)}
            />
            <DetailRow
              label="Last Modified"
              value={
                zpod.last_modified_date
                  ? formatDateTime(zpod.last_modified_date)
                  : "—"
              }
            />
            <DetailRow
              label="Status"
              value={statusBadgeElement}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              Networks
              {zpod.networks?.length > 0 && (
                <Badge variant="outline" className="ml-1">
                  {zpod.networks.length}
                </Badge>
              )}
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
                    const vlan = cidrToVlanId(net.cidr)
                    const isFirst = idx === 0
                    const router = isFirst ? "NSX-T1" : "zbox"
                    return (
                      <TableRow key={net.id}>
                        <TableCell className="font-mono whitespace-nowrap">{net.cidr}</TableCell>
                        <TableCell className="font-mono whitespace-nowrap">
                          {cidrToGateway(net.cidr)}{" "}
                          <span className={isFirst ? "text-purple-400/80" : "text-amber-400/80"}>
                            ({router})
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isFirst ? (
                            <span className="text-muted-foreground">Untagged</span>
                          ) : (
                            <span className="font-mono">{vlan}</span>
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
      </div>

      {/* Network Topology Diagram — full width */}
      {zpod.networks?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              Network Topology
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NetworkTopology
              networks={zpod.networks}
              t0Name={t0Name}
              components={zpod.components ?? []}
              zpodName={zpod.name}
              endpointNetwork={endpointFull?.endpoints.network ?? null}
            />
          </CardContent>
        </Card>
      )}

      {/* Components */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Components
              {(zpod.components?.length ?? 0) > 0 && (
                <Badge variant="outline" className="ml-1">
                  {zpod.components.length}
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowAddComponent(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Component
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(zpod.components?.length ?? 0) > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead className="hidden md:table-cell">Component</TableHead>
                  <TableHead className="hidden md:table-cell">IP</TableHead>
                  <TableHead className="hidden lg:table-cell">Credentials</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...zpod.components].sort((a, b) => {
                  const ipToNum = (ip: string | null) => {
                    if (!ip) return Number.MAX_SAFE_INTEGER
                    const parts = ip.split(".").map(Number)
                    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
                  }
                  return ipToNum(a.ip) - ipToNum(b.ip)
                }).map((comp) => (
                  <TableRow key={`${comp.component.id}-${comp.hostname}`}>
                    <TableCell className="font-mono">
                      {comp.hostname ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div>{comp.component.component_name}</div>
                      <div className="text-muted-foreground text-xs">
                        {comp.component.component_uid}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono">
                      {comp.ip ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {comp.usernames?.length > 0 ? (() => {
                        const sshUsers = comp.usernames.filter((u) => u.type === "ssh")
                        const uiUsers = comp.usernames.filter((u) => u.type !== "ssh")
                        return (
                          <div className="space-y-2.5">
                            {sshUsers.length > 0 && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1">SSH Connection</div>
                                <div className="space-y-1">
                                  {sshUsers.map((u) => {
                                    const sshCmd = `ssh ${u.username}@${comp.fqdn}`
                                    return (
                                      <div key={u.username} className="inline-flex items-center gap-1.5 rounded border border-border/50 bg-background/80 px-2.5 py-1">
                                        <code className="text-xs font-mono text-foreground/90">{sshCmd}</code>
                                        <IconTooltip label="Copy SSH command">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 shrink-0"
                                            onClick={async () => {
                                              const ok = await copyToClipboard(sshCmd)
                                              if (ok) toast.success("Copied to clipboard")
                                              else toast.error("Failed to copy")
                                            }}
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </IconTooltip>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            {uiUsers.length > 0 && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-1">Web Access</div>
                                <div className="space-y-1">
                                  {uiUsers.map((u) => {
                                    const port =
                                      u.type === "ui-proxmox" ? ":8006" :
                                      u.type === "ui-proxmox-dm" ? ":8443" :
                                      u.type === "ui-proxmox-bs" ? ":8007" : ""
                                    const url = comp.fqdn ? `https://${comp.fqdn}${port}` : null
                                    return (
                                      <div key={u.username} className="flex flex-col items-start gap-1">
                                        {url && (
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 rounded border border-border/50 bg-background/80 px-2.5 py-1 text-xs text-primary hover:underline"
                                          >
                                            <code className="font-mono">{url}</code>
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                          </a>
                                        )}
                                        <div className="inline-flex items-center gap-1.5 rounded border border-border/50 bg-background/80 px-2.5 py-1">
                                          <code className="text-xs font-mono text-foreground/90">{u.username}</code>
                                          <IconTooltip label="Copy username">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-5 w-5 shrink-0"
                                              onClick={async () => {
                                                const ok = await copyToClipboard(u.username)
                                                if (ok) toast.success("Copied to clipboard")
                                                else toast.error("Failed to copy")
                                              }}
                                            >
                                              <Copy className="h-3 w-3" />
                                            </Button>
                                          </IconTooltip>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })() : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={comp.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {zpod.password && (
                          <IconTooltip label="Copy password">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={async () => {
                                const ok = await copyToClipboard(zpod.password!)
                                if (ok) toast.success("Password copied")
                                else toast.error("Failed to copy")
                              }}
                            >
                              <KeyRound className="h-3 w-3" />
                            </Button>
                          </IconTooltip>
                        )}
                        {extractComponentType(comp.component.component_uid) !== "zbox" && (
                          <IconTooltip label="Remove component">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteCompTarget(comp)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </IconTooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No components</p>
          )}
        </CardContent>
      </Card>

      {/* DNS Entries — only shown when zbox is ACTIVE (it's the DNS server) */}
      {zboxActive && <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" />
              DNS Entries
              {dnsEntries.length > 0 && (
                <Badge variant="outline" className="ml-1">
                  {dnsEntries.length}
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowAddDns(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add DNS Entry
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dnsEntries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>FQDN</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...dnsEntries]
                  .filter((e) => e.hostname !== "localhost" && !(e.hostname.includes(".") && e.hostname.startsWith("zbox")))
                  .sort((a, b) => {
                    const ipToNum = (ip: string) => {
                      const parts = ip.split(".").map(Number)
                      return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
                    }
                    return ipToNum(a.ip) - ipToNum(b.ip)
                  })
                  .map((entry) => {
                    const isProtected = zboxHostnames.has(entry.hostname)
                    const isFqdn = entry.hostname.includes(".")
                    return (
                      <TableRow key={`${entry.ip}-${entry.hostname}`}>
                        <TableCell className="font-mono">
                          {entry.hostname}
                        </TableCell>
                        <TableCell className="font-mono">
                          {entry.ip}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {isFqdn ? entry.hostname : `${entry.hostname}.${zpod.domain}`}
                        </TableCell>
                        <TableCell>
                          {!isProtected && (
                            <IconTooltip label="Remove DNS entry">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeleteDnsTarget(entry)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </IconTooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No DNS entries</p>
          )}
        </CardContent>
      </Card>}

      {/* Add DNS entry dialog */}
      <Dialog open={showAddDns} onOpenChange={setShowAddDns}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add DNS Entry</DialogTitle>
            <DialogDescription>
              Add a DNS record to this zPod. Both hostname and IP address are required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Hostname *</Label>
              <Input
                className="text-xs"
                value={dnsHostname}
                placeholder="e.g. myhost"
                onChange={(e) => setDnsHostname(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">IP Address *</Label>
              <Input
                className="text-xs font-mono"
                value={dnsIp}
                placeholder="e.g. 10.1.1.42"
                onChange={(e) => setDnsIp(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDns(false)} disabled={addingDns}>
              Cancel
            </Button>
            <Button onClick={handleAddDns} disabled={!dnsHostname.trim() || !dnsIp.trim() || addingDns}>
              {addingDns && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete DNS entry confirmation */}
      <Dialog open={deleteDnsTarget != null} onOpenChange={() => setDeleteDnsTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove DNS Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the DNS entry{" "}
              <span className="font-semibold">{deleteDnsTarget?.hostname}</span>{" "}
              ({deleteDnsTarget?.ip})? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDnsTarget(null)} disabled={deletingDns}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteDns} disabled={deletingDns}>
              {deletingDns && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete component confirmation */}
      <Dialog open={deleteCompTarget != null} onOpenChange={() => setDeleteCompTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Component</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold">
                {deleteCompTarget?.hostname ?? deleteCompTarget?.component.component_uid}
              </span>{" "}
              from this zPod? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteCompTarget(null)}
              disabled={deletingComponent}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteComponent}
              disabled={deletingComponent}
            >
              {deletingComponent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add component dialog */}
      <AddComponentDialog
        open={showAddComponent}
        onOpenChange={setShowAddComponent}
        components={allComponents}
        saving={addingComponent}
        onSave={handleAddComponent}
      />
    </div>
  )
}

