import { useCallback, useEffect, useState } from "react"
import axios from "axios"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { useAuthStore } from "@/stores/auth-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { IconTooltip } from "@/components/icon-tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ConfirmationDialog } from "@/components/confirmation-dialog"
import { toast } from "sonner"
import {
  Server,
  Cpu,
  Network,
  Plus,
  KeyRound,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { Link } from "react-router"
import type { EndpointFull, Zpod } from "@/types"
import { DetailRow } from "@/components/detail-row"
import { EndpointCreateDialog } from "@/components/endpoint-create-dialog"

// --- Inventory types (shared with create dialog) ---

interface VsphereInventory {
  datacenters: string[]
  resourcePools: { name: string; type: string }[]
  datastores: { moRef: string; name: string; capacityGB: number; usedGB: number; type: string }[]
  vmFolders: { name: string; children: unknown[] }[]
}

interface NsxInventory {
  transportZones: string[]
  edgeClusters: string[]
  t0Gateways: string[]
}

interface InventoryResult<T> {
  connected: boolean
  version?: string
  error?: string
  inventory?: T
}

// --- Helpers ---

function parseCidrCapacity(networks: string): number | null {
  const m = networks.match(/\/(\d+)$/)
  if (!m) return null
  const prefix = parseInt(m[1], 10)
  if (prefix > 24 || prefix < 1) return null
  return Math.pow(2, 24 - prefix)
}

function NetworksCidrRow({ networks, zpodCount }: { networks: string; zpodCount: number }) {
  const capacity = parseCidrCapacity(networks)

  return (
    <div>
      <div className="flex justify-between py-1">
        <span className="text-sm text-muted-foreground">Networks</span>
        <div className="flex items-center gap-1.5">
          {capacity !== null ? (
            <HoverCard>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="cursor-default text-xs bg-[#94e2d5]/15 text-[#94e2d5] border-[#94e2d5]/30">
                  {networks}
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent className="w-64 bg-[#181825] border-[#313244]" side="top">
                <div className="space-y-2">
                  <p className="text-sm font-medium">zPod Network Capacity</p>
                  <p className="text-xs text-muted-foreground">
                    Each zPod is allocated a /24 subnet, subdivided into 4 x /26 segments to enable more advanced network topologies.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This CIDR block supports up to{" "}
                    <span className="font-medium text-foreground">{capacity}</span> zPods.
                  </p>
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Deployed</span>
                      <span>{zpodCount} / {capacity} zPods</span>
                    </div>
                    <Progress value={Math.round((zpodCount / capacity) * 100)} className="h-1.5" />
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          ) : (
            <span className="text-sm">{networks}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Verify Row: shows a read-only field with a green tick or red X ---

function VerifyRow({ label, value, found }: { label: string; value: string; found: boolean | null }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono">{value}</span>
        {found !== null && (
          found ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          )
        )}
      </div>
    </div>
  )
}

// --- Edit/Verify Dialog ---

function EndpointEditDialog({
  endpoint,
  open,
  onOpenChange,
  onSaveComplete,
}: {
  endpoint: EndpointFull
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveComplete: () => void
}) {
  const { updateEndpointPasswords } = useApi()

  const [computePassword, setComputePassword] = useState("")
  const [networkPassword, setNetworkPassword] = useState("")

  // vSphere verify state
  const [vsphereLoading, setVsphereLoading] = useState(false)
  const [vsphereVersion, setVsphereVersion] = useState("")
  const [vsphereError, setVsphereError] = useState("")
  const [vsphereInventory, setVsphereInventory] = useState<VsphereInventory | null>(null)

  // NSX verify state
  const [nsxLoading, setNsxLoading] = useState(false)
  const [nsxVersion, setNsxVersion] = useState("")
  const [nsxError, setNsxError] = useState("")
  const [nsxInventory, setNsxInventory] = useState<NsxInventory | null>(null)

  const [saving, setSaving] = useState(false)

  // Reset when dialog opens/closes
  useEffect(() => {
    if (open) {
      setComputePassword("")
      setNetworkPassword("")
      setVsphereLoading(false)
      setVsphereVersion("")
      setVsphereError("")
      setVsphereInventory(null)
      setNsxLoading(false)
      setNsxVersion("")
      setNsxError("")
      setNsxInventory(null)
      setSaving(false)
    }
  }, [open])

  // Reset verify state when password changes
  function onComputePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setComputePassword(e.target.value)
    setVsphereInventory(null)
    setVsphereVersion("")
    setVsphereError("")
  }

  function onNetworkPasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNetworkPassword(e.target.value)
    setNsxInventory(null)
    setNsxVersion("")
    setNsxError("")
  }

  async function verifyVsphere() {
    setVsphereLoading(true)
    setVsphereError("")
    setVsphereVersion("")
    setVsphereInventory(null)
    try {
      const res = await axios.post<InventoryResult<VsphereInventory>>("/test/vsphere/inventory", {
        hostname: endpoint.endpoints.compute.hostname,
        username: endpoint.endpoints.compute.username,
        password: computePassword,
      })
      if (res.data.connected && res.data.inventory) {
        setVsphereVersion(res.data.version || "")
        setVsphereInventory(res.data.inventory)
      } else {
        setVsphereError(res.data.error || "Connection failed")
      }
    } catch {
      setVsphereError("Unable to reach test server")
    } finally {
      setVsphereLoading(false)
    }
  }

  async function verifyNsx() {
    setNsxLoading(true)
    setNsxError("")
    setNsxVersion("")
    setNsxInventory(null)
    try {
      const res = await axios.post<InventoryResult<NsxInventory>>("/test/nsx/inventory", {
        hostname: endpoint.endpoints.network.hostname,
        username: endpoint.endpoints.network.username,
        password: networkPassword,
      })
      if (res.data.connected && res.data.inventory) {
        setNsxVersion(res.data.version || "")
        setNsxInventory(res.data.inventory)
      } else {
        setNsxError(res.data.error || "Connection failed")
      }
    } catch {
      setNsxError("Unable to reach test server")
    } finally {
      setNsxLoading(false)
    }
  }

  // Check if endpoint values exist in fetched inventory
  function computeFieldFound(field: string, inventory: VsphereInventory): boolean {
    switch (field) {
      case "datacenter":
        return inventory.datacenters.includes(endpoint.endpoints.compute.datacenter)
      case "resource_pool":
        return inventory.resourcePools.some((r) => r.name === endpoint.endpoints.compute.resource_pool)
      case "storage_datastore":
        return inventory.datastores.some((d) => d.name === endpoint.endpoints.compute.storage_datastore)
      case "vmfolder":
        return findInFolderTree(inventory.vmFolders, endpoint.endpoints.compute.vmfolder)
      default:
        return false
    }
  }

  function findInFolderTree(folders: { name: string; children: unknown[] }[], target: string): boolean {
    for (const f of folders) {
      if (f.name === target) return true
      if (f.children && findInFolderTree(f.children as { name: string; children: unknown[] }[], target)) return true
    }
    return false
  }

  function networkFieldFound(field: string, inventory: NsxInventory): boolean {
    switch (field) {
      case "transportzone":
        return inventory.transportZones.includes(endpoint.endpoints.network.transportzone)
      case "edgecluster":
        return inventory.edgeClusters.includes(endpoint.endpoints.network.edgecluster)
      case "t0":
        return inventory.t0Gateways.includes(endpoint.endpoints.network.t0)
      default:
        return false
    }
  }

  const vsphereVerified = !!vsphereInventory
  const nsxVerified = !!nsxInventory

  const canSave = !!(
    computePassword &&
    networkPassword &&
    vsphereVerified &&
    nsxVerified &&
    !saving
  )

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      await updateEndpointPasswords(endpoint.id, {
        endpoints: {
          compute: { password: computePassword },
          network: { password: networkPassword },
        },
      })
      toast.success(`Passwords updated for "${endpoint.name}"`)
      onOpenChange(false)
      onSaveComplete()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update passwords"
      toast.error("Failed to update passwords", { description: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Verify & Update Passwords — {endpoint.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Enter new passwords and verify connectivity. All other fields are read-only.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Compute (vSphere) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Compute (vSphere)</span>
              {vsphereVersion && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto bg-[#89b4fa]/15 text-[#89b4fa] border-[#89b4fa]/30">{vsphereVersion}</Badge>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Hostname</Label>
              <Input value={endpoint.endpoints.compute.hostname} readOnly className="h-8 text-sm bg-muted/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Username</Label>
              <Input value={endpoint.endpoints.compute.username} readOnly className="h-8 text-sm bg-muted/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password *</Label>
              <Input
                type="password"
                value={computePassword}
                onChange={onComputePasswordChange}
                placeholder="Enter new password"
                className="h-8 text-sm"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              disabled={!computePassword || vsphereLoading}
              onClick={verifyVsphere}
            >
              {vsphereLoading ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3 w-3" />
              )}
              {vsphereInventory ? "Re-verify" : "Verify"}
            </Button>

            {vsphereError && (
              <div className="flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <span className="text-xs text-red-500">{vsphereError}</span>
              </div>
            )}

            {vsphereInventory && (
              <div className="space-y-0.5 rounded-md border p-2">
                <VerifyRow label="Datacenter" value={endpoint.endpoints.compute.datacenter} found={computeFieldFound("datacenter", vsphereInventory)} />
                <VerifyRow label="Resource Pool" value={endpoint.endpoints.compute.resource_pool} found={computeFieldFound("resource_pool", vsphereInventory)} />
                <VerifyRow label="Datastore" value={endpoint.endpoints.compute.storage_datastore} found={computeFieldFound("storage_datastore", vsphereInventory)} />
                <VerifyRow label="VM Folder" value={endpoint.endpoints.compute.vmfolder} found={computeFieldFound("vmfolder", vsphereInventory)} />
              </div>
            )}
          </div>

          {/* Network (NSX-T) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Network className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Network (NSX-T)</span>
              {nsxVersion && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto bg-[#89b4fa]/15 text-[#89b4fa] border-[#89b4fa]/30">{nsxVersion}</Badge>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Hostname</Label>
              <Input value={endpoint.endpoints.network.hostname} readOnly className="h-8 text-sm bg-muted/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Username</Label>
              <Input value={endpoint.endpoints.network.username} readOnly className="h-8 text-sm bg-muted/50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password *</Label>
              <Input
                type="password"
                value={networkPassword}
                onChange={onNetworkPasswordChange}
                placeholder="Enter new password"
                className="h-8 text-sm"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              disabled={!networkPassword || nsxLoading}
              onClick={verifyNsx}
            >
              {nsxLoading ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3 w-3" />
              )}
              {nsxInventory ? "Re-verify" : "Verify"}
            </Button>

            {nsxError && (
              <div className="flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <span className="text-xs text-red-500">{nsxError}</span>
              </div>
            )}

            {nsxInventory && (
              <div className="space-y-0.5 rounded-md border p-2">
                <VerifyRow label="Transport Zone" value={endpoint.endpoints.network.transportzone} found={networkFieldFound("transportzone", nsxInventory)} />
                <VerifyRow label="Edge Cluster" value={endpoint.endpoints.network.edgecluster} found={networkFieldFound("edgecluster", nsxInventory)} />
                <VerifyRow label="T0 Gateway" value={endpoint.endpoints.network.t0} found={networkFieldFound("t0", nsxInventory)} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save Passwords
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Main Page ---

export function EndpointsPage() {
  const { fetchEndpoints, fetchZpods, deleteEndpoint } = useApi()
  const isSuperadmin = useAuthStore((s) => s.user?.superadmin ?? false)
  const [endpoints, setEndpoints] = useState<EndpointFull[]>([])
  const [zpods, setZpods] = useState<Zpod[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Edit dialog
  const [editTarget, setEditTarget] = useState<EndpointFull | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<EndpointFull | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { sorted } = useSort(endpoints, "name")

  const loadData = useCallback(() => {
    fetchEndpoints().then(setEndpoints).catch(() => {})
    fetchZpods().then(setZpods).catch(() => {})
  }, [fetchEndpoints, fetchZpods])

  useEffect(() => {
    Promise.all([
      fetchEndpoints().then(setEndpoints),
      fetchZpods().then(setZpods),
    ])
      .catch(() => toast.error("Failed to fetch endpoints"))
      .finally(() => setLoading(false))
  }, [fetchEndpoints, fetchZpods])

  usePolling(loadData)

  function zpodsForEndpoint(epId: number): Zpod[] {
    return zpods.filter((z) => z.endpoint?.id === epId)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteEndpoint(deleteTarget.id)
      toast.success(`Endpoint "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete endpoint"
      toast.error("Failed to delete endpoint", { description: msg })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Endpoints</h1>
        <Badge variant="outline">{endpoints.length} total</Badge>
        {isSuperadmin && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Endpoint
          </Button>
        )}
      </div>

      {endpoints.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">
              No endpoints found
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((ep) => {
            const epZpods = zpodsForEndpoint(ep.id)
            const hasZpods = epZpods.length > 0

            return (
            <Card key={ep.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Server className="h-4 w-4" />
                    {ep.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {isSuperadmin && (
                      <div className="flex items-center gap-1">
                        <IconTooltip label="Verify & update passwords">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditTarget(ep)}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                        </IconTooltip>

                        {hasZpods ? (
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-auto min-w-[200px] px-4 py-3 bg-[#181825] border-[#313244]" side="left">
                              <p className="text-sm font-bold text-zinc-100">
                                Cannot delete endpoint
                              </p>
                              <p className="text-xs text-zinc-400 mt-1">
                                {epZpods.length} zPod{epZpods.length > 1 ? "s" : ""} deployed
                              </p>
                              <p className="text-xs font-medium text-zinc-400 mt-3 mb-1">zPods:</p>
                              <div className="ml-2">
                                {epZpods.map((z, i) => (
                                  <div
                                    key={z.id}
                                    className="flex items-center min-h-[28px] text-sm"
                                  >
                                    <div className="flex flex-col items-center w-0.5 shrink-0 self-stretch">
                                      <div className={`flex-1 w-full${i === 0 ? "" : " bg-zinc-600/60"}`} />
                                      <span className="h-[5px] w-[5px] rounded-full bg-zinc-400 shrink-0" />
                                      <div className={`flex-1 w-full${i === epZpods.length - 1 ? "" : " bg-zinc-600/60"}`} />
                                    </div>
                                    <span className="w-3.5 border-t border-zinc-500/70 shrink-0" />
                                    <Link
                                      to={`/zpods/${z.id}`}
                                      className="flex items-center gap-1.5 ml-1.5 text-zinc-300 hover:text-[#94e2d5] transition-colors"
                                    >
                                      <Server className="h-3 w-3 text-[#94e2d5]" />
                                      {z.name}
                                    </Link>
                                  </div>
                                ))}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        ) : (
                          <IconTooltip label="Delete endpoint">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(ep)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                        )}
                      </div>
                    )}
                    {ep.status === "ACTIVE" ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        {ep.status}
                      </Badge>
                    )}
                  </div>
                </div>
                {ep.description && (
                  <p className="text-sm text-muted-foreground">
                    {ep.description}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">Compute</span>
                      <Badge variant="outline" className="text-xs bg-[#89b4fa]/15 text-[#89b4fa] border-[#89b4fa]/30">
                        {ep.endpoints.compute.driver}
                      </Badge>
                    </div>
                    <div className="ml-5 space-y-0">
                      <DetailRow label="Host" value={ep.endpoints.compute.hostname} />
                      <DetailRow label="Datacenter" value={ep.endpoints.compute.datacenter} />
                      <DetailRow label="Resource Pool" value={ep.endpoints.compute.resource_pool} />
                      <DetailRow label="Datastore" value={ep.endpoints.compute.storage_datastore} />
                      <DetailRow label="VM Folder" value={ep.endpoints.compute.vmfolder} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Network className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">Network</span>
                      <Badge variant="outline" className="text-xs bg-[#89b4fa]/15 text-[#89b4fa] border-[#89b4fa]/30">
                        {ep.endpoints.network.driver}
                      </Badge>
                    </div>
                    <div className="ml-5 space-y-0">
                      <DetailRow label="Host" value={ep.endpoints.network.hostname} />
                      <NetworksCidrRow
                        networks={ep.endpoints.network.networks}
                        zpodCount={epZpods.length}
                      />
                      <DetailRow label="Transport Zone" value={ep.endpoints.network.transportzone} />
                      <DetailRow label="Edge Cluster" value={ep.endpoints.network.edgecluster} />
                      <DetailRow label="T0" value={ep.endpoints.network.t0} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}
    </div>

    <EndpointCreateDialog
      open={createDialogOpen}
      onOpenChange={setCreateDialogOpen}
      onCreateComplete={loadData}
    />

    {/* Edit/Verify Dialog */}
    {editTarget && (
      <EndpointEditDialog
        endpoint={editTarget}
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null) }}
        onSaveComplete={loadData}
      />
    )}

    {/* Delete Confirmation */}
    <ConfirmationDialog
      open={!!deleteTarget}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      title="Delete Endpoint"
      description={
        <>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
        </>
      }
      onConfirm={handleDelete}
      loading={deleting}
      confirmText="Delete"
      destructive
      icon={<Trash2 className="h-4 w-4" />}
    />
    </>
  )
}
