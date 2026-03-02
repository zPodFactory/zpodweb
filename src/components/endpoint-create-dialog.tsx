import { useState } from "react"
import axios from "axios"
import { useApi } from "@/hooks/use-api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Loader2,
  Cpu,
  Network,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  FolderIcon,
} from "lucide-react"
import type {
  EndpointCreate,
  VsphereInventory,
  NsxInventory,
  InventoryResult,
  VmFolderTreeItem,
} from "@/types"

interface EndpointCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateComplete: () => void
}

export function EndpointCreateDialog({
  open,
  onOpenChange,
  onCreateComplete,
}: EndpointCreateDialogProps) {
  const { createEndpoint } = useApi()

  // Top-level fields
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Compute credentials
  const [computeHostname, setComputeHostname] = useState("")
  const [computeUsername, setComputeUsername] = useState("")
  const [computePassword, setComputePassword] = useState("")

  // Compute selections
  const [datacenter, setDatacenter] = useState("")
  const [resourcePool, setResourcePool] = useState("")
  const [storageDatastore, setStorageDatastore] = useState("")
  const [vmfolder, setVmfolder] = useState("")

  // Compute inventory state
  const [vsphereLoading, setVsphereLoading] = useState(false)
  const [vsphereVersion, setVsphereVersion] = useState("")
  const [vsphereError, setVsphereError] = useState("")
  const [vsphereInventory, setVsphereInventory] = useState<VsphereInventory | null>(null)

  // Network credentials
  const [networkHostname, setNetworkHostname] = useState("")
  const [networkUsername, setNetworkUsername] = useState("")
  const [networkPassword, setNetworkPassword] = useState("")

  // Network selections
  const [networks, setNetworks] = useState("")
  const [transportzone, setTransportzone] = useState("")
  const [edgecluster, setEdgecluster] = useState("")
  const [t0, setT0] = useState("")

  // Network inventory state
  const [nsxLoading, setNsxLoading] = useState(false)
  const [nsxVersion, setNsxVersion] = useState("")
  const [nsxError, setNsxError] = useState("")
  const [nsxInventory, setNsxInventory] = useState<NsxInventory | null>(null)

  const [creating, setCreating] = useState(false)
  const [folderTreeOpen, setFolderTreeOpen] = useState(false)

  // Reset inventory when credentials change
  function resetVsphereInventory() {
    setVsphereInventory(null)
    setVsphereVersion("")
    setVsphereError("")
    setDatacenter("")
    setResourcePool("")
    setStorageDatastore("")
    setVmfolder("")
    setFolderTreeOpen(false)
  }

  function resetNsxInventory() {
    setNsxInventory(null)
    setNsxVersion("")
    setNsxError("")
    setTransportzone("")
    setEdgecluster("")
    setT0("")
  }

  function computeCredChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value)
      resetVsphereInventory()
    }
  }

  function networkCredChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value)
      resetNsxInventory()
    }
  }

  // Live CIDR validation
  const cidrParsed = (() => {
    if (!networks) return null
    const m = networks.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
    if (!m) return { valid: false as const, tooSmall: false, hostBits: false }
    const prefix = parseInt(m[5], 10)
    if (prefix > 21 || prefix < 1) return { valid: false as const, tooSmall: prefix > 21, hostBits: false }
    const octets = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4])]
    if (octets.some((o) => o > 255)) return { valid: false as const, tooSmall: false, hostBits: false }
    const ip = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
    if ((ip & mask) !== ip) return { valid: false as const, tooSmall: false, hostBits: true }
    return { valid: true as const, prefix, zpodCapacity: Math.pow(2, 24 - prefix) }
  })()

  const cidrValid = cidrParsed?.valid === true
  const computeCredsFilled = !!(computeHostname && computeUsername && computePassword)
  const networkCredsFilled = !!(networkHostname && networkUsername && networkPassword)
  const computeSelectionsDone = !!(datacenter && resourcePool && storageDatastore && vmfolder)
  const networkSelectionsDone = !!(transportzone && edgecluster && t0)

  const canCreate = !!(
    name.trim() &&
    vsphereInventory && nsxInventory &&
    computeSelectionsDone && networkSelectionsDone &&
    cidrValid && !creating
  )

  async function fetchVsphereInventory() {
    setVsphereLoading(true)
    setVsphereError("")
    setVsphereVersion("")
    setVsphereInventory(null)
    setDatacenter("")
    setResourcePool("")
    setStorageDatastore("")
    setVmfolder("")

    try {
      const res = await axios.post<InventoryResult<VsphereInventory>>("/test/vsphere/inventory", {
        hostname: computeHostname,
        username: computeUsername,
        password: computePassword,
      })
      if (res.data.connected && res.data.inventory) {
        setVsphereVersion(res.data.version || "")
        setVsphereInventory(res.data.inventory)
        // Auto-select if single option
        const inv = res.data.inventory
        if (inv.datacenters.length === 1) setDatacenter(inv.datacenters[0])
        if (inv.resourcePools.length === 1) setResourcePool(inv.resourcePools[0].name)
        if (inv.datastores.length === 1) setStorageDatastore(inv.datastores[0].name)
        if (inv.vmFolders.length === 1 && inv.vmFolders[0].children.length === 0) setVmfolder(inv.vmFolders[0].name)
      } else {
        setVsphereError(res.data.error || "Connection failed")
      }
    } catch {
      setVsphereError("Unable to reach test server")
    } finally {
      setVsphereLoading(false)
    }
  }

  async function fetchNsxInventory() {
    setNsxLoading(true)
    setNsxError("")
    setNsxVersion("")
    setNsxInventory(null)
    setTransportzone("")
    setEdgecluster("")
    setT0("")

    try {
      const res = await axios.post<InventoryResult<NsxInventory>>("/test/nsx/inventory", {
        hostname: networkHostname,
        username: networkUsername,
        password: networkPassword,
      })
      if (res.data.connected && res.data.inventory) {
        setNsxVersion(res.data.version || "")
        setNsxInventory(res.data.inventory)
        // Auto-select if single option
        const inv = res.data.inventory
        if (inv.transportZones.length === 1) setTransportzone(inv.transportZones[0])
        if (inv.edgeClusters.length === 1) setEdgecluster(inv.edgeClusters[0])
        if (inv.t0Gateways.length === 1) setT0(inv.t0Gateways[0])
      } else {
        setNsxError(res.data.error || "Connection failed")
      }
    } catch {
      setNsxError("Unable to reach test server")
    } finally {
      setNsxLoading(false)
    }
  }

  async function handleCreate() {
    if (!canCreate) return
    setCreating(true)

    const payload: EndpointCreate = {
      name: name.trim(),
      description: description.trim(),
      endpoints: {
        compute: {
          driver: "vsphere",
          hostname: computeHostname,
          username: computeUsername,
          password: computePassword,
          datacenter,
          resource_pool: resourcePool,
          storage_datastore: storageDatastore,
          storage_policy: "",
          contentlibrary: "",
          vmfolder,
        },
        network: {
          // driver options: "nsxt" | "nsxt_projects" (nsxt_projects hidden — lacks testing)
          driver: "nsxt",
          hostname: networkHostname,
          username: networkUsername,
          password: networkPassword,
          networks,
          transportzone,
          edgecluster,
          t0,
        },
      },
    }

    try {
      await createEndpoint(payload)
      toast.success(`Endpoint "${name}" created`)
      onOpenChange(false)
      onCreateComplete()
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { detail?: string } }
      }
      if (axiosErr.response?.status === 409) {
        toast.error("Name conflict", {
          description:
            axiosErr.response.data?.detail ??
            "An endpoint with this name already exists",
        })
      } else {
        const msg =
          err instanceof Error ? err.message : "Failed to create endpoint"
        toast.error("Failed to create endpoint", { description: msg })
      }
    } finally {
      setCreating(false)
    }
  }

  function FolderTreeNode({ item, selected, onSelect, depth = 0 }: {
    item: VmFolderTreeItem
    selected: string
    onSelect: (name: string) => void
    depth?: number
  }) {
    const isSelected = selected === item.name
    const hasChildren = item.children.length > 0

    if (hasChildren) {
      return (
        <Collapsible key={item.name} defaultOpen={depth === 0}>
          <div className="flex items-center" style={{ paddingLeft: depth * 16 }}>
            <CollapsibleTrigger asChild>
              <button className="group flex h-7 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-accent">
                <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              </button>
            </CollapsibleTrigger>
            <button
              className={`flex flex-1 items-center gap-1.5 rounded-sm px-1.5 h-7 text-sm hover:bg-accent ${isSelected ? "bg-accent font-medium" : ""}`}
              onClick={() => onSelect(item.name)}
            >
              <FolderIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-blue-400" : "text-muted-foreground"}`} />
              <span className="truncate">{item.name}</span>
              {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 ml-auto" />}
            </button>
          </div>
          <CollapsibleContent>
            {item.children.map((child) => (
              <FolderTreeNode key={child.name} item={child} selected={selected} onSelect={onSelect} depth={depth + 1} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )
    }

    return (
      <div className="flex items-center" style={{ paddingLeft: depth * 16 }}>
        <div className="w-5 shrink-0" />
        <button
          className={`flex flex-1 items-center gap-1.5 rounded-sm px-1.5 h-7 text-sm hover:bg-accent ${isSelected ? "bg-accent font-medium" : ""}`}
          onClick={() => onSelect(item.name)}
        >
          <FolderIcon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-blue-400" : "text-muted-foreground"}`} />
          <span className="truncate">{item.name}</span>
          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 ml-auto" />}
        </button>
      </div>
    )
  }

  // Datastore capacity for selected datastore
  const selectedDs = vsphereInventory?.datastores.find((d) => d.name === storageDatastore)
  const dsPercent = selectedDs
    ? Math.round((selectedDs.usedGB / selectedDs.capacityGB) * 100)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base">Add Endpoint</DialogTitle>
          <DialogDescription className="text-xs">
            Configure compute and network endpoint for deployments
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {/* Name & Description */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ep-name" className="text-xs">Name *</Label>
              <Input
                id="ep-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="production-01"
                autoFocus
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ep-desc" className="text-xs">Description</Label>
              <Input
                id="ep-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Production vSphere + NSX endpoint"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* Two-column: Compute | Network */}
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
                <Label htmlFor="c-host" className="text-xs">Hostname *</Label>
                <Input
                  id="c-host"
                  value={computeHostname}
                  onChange={computeCredChange(setComputeHostname)}
                  placeholder="vcsa.example.com"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid gap-2 grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="c-user" className="text-xs">Username *</Label>
                  <Input
                    id="c-user"
                    value={computeUsername}
                    onChange={computeCredChange(setComputeUsername)}
                    placeholder="admin@vsphere.local"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="c-pass" className="text-xs">Password *</Label>
                  <Input
                    id="c-pass"
                    type="password"
                    value={computePassword}
                    onChange={computeCredChange(setComputePassword)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Fetch button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                disabled={!computeCredsFilled || vsphereLoading}
                onClick={fetchVsphereInventory}
              >
                {vsphereLoading ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                )}
                {vsphereInventory ? "Refresh Inventory" : "Fetch Inventory"}
              </Button>

              {vsphereError && (
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-xs text-red-500">{vsphereError}</span>
                </div>
              )}

              {/* Inventory selects */}
              {vsphereInventory && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Datacenter *</Label>
                    <Select value={datacenter} onValueChange={setDatacenter}>
                      <div className="flex items-center gap-1.5">
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select datacenter" />
                      </SelectTrigger>
                      {datacenter && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      </div>
                      <SelectContent>
                        {vsphereInventory.datacenters.map((dc) => (
                          <SelectItem key={dc} value={dc} className="text-sm">{dc}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Cluster / Resource Pool *</Label>
                    <Select value={resourcePool} onValueChange={setResourcePool}>
                      <div className="flex items-center gap-1.5">
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select cluster or resource pool" />
                      </SelectTrigger>
                      {resourcePool && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      </div>
                      <SelectContent>
                        {vsphereInventory.resourcePools.filter(r => r.type === "cluster").length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-xs text-muted-foreground">Clusters</SelectLabel>
                            {vsphereInventory.resourcePools.filter(r => r.type === "cluster").map(r => (
                              <SelectItem key={r.name} value={r.name} className="text-sm">{r.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {vsphereInventory.resourcePools.filter(r => r.type === "resource_pool").length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-xs text-muted-foreground">Resource Pools</SelectLabel>
                            {vsphereInventory.resourcePools.filter(r => r.type === "resource_pool").map(r => (
                              <SelectItem key={r.name} value={r.name} className="text-sm">{r.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Datastore *</Label>
                    <Select value={storageDatastore} onValueChange={setStorageDatastore}>
                      <div className="flex items-center gap-1.5">
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select datastore" />
                      </SelectTrigger>
                      {storageDatastore && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      </div>
                      <SelectContent>
                        {Object.entries(
                          Object.groupBy(vsphereInventory.datastores, (ds) => ds.type)
                        ).sort(([a], [b]) => a.localeCompare(b)).map(([type, items]) => (
                          <SelectGroup key={type}>
                            <SelectLabel className="text-xs text-muted-foreground">{type}</SelectLabel>
                            {items!.map((ds) => (
                              <SelectItem key={ds.name} value={ds.name} className="text-sm">
                                {ds.name}
                                <span className="text-muted-foreground ml-2 text-xs">
                                  ({(ds.usedGB / 1024).toFixed(1)} / {(ds.capacityGB / 1024).toFixed(1)} TB)
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedDs && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <Progress value={dsPercent} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {(selectedDs.usedGB / 1024).toFixed(1)} / {(selectedDs.capacityGB / 1024).toFixed(1)} TB
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">VM Folder *</Label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFolderTreeOpen(!folderTreeOpen)}
                        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <span className={vmfolder ? "" : "text-muted-foreground"}>
                          {vmfolder || "Select VM folder"}
                        </span>
                        <ChevronRight className={`h-4 w-4 opacity-50 transition-transform ${folderTreeOpen ? "rotate-90" : ""}`} />
                      </button>
                      {vmfolder && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                    </div>
                    {folderTreeOpen && (
                      <div className="border rounded-md py-1 max-h-40 overflow-y-auto scrollbar-themed">
                        {vsphereInventory.vmFolders.map((item) => (
                          <FolderTreeNode
                            key={item.name}
                            item={item}
                            selected={vmfolder}
                            onSelect={(name) => {
                              setVmfolder(name)
                              setFolderTreeOpen(false)
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
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
                <Label htmlFor="n-host" className="text-xs">Hostname *</Label>
                <Input
                  id="n-host"
                  value={networkHostname}
                  onChange={networkCredChange(setNetworkHostname)}
                  placeholder="nsx.example.com"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid gap-2 grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="n-user" className="text-xs">Username *</Label>
                  <Input
                    id="n-user"
                    value={networkUsername}
                    onChange={networkCredChange(setNetworkUsername)}
                    placeholder="admin"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="n-pass" className="text-xs">Password *</Label>
                  <Input
                    id="n-pass"
                    type="password"
                    value={networkPassword}
                    onChange={networkCredChange(setNetworkPassword)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Fetch button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                disabled={!networkCredsFilled || nsxLoading}
                onClick={fetchNsxInventory}
              >
                {nsxLoading ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                )}
                {nsxInventory ? "Refresh Inventory" : "Fetch Inventory"}
              </Button>

              {nsxError && (
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-xs text-red-500">{nsxError}</span>
                </div>
              )}

              {/* Networks CIDR (always a text input, validated live) */}
              <div className="space-y-1">
                <Label htmlFor="n-net" className="text-xs">Networks *</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="n-net"
                    value={networks}
                    onChange={(e) => setNetworks(e.target.value)}
                    placeholder="10.60.0.0/16"
                    className="h-8 text-sm"
                  />
                  {networks && cidrParsed && (
                    cidrParsed.valid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    )
                  )}
                </div>
                {networks && cidrParsed && cidrParsed.valid && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    /{cidrParsed.prefix} → {cidrParsed.zpodCapacity} zPods available
                  </p>
                )}
                {networks && cidrParsed && !cidrParsed.valid && (
                  <p className="text-[10px] text-red-400 mt-0.5">
                    {cidrParsed.tooSmall
                      ? "Prefix must be /21 or larger (e.g. /20, /16)"
                      : cidrParsed.hostBits
                        ? "Host bits set — use the network address (e.g. 10.60.0.0/20, not 10.60.1.0/20)"
                        : "Invalid CIDR format (e.g. 10.60.0.0/16)"}
                  </p>
                )}
              </div>

              {/* Inventory selects */}
              {nsxInventory && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Transport Zone *</Label>
                    <Select value={transportzone} onValueChange={setTransportzone}>
                      <div className="flex items-center gap-1.5">
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select transport zone" />
                      </SelectTrigger>
                      {transportzone && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      </div>
                      <SelectContent>
                        {nsxInventory.transportZones.map((tz) => (
                          <SelectItem key={tz} value={tz} className="text-sm">{tz}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Edge Cluster *</Label>
                    <Select value={edgecluster} onValueChange={setEdgecluster}>
                      <div className="flex items-center gap-1.5">
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select edge cluster" />
                      </SelectTrigger>
                      {edgecluster && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      </div>
                      <SelectContent>
                        {nsxInventory.edgeClusters.map((ec) => (
                          <SelectItem key={ec} value={ec} className="text-sm">{ec}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">T0 Gateway *</Label>
                    <Select value={t0} onValueChange={setT0}>
                      <div className="flex items-center gap-1.5">
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select T0 gateway" />
                      </SelectTrigger>
                      {t0 && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      </div>
                      <SelectContent>
                        {nsxInventory.t0Gateways.map((gw) => (
                          <SelectItem key={gw} value={gw} className="text-sm">{gw}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canCreate}>
            {creating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add Endpoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
