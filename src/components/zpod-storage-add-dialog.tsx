import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DiskRunPanel, StorageStepsPanel } from "@/components/zpod-storage-run"
import { useApi } from "@/hooks/use-api"
import { useDiskRun } from "@/hooks/use-disk-run"
import { apiErrorMessage } from "@/lib/network-utils"
import { DISK_MAX_GB, blankDisks, formatGiB, nextStorageName, validateStorageName } from "@/lib/storage-utils"
import { cn } from "@/lib/utils"
import type { ZpodDiskRunView, ZpodDiskView, ZpodStorageOperation, ZpodStorageView } from "@/types"

interface ZpodStorageAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  zpodId: number
  zpodName: string
  storages: ZpodStorageView[]
  disks: ZpodDiskView[]
  /** Open on this blank disk ("Create storage on it"); null offers a new disk first. */
  initialDisk: string | null
  onChanged: () => void
}

type Phase = "form" | "running" | "done"
const SIZE_PRESETS = [100, 300, 500, 1024]

export function ZpodStorageAddDialog({
  open,
  onOpenChange,
  zpodId,
  zpodName,
  storages,
  disks,
  initialDisk,
  onChanged,
}: ZpodStorageAddDialogProps) {
  const { addZpodDisk, createZpodStorage } = useApi()
  const blanks = blankDisks(disks)
  const [source, setSource] = useState<"new" | "blank">("new")
  const [size, setSize] = useState("300")
  const [blankDevice, setBlankDevice] = useState("")
  const [name, setName] = useState("")
  const [lvm, setLvm] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [phase, setPhase] = useState<Phase>("form")
  const [requestError, setRequestError] = useState<string | null>(null)
  const [diskRunId, setDiskRunId] = useState<string | null>(null)
  const [storageRunning, setStorageRunning] = useState(false)
  const [op, setOp] = useState<ZpodStorageOperation | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  // What was asked, kept for the steps after the disk run (the form may be reset by then)
  const asked = useRef<{ name: string; lvm: boolean; dryRun: boolean }>({ name: "", lvm: false, dryRun: false })

  // The dialog stays mounted: a run keeps going when it is closed, and reopening shows it.
  useEffect(() => {
    if (!open || phase === "running") return
    setSource(initialDisk ? "blank" : "new")
    setBlankDevice(initialDisk ?? blanks[0]?.device ?? "")
    setSize("300")
    setName(nextStorageName(storages))
    setLvm(false)
    setDryRun(false)
    setPhase("form")
    setRequestError(null)
    setDiskRunId(null)
    setStorageRunning(false)
    setOp(null)
    setStorageError(null)
    // reset when the dialog opens, not when the polled lists change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDisk])

  const sizeGb = parseInt(size, 10)
  const sizeError =
    source !== "new"
      ? null
      : !/^\d+$/.test(size.trim()) || sizeGb < 1
        ? "A whole number of GiB"
        : sizeGb > DISK_MAX_GB
          ? `${DISK_MAX_GB} GiB at most`
          : null
  const nameError = validateStorageName(name, storages)
  const diskError = source === "blank" && !blankDevice ? "No blank disk on this zPod" : null
  const canSubmit = !sizeError && !nameError && !diskError && phase === "form"

  const createOn = useCallback(
    async (device: string) => {
      setStorageRunning(true)
      setStorageError(null)
      try {
        const result = await createZpodStorage(
          zpodId,
          { disk: device, lvm: asked.current.lvm, name: asked.current.name },
          asked.current.dryRun
        )
        setOp(result)
        if (!result.dry_run) toast.success(`${result.name} mounted at ${result.storage?.mountpoint ?? `/FILER/${result.name}`}`)
      } catch (err) {
        setStorageError(apiErrorMessage(err, `Could not create ${asked.current.name} on ${device}`))
      } finally {
        setStorageRunning(false)
        setPhase("done")
        onChanged()
      }
    },
    [createZpodStorage, zpodId, onChanged]
  )

  const onDiskFinal = useCallback(
    (run: ZpodDiskRunView) => {
      onChanged()
      if (run.state !== "COMPLETED") {
        setPhase("done")
        return
      }
      if (!run.disk?.device) {
        setStorageError("The disk was added but zcore does not show it: no storage was created.")
        setPhase("done")
        return
      }
      createOn(run.disk.device)
    },
    [createOn, onChanged]
  )
  const { run: diskRun, error: diskRunError } = useDiskRun(zpodId, diskRunId, onDiskFinal)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    asked.current = { name: name.trim(), lvm, dryRun: source === "blank" && dryRun }
    setRequestError(null)
    setPhase("running")
    if (source === "blank") {
      await createOn(blankDevice)
      return
    }
    try {
      const started = await addZpodDisk(zpodId, sizeGb)
      if (!started.flow_run_id) throw new Error("zpodapi did not start a disk run")
      setDiskRunId(started.flow_run_id)
      onChanged()
    } catch (err) {
      setRequestError(apiErrorMessage(err, `Could not add a ${sizeGb} GiB disk`))
      setPhase("form")
    }
  }

  const newDisk = source === "new"
  const target = asked.current.name || name
  const blankLabel = (d: ZpodDiskView) => `${d.device} · ${d.size_gb} GiB${d.scsi ? ` · SCSI ${d.scsi}` : ""}`
  const succeeded = phase === "done" && !storageError && !!op && !(diskRun && diskRun.state !== "COMPLETED")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        {phase === "form" ? (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add storage to {zpodName}</DialogTitle>
              <DialogDescription>
                A filesystem on its own disk, mounted on zcore under /FILER, ready for folders and NFS exports.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-1.5">
              <Label>Disk</Label>
              <div className="grid grid-cols-2 overflow-hidden rounded-md border" role="radiogroup" aria-label="Disk">
                {(
                  [
                    { key: "new", title: "New disk", sub: "Added to the zcore VM through vCenter", disabled: false },
                    {
                      key: "blank",
                      title: "A blank disk",
                      sub: blanks.length
                        ? `${blanks.length} already attached, nothing on ${blanks.length > 1 ? "them" : "it"}`
                        : "None on this zPod",
                      disabled: !blanks.length,
                    },
                  ] as const
                ).map((o, i) => (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={source === o.key}
                    disabled={o.disabled}
                    onClick={() => setSource(o.key)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      i > 0 && "border-l",
                      source === o.key ? "bg-primary/10 ring-1 ring-inset ring-primary" : "hover:bg-accent"
                    )}
                  >
                    <span className={cn("font-semibold", source === o.key && "text-primary")}>{o.title}</span>
                    <span className="text-muted-foreground">{o.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {newDisk ? (
              <div className="grid gap-1.5">
                <Label htmlFor="st-size">Size</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="st-size"
                    inputMode="numeric"
                    className={cn("w-28 font-mono", sizeError && "border-destructive")}
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">GiB</span>
                  <div className="ml-2 flex gap-1">
                    {SIZE_PRESETS.map((p) => (
                      <Button
                        key={p}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn("h-7 px-2 text-xs", sizeGb === p && "border-primary bg-primary/10 text-primary")}
                        onClick={() => setSize(String(p))}
                      >
                        {p}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className={cn("text-xs", sizeError ? "text-destructive" : "text-muted-foreground")}>
                  {sizeError ??
                    `Thin, on the zcore VM's datastore. Up to ${DISK_MAX_GB} GiB. The run stops before creating anything if the datastore would drop under 15% free.`}
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="st-blank">Blank disk</Label>
                <select
                  id="st-blank"
                  className="h-9 rounded-md border border-input bg-transparent px-3 font-mono text-sm"
                  value={blankDevice}
                  onChange={(e) => setBlankDevice(e.target.value)}
                >
                  {blanks.map((d) => (
                    <option key={d.device} value={d.device ?? ""}>
                      {blankLabel(d)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Only this zPod's blank disks are listed. Nothing is added in vCenter: the storage is created right away.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="st-name">Name</Label>
                <Input
                  id="st-name"
                  className={cn("font-mono", nameError && "border-destructive")}
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                />
                <p className={cn("text-xs", nameError ? "text-destructive" : "text-muted-foreground")}>
                  {nameError ?? "The next free STORAGEnn by default"}
                </p>
              </div>
              <div className="grid content-start gap-1.5">
                <Label>Layout</Label>
                <div className="grid grid-cols-2 overflow-hidden rounded-md border" role="radiogroup" aria-label="Layout">
                  {([false, true] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      role="radio"
                      aria-checked={lvm === v}
                      onClick={() => setLvm(v)}
                      className={cn(
                        "h-9 text-sm transition-colors",
                        v && "border-l",
                        lvm === v ? "bg-accent font-semibold" : "text-muted-foreground hover:bg-accent/50"
                      )}
                    >
                      {v ? "LVM" : "Raw"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {lvm ? "GPT partition, one volume group and one logical volume, ext4" : "GPT partition + ext4, like STORAGE01"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 rounded-md border bg-muted/40 px-3 py-2 text-xs">
              <div className="font-medium text-muted-foreground">What happens</div>
              <ol className="list-decimal space-y-0.5 pl-4">
                {newDisk && (
                  <>
                    <li>
                      <span className="text-[#cba6f7]">vCenter</span> adds a {sizeError ? "" : `${sizeGb} GiB `}thin disk to
                      the zcore VM (a run, about a minute)
                    </li>
                    <li>
                      <span className="text-[#cba6f7]">zcore</span> sees it as a blank disk, matched by its serial
                    </li>
                  </>
                )}
                <li>
                  <span className="text-[#cba6f7]">zcore</span> partitions {newDisk ? "it" : <span className="font-mono">{blankDevice}</span>}
                  , {lvm ? "builds the volume, " : ""}makes ext4 and mounts it at{" "}
                  <span className="font-mono">/FILER/{name.trim() || "STORAGEnn"}</span> ({lvm ? 11 : 8} steps, a few seconds)
                </li>
              </ol>
              <p className="text-muted-foreground">Add folders and export them afterwards, from its row.</p>
            </div>

            {!newDisk && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                Show the steps without running them (dry run)
              </label>
            )}

            {requestError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{requestError}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {newDisk ? "Add Disk and Storage" : dryRun ? "Show the Steps" : "Create Storage"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {phase === "running" ? "Adding" : asked.current.dryRun ? "Dry run of" : "Added"} {target} to {zpodName}
              </DialogTitle>
              <DialogDescription>
                {phase === "running"
                  ? "Closing this dialog leaves it going while you stay on this page. If you leave before the disk is ready, it stays blank: create the storage from its row."
                  : asked.current.dryRun
                    ? "Nothing was changed on zcore."
                    : "The Storages tab shows it from now on."}
              </DialogDescription>
            </DialogHeader>

            {diskRunId && (
              <DiskRunPanel title="1 · New disk" started run={diskRun} error={diskRunError} />
            )}
            {(!diskRunId || diskRun?.state === "COMPLETED" || storageError || op) && (
              <StorageStepsPanel
                number={diskRunId ? "2" : undefined}
                title={`Storage on ${op?.storage?.disk ? `/dev/${op.storage.disk}` : diskRun?.disk?.device ?? (blankDevice || "the new disk")}`}
                running={storageRunning}
                op={op}
                error={storageError}
              />
            )}
            {diskRun && diskRun.state !== "COMPLETED" && phase === "done" && (
              <p className="text-xs text-muted-foreground">Nothing was created on zcore: the storage needs the disk first.</p>
            )}
            {storageError && diskRunId && (
              <p className="text-xs text-muted-foreground">
                The new disk stays, blank: retry from its row (Create storage on it), or remove it (Remove disk on the same row).
              </p>
            )}

            {succeeded && !op?.dry_run && (
              <div className="flex items-center gap-2 rounded-md border border-[#a6e3a1]/40 bg-[#a6e3a1]/10 px-3 py-2 text-sm text-[#a6e3a1]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {op?.name} mounted at <span className="font-mono">{op?.storage?.mountpoint}</span>
                  {op?.storage && `, ${formatGiB(op.storage.available_bytes)} free`}
                </span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant={phase === "running" ? "outline" : "default"} onClick={() => onOpenChange(false)}>
                {phase === "running" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
