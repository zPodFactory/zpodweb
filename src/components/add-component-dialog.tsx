import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Cpu, HardDrive, Loader2, MemoryStick, Network } from "lucide-react"
import { extractComponentType, getComponentHex, componentStyles } from "@/lib/component-colors"
import type { ComponentFull, ProfileItemCreate } from "@/types"

/** Extract major version from a component_uid */
function extractMajorVersion(uid: string): string {
  const type = extractComponentType(uid)
  const rest = uid.slice(type.length).replace(/^-/, "")
  return rest.match(/^(\d+)/)?.[1] ?? ""
}

interface ComponentGroup {
  label: string
  type: string
  uids: string[]
}

function getComponentGroups(components: ComponentFull[]): ComponentGroup[] {
  const active = components.filter((c) => c.status === "ACTIVE")
  const map = new Map<string, { type: string; major: string; uids: Set<string> }>()
  for (const c of active) {
    const type = extractComponentType(c.component_uid)
    const major = extractMajorVersion(c.component_uid)
    const key = major ? `${type}|${major}` : type
    if (!map.has(key)) map.set(key, { type, major, uids: new Set() })
    map.get(key)!.uids.add(c.component_uid)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([, { type, major, uids }]) => ({
      label: major ? `${type} ${major}.x` : type,
      type,
      uids: [...uids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }))
}

export function AddComponentDialog({
  open,
  onOpenChange,
  components,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  components: ComponentFull[]
  saving: boolean
  onSave: (payload: ProfileItemCreate) => void
}) {
  const [componentUid, setComponentUid] = useState("")
  const [hostname, setHostname] = useState("")
  const [hostId, setHostId] = useState("")
  const [vcpu, setVcpu] = useState("")
  const [vmem, setVmem] = useState("")
  const [vnics, setVnics] = useState("")
  const [vdisks, setVdisks] = useState("")

  const groups = useMemo(() => getComponentGroups(components), [components])

  useEffect(() => {
    if (!open) return
    setComponentUid("")
    setHostname("")
    setHostId("")
    setVcpu("")
    setVmem("")
    setVnics("")
    setVdisks("")
  }, [open])

  const selectedType = componentUid ? extractComponentType(componentUid) : ""
  const hex = componentUid ? getComponentHex(componentUid) : ""
  const s = hex ? componentStyles(hex) : null

  // All UIDs of the same base type for the version picker
  const versionUids = useMemo(() => {
    if (!selectedType) return []
    return groups
      .filter((g) => g.type === selectedType)
      .flatMap((g) => g.uids)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [groups, selectedType])

  const handleSave = () => {
    const payload: ProfileItemCreate = { component_uid: componentUid }
    if (hostname) payload.hostname = hostname
    if (hostId) payload.host_id = parseInt(hostId, 10)
    if (vcpu) payload.vcpu = parseInt(vcpu, 10)
    if (vmem) payload.vmem = parseInt(vmem, 10)
    if (vnics) payload.vnics = parseInt(vnics, 10)
    const disks = vdisks
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
    if (disks.length > 0) payload.vdisks = disks
    onSave(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Component</DialogTitle>
          <DialogDescription>
            Add a component to this zPod. Select a component and optionally configure sizing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Component selector (grouped) */}
          <div className="space-y-1.5">
            <Label>Component</Label>
            <Select
              value={componentUid}
              onValueChange={(v) => setComponentUid(v)}
            >
              <SelectTrigger className="text-xs font-mono">
                <SelectValue placeholder="Select a component..." />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </SelectLabel>
                    {group.uids.map((uid) => (
                      <SelectItem key={uid} value={uid} className="text-xs font-mono">
                        {uid}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Version picker (once a component is selected) */}
          {componentUid && versionUids.length > 1 && (
            <div
              className="rounded-md border p-3 space-y-3"
              style={{ ...(s?.border ?? {}), ...(s?.bg ?? {}) }}
            >
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Version</Label>
                <Select
                  value={componentUid}
                  onValueChange={(v) => setComponentUid(v)}
                >
                  <SelectTrigger className="h-7 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versionUids.map((u) => (
                      <SelectItem key={u} value={u} className="text-xs font-mono">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Parameters */}
          {componentUid && (
            <div
              className="rounded-md border p-3 space-y-3"
              style={{ ...(s?.border ?? {}), ...(s?.bg ?? {}) }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Hostname</Label>
                  <Input
                    className="h-7 text-xs"
                    value={hostname}
                    placeholder="auto"
                    onChange={(e) => setHostname(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Host ID</Label>
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    value={hostId}
                    placeholder="auto"
                    onChange={(e) => setHostId(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Cpu className="h-2.5 w-2.5" /> vCPU
                  </Label>
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    value={vcpu}
                    placeholder="default"
                    onChange={(e) => setVcpu(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MemoryStick className="h-2.5 w-2.5" /> vMem (GB)
                  </Label>
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    value={vmem}
                    placeholder="default"
                    onChange={(e) => setVmem(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Network className="h-2.5 w-2.5" /> vNICs
                  </Label>
                  <Input
                    className="h-7 text-xs"
                    type="number"
                    value={vnics}
                    placeholder="default"
                    onChange={(e) => setVnics(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <HardDrive className="h-2.5 w-2.5" /> vDisks (GB, comma-sep)
                  </Label>
                  <Input
                    className="h-7 text-xs"
                    value={vdisks}
                    placeholder="e.g. 40, 800"
                    onChange={(e) => setVdisks(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!componentUid || saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Component
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
