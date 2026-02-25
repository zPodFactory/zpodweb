import { useEffect, useMemo, useState } from "react"
import { IconTooltip } from "@/components/icon-tooltip"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Cpu,
  GripVertical,
  HardDrive,
  Loader2,
  MemoryStick,
  Network,
  Plus,
  Trash2,
  Ungroup,
} from "lucide-react"
import { extractComponentType, getComponentHex, componentStyles } from "@/lib/component-colors"
import type { ComponentFull, Profile, ProfileItemCreate } from "@/types"

/** A step in the editor: either a single item or a parallel group */
interface EditorStep {
  id: string
  items: EditorItem[]
}

interface EditorItem {
  id: string
  component_uid: string
  host_id: number | null
  hostname: string | null
  vcpu: number | null
  vmem: number | null
  vnics: number | null
  vdisks: string // stored as comma-separated for editing
}

let nextId = 1
function uid() {
  return `_editor_${nextId++}`
}

function newItem(component_uid: string): EditorItem {
  return {
    id: uid(),
    component_uid,
    host_id: null,
    hostname: null,
    vcpu: null,
    vmem: null,
    vnics: null,
    vdisks: "",
  }
}

/** Convert Profile data to editor steps */
function profileToSteps(
  profile: (ProfileItemCreate | ProfileItemCreate[])[]
): EditorStep[] {
  return profile.map((entry) => {
    if (Array.isArray(entry)) {
      return {
        id: uid(),
        items: entry.map((item) => ({
          id: uid(),
          component_uid: item.component_uid,
          host_id: item.host_id ?? null,
          hostname: item.hostname ?? null,
          vcpu: item.vcpu ?? null,
          vmem: item.vmem ?? null,
          vnics: item.vnics ?? null,
          vdisks: item.vdisks?.join(", ") ?? "",
        })),
      }
    }
    return {
      id: uid(),
      items: [
        {
          id: uid(),
          component_uid: entry.component_uid,
          host_id: entry.host_id ?? null,
          hostname: entry.hostname ?? null,
          vcpu: entry.vcpu ?? null,
          vmem: entry.vmem ?? null,
          vnics: entry.vnics ?? null,
          vdisks: entry.vdisks?.join(", ") ?? "",
        },
      ],
    }
  })
}

/** Convert editor steps back to profile payload */
function stepsToProfile(
  steps: EditorStep[]
): (ProfileItemCreate | ProfileItemCreate[])[] {
  return steps.map((step) => {
    const items = step.items.map((item) => {
      const out: ProfileItemCreate = { component_uid: item.component_uid }
      if (item.host_id != null) out.host_id = item.host_id
      if (item.hostname) out.hostname = item.hostname
      if (item.vcpu != null) out.vcpu = item.vcpu
      if (item.vmem != null) out.vmem = item.vmem
      if (item.vnics != null) out.vnics = item.vnics
      const disks = item.vdisks
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0)
      if (disks.length > 0) out.vdisks = disks
      return out
    })
    return items.length === 1 ? items[0] : items
  })
}

/** Extract major version from a component_uid.
 *  e.g. "esxi-8.0u3g" → "8", "zbox-12.11" → "12", "proxmox-bs-13" → "13" */
function extractMajorVersion(uid: string): string {
  const type = extractComponentType(uid)
  // Strip the type prefix (and trailing dash) from the uid to get the version part
  const rest = uid.slice(type.length).replace(/^-/, "")
  const major = rest.match(/^(\d+)/)?.[1]
  return major ?? ""
}

interface ComponentOption {
  /** Display label, e.g. "esxi 8.x" */
  label: string
  /** Base type, e.g. "esxi" */
  type: string
  /** All matching component_uids sorted asc */
  uids: string[]
}

/** Get component options grouped by type + major version, sorted asc */
function getComponentOptions(components: ComponentFull[]): ComponentOption[] {
  const active = components.filter((c) => c.status === "ACTIVE")
  // Group by "type|major"
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

export function ProfileEditorDialog({
  open,
  onOpenChange,
  profile,
  components,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile | null // null = create
  components: ComponentFull[]
  saving: boolean
  onSave: (name: string, profile: (ProfileItemCreate | ProfileItemCreate[])[]) => void
}) {
  const [name, setName] = useState("")
  const [steps, setSteps] = useState<EditorStep[]>([])
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  const componentOptions = useMemo(() => getComponentOptions(components), [components])

  // Zbox options for the mandatory first step
  const zboxUids = useMemo(
    () =>
      components
        .filter((c) => c.status === "ACTIVE" && extractComponentType(c.component_uid) === "zbox")
        .map((c) => c.component_uid)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort(),
    [components]
  )

  useEffect(() => {
    if (!open) return
    if (profile) {
      setName(profile.name)
      setSteps(profileToSteps(profile.profile))
    } else {
      setName("")
      // Always start with zbox as first step
      const defaultZbox = zboxUids[0] ?? "zbox"
      setSteps([{ id: uid(), items: [newItem(defaultZbox)] }])
    }
    setExpandedStep(null)
  }, [open, profile, zboxUids])

  const isEditing = profile != null
  const isValid = name.trim().length > 0 && steps.length > 0 && steps[0].items.length === 1 && extractComponentType(steps[0].items[0].component_uid) === "zbox"

  // Step manipulation
  const moveStep = (idx: number, dir: -1 | 1) => {
    if (idx === 0 && dir === -1) return // zbox stays first
    if (idx + dir === 0 && dir === -1) return // can't move before zbox
    const next = [...steps]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    if (target === 0) return // protect zbox position
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setSteps(next)
  }

  const removeStep = (idx: number) => {
    if (idx === 0) return // can't remove zbox
    setSteps((prev) => prev.filter((_, i) => i !== idx))
  }

  const addStep = (component_uid: string) => {
    setSteps((prev) => [...prev, { id: uid(), items: [newItem(component_uid)] }])
  }

  const addItemToStep = (stepIdx: number, component_uid: string) => {
    setSteps((prev) =>
      prev.map((step, i) =>
        i === stepIdx
          ? { ...step, items: [...step.items, newItem(component_uid)] }
          : step
      )
    )
  }

  const removeItem = (stepIdx: number, itemIdx: number) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIdx) return step
        const items = step.items.filter((_, j) => j !== itemIdx)
        return { ...step, items }
      }).filter((step) => step.items.length > 0)
    )
  }

  const updateItem = (stepIdx: number, itemIdx: number, updates: Partial<EditorItem>) => {
    setSteps((prev) =>
      prev.map((step, i) =>
        i === stepIdx
          ? {
              ...step,
              items: step.items.map((item, j) =>
                j === itemIdx ? { ...item, ...updates } : item
              ),
            }
          : step
      )
    )
  }

  const ungroupStep = (stepIdx: number) => {
    setSteps((prev) => {
      const step = prev[stepIdx]
      if (!step || step.items.length <= 1) return prev
      const newSteps = step.items.map((item) => ({
        id: uid(),
        items: [item],
      }))
      return [...prev.slice(0, stepIdx), ...newSteps, ...prev.slice(stepIdx + 1)]
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Profile" : "Create Profile"}</DialogTitle>
          <DialogDescription>
            Steps run in serial (top to bottom). Items within a step run in parallel.
            zBox is always the first step.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Profile name */}
          <div className="space-y-1.5">
            <Label>Profile Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. sddc, proxmox, custom-lab"
            />
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <Label>Deployment Steps</Label>
            {steps.map((step, stepIdx) => {
              const isZbox = stepIdx === 0
              const isParallel = step.items.length > 1
              const isExp = expandedStep === step.id
              return (
                <div
                  key={step.id}
                  className="rounded-lg border border-border/60 bg-card"
                >
                  {/* Step header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                    onClick={() => setExpandedStep(isExp ? null : step.id)}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {stepIdx + 1}
                    </Badge>
                    {isParallel && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        parallel × {step.items.length}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {step.items.map((item) => {
                        const hex = getComponentHex(item.component_uid)
                        return (
                          <span
                            key={item.id}
                            className="text-xs font-mono truncate"
                            style={{ color: hex }}
                          >
                            {item.component_uid}
                            {item.hostname ? ` (${item.hostname})` : ""}
                          </span>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!isZbox && (
                        <>
                          <IconTooltip label="Move up">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); moveStep(stepIdx, -1) }}
                              disabled={stepIdx <= 1}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label="Move down">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); moveStep(stepIdx, 1) }}
                              disabled={stepIdx === steps.length - 1}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label="Remove step">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={(e) => { e.stopPropagation(); removeStep(stepIdx) }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </IconTooltip>
                        </>
                      )}
                      {isExp ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded items */}
                  {isExp && (
                    <div className="border-t border-border/40 px-3 py-3 space-y-3">
                      {step.items.map((item, itemIdx) => {
                        const hex = getComponentHex(item.component_uid)
                        const s = componentStyles(hex)
                        return (
                          <div
                            key={item.id}
                            className="rounded-md border p-3 space-y-2"
                            style={{ ...s.border, ...s.bg }}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="text-xs font-semibold"
                                style={s.text}
                              >
                                {extractComponentType(item.component_uid)}
                              </span>
                              <div className="flex-1" />
                              {!isZbox && step.items.length > 1 && (
                                <IconTooltip label="Remove from step">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive"
                                    onClick={() => removeItem(stepIdx, itemIdx)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </IconTooltip>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              {/* Component UID selector */}
                              <div className="col-span-2">
                                <Label className="text-[10px] text-muted-foreground">Component UID</Label>
                                <Select
                                  value={item.component_uid}
                                  onValueChange={(v) => updateItem(stepIdx, itemIdx, { component_uid: v })}
                                >
                                  <SelectTrigger className="h-7 text-xs font-mono">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(isZbox
                                      ? zboxUids
                                      : componentOptions
                                          .filter((o) => o.type === extractComponentType(item.component_uid))
                                          .flatMap((o) => o.uids)
                                          .filter((v, i, a) => a.indexOf(v) === i)
                                          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                                    ).map((u) => (
                                      <SelectItem key={u} value={u} className="text-xs font-mono">
                                        {u}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Hostname */}
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Hostname</Label>
                                <Input
                                  className="h-7 text-xs"
                                  value={item.hostname ?? ""}
                                  placeholder="auto"
                                  onChange={(e) =>
                                    updateItem(stepIdx, itemIdx, {
                                      hostname: e.target.value || null,
                                    })
                                  }
                                />
                              </div>

                              {/* Host ID */}
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Host ID</Label>
                                <Input
                                  className="h-7 text-xs"
                                  type="number"
                                  value={item.host_id ?? ""}
                                  placeholder="auto"
                                  onChange={(e) =>
                                    updateItem(stepIdx, itemIdx, {
                                      host_id: e.target.value ? parseInt(e.target.value, 10) : null,
                                    })
                                  }
                                />
                              </div>

                              {/* vCPU */}
                              <div>
                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Cpu className="h-2.5 w-2.5" /> vCPU
                                </Label>
                                <Input
                                  className="h-7 text-xs"
                                  type="number"
                                  value={item.vcpu ?? ""}
                                  placeholder="default"
                                  onChange={(e) =>
                                    updateItem(stepIdx, itemIdx, {
                                      vcpu: e.target.value ? parseInt(e.target.value, 10) : null,
                                    })
                                  }
                                />
                              </div>

                              {/* vMem */}
                              <div>
                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <MemoryStick className="h-2.5 w-2.5" /> vMem (GB)
                                </Label>
                                <Input
                                  className="h-7 text-xs"
                                  type="number"
                                  value={item.vmem ?? ""}
                                  placeholder="default"
                                  onChange={(e) =>
                                    updateItem(stepIdx, itemIdx, {
                                      vmem: e.target.value ? parseInt(e.target.value, 10) : null,
                                    })
                                  }
                                />
                              </div>

                              {/* vNICs */}
                              <div>
                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Network className="h-2.5 w-2.5" /> vNICs
                                </Label>
                                <Input
                                  className="h-7 text-xs"
                                  type="number"
                                  value={item.vnics ?? ""}
                                  placeholder="default"
                                  onChange={(e) =>
                                    updateItem(stepIdx, itemIdx, {
                                      vnics: e.target.value ? parseInt(e.target.value, 10) : null,
                                    })
                                  }
                                />
                              </div>

                              {/* vDisks */}
                              <div>
                                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <HardDrive className="h-2.5 w-2.5" /> vDisks (GB, comma-sep)
                                </Label>
                                <Input
                                  className="h-7 text-xs"
                                  value={item.vdisks}
                                  placeholder="e.g. 40, 800"
                                  onChange={(e) =>
                                    updateItem(stepIdx, itemIdx, { vdisks: e.target.value })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Add parallel item to this step / ungroup */}
                      <div className="flex items-center gap-2">
                        {!isZbox && (
                          <>
                            <Select
                              onValueChange={(uid) => addItemToStep(stepIdx, uid)}
                              value=""
                            >
                              <SelectTrigger className="h-7 text-xs w-auto gap-1.5">
                                <Plus className="h-3 w-3" />
                                <span>Add parallel item</span>
                              </SelectTrigger>
                              <SelectContent>
                                {componentOptions
                                  .filter((o) => o.type !== "zbox")
                                  .map((opt) => (
                                    <SelectItem
                                      key={opt.label}
                                      value={opt.uids[opt.uids.length - 1]}
                                      className="text-xs font-mono"
                                    >
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {isParallel && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => ungroupStep(stepIdx)}
                              >
                                <Ungroup className="h-3 w-3" />
                                Ungroup to serial
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add new step */}
          <div className="flex items-center gap-2">
            <Select onValueChange={(uid) => addStep(uid)} value="">
              <SelectTrigger className="h-8 text-xs w-auto gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                <span>Add step</span>
              </SelectTrigger>
              <SelectContent>
                {componentOptions
                  .filter((o) => o.type !== "zbox")
                  .map((opt) => (
                    <SelectItem
                      key={opt.label}
                      value={opt.uids[opt.uids.length - 1]}
                      className="text-xs font-mono"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(name.trim(), stepsToProfile(steps))}
            disabled={!isValid || saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
