import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
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
import { DISK_MAX_GB } from "@/lib/storage-utils"
import { cn } from "@/lib/utils"
import type { ZpodDiskRunView, ZpodDiskView, ZpodStorageOperation } from "@/types"

export type DiskAction =
  | { kind: "add" }
  | { kind: "grow"; disk: ZpodDiskView } // the disk, and its storage after when it has one
  | { kind: "remove"; disk: ZpodDiskView }

/** Add, grow or remove a disk of the zcore VM. Each one is a vCenter run, followed here;
 *  the dialog stays mounted, so closing it leaves the run going. */
export function ZpodDiskDialog({
  open,
  onOpenChange,
  zpodId,
  action,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  zpodId: number
  action: DiskAction | null
  onChanged: () => void
}) {
  const { addZpodDisk, growZpodDisk, removeZpodDisk, growZpodStorage } = useApi()
  const [size, setSize] = useState("")
  const [growStorage, setGrowStorage] = useState(true)
  const [typed, setTyped] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [op, setOp] = useState<ZpodStorageOperation | null>(null)
  const [opRunning, setOpRunning] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)
  const [started, setStarted] = useState(false) // past the form: following the run
  const growAfter = useRef(false)

  const disk = action && action.kind !== "add" ? action.disk : null
  const storage = disk?.storage ?? null

  useEffect(() => {
    if (!open || (started && !finished())) return
    setSize(action?.kind === "grow" ? String(action.disk.size_gb) : "100")
    setGrowStorage(true)
    setTyped("")
    setSubmitting(false)
    setError(null)
    setRunId(null)
    setOp(null)
    setOpRunning(false)
    setOpError(null)
    setStarted(false)
    // reset when the dialog opens on a new action, not while a run is followed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action])

  const runStorageGrow = useCallback(async () => {
    if (!storage) return
    setOpRunning(true)
    try {
      const result = await growZpodStorage(zpodId, storage)
      setOp(result)
      toast.success(`${storage} grown`)
    } catch (err) {
      setOpError(apiErrorMessage(err, `Could not grow ${storage}`))
    } finally {
      setOpRunning(false)
      onChanged()
    }
  }, [growZpodStorage, zpodId, storage, onChanged])

  const onFinal = useCallback(
    (run: ZpodDiskRunView) => {
      onChanged()
      if (run.state === "COMPLETED" && growAfter.current) runStorageGrow()
    },
    [onChanged, runStorageGrow]
  )
  const { run, error: runError } = useDiskRun(zpodId, runId, onFinal)

  function finished(): boolean {
    const final = !!run && ["COMPLETED", "FAILED", "CRASHED", "CANCELLED"].includes(run.state)
    return final && !opRunning
  }

  if (!action) return null

  const sizeGb = parseInt(size, 10)
  const current = disk?.size_gb ?? 0
  const sizeError =
    action.kind === "remove"
      ? null
      : !/^\d+$/.test(size.trim()) || sizeGb < 1
        ? "A whole number of GiB"
        : sizeGb > DISK_MAX_GB
          ? `${DISK_MAX_GB} GiB at most`
          : action.kind === "grow" && sizeGb < current
            ? `Larger than ${current} GiB: a disk never shrinks`
            : action.kind === "grow" && sizeGb === current && !storage
              ? `Larger than ${current} GiB`
              : null
  const storageOnly = action.kind === "grow" && sizeGb === current && !!storage
  const canSubmit =
    !submitting && !sizeError && (action.kind !== "remove" || typed.trim() === (disk?.device ?? "").replace(/^\/dev\//, ""))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      if (storageOnly) {
        growAfter.current = false
        setStarted(true)
        await runStorageGrow()
        return
      }
      let begun: ZpodDiskRunView
      if (action.kind === "add") begun = await addZpodDisk(zpodId, sizeGb)
      else if (action.kind === "grow") begun = await growZpodDisk(zpodId, action.disk.device ?? "", sizeGb)
      else begun = await removeZpodDisk(zpodId, action.disk.device ?? "")
      growAfter.current = action.kind === "grow" && !!storage && growStorage
      setRunId(begun.flow_run_id)
      setStarted(true)
      onChanged()
    } catch (err) {
      setError(apiErrorMessage(err, "zpodapi refused it"))
    } finally {
      setSubmitting(false)
    }
  }

  const name = disk?.device ?? "a disk"
  const title =
    action.kind === "add" ? "Add a disk" : action.kind === "grow" ? `Grow ${name}` : `Remove ${name}?`

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        {!started ? (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle className={cn(action.kind === "remove" && "text-destructive")}>{title}</DialogTitle>
              <DialogDescription>
                {action.kind === "add" &&
                  "A thin virtual disk added to the zcore VM through vCenter. It shows up blank: create a storage on it from its row."}
                {action.kind === "grow" &&
                  `The virtual disk grows in vCenter, online.${storage ? ` ${storage} can grow into the new space right after.` : ""}`}
                {action.kind === "remove" && (
                  <>
                    vCenter detaches and deletes <span className="font-mono">{name}</span> ({disk?.size_gb} GiB
                    {disk?.state ? `, ${disk.state}` : ""}). Nothing on it can be recovered.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {action.kind !== "remove" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="disk-size">{action.kind === "grow" ? "New total size" : "Size"}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="disk-size"
                    inputMode="numeric"
                    className={cn("w-28 font-mono", sizeError && "border-destructive")}
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">GiB{action.kind === "grow" ? ` (now ${current})` : ""}</span>
                </div>
                <p className={cn("text-xs", sizeError ? "text-destructive" : "text-muted-foreground")}>
                  {sizeError ??
                    (storageOnly
                      ? `Same size: only ${storage} grows, into free space already on the disk.`
                      : `Up to ${DISK_MAX_GB} GiB. The run stops before changing anything if the datastore would drop under 15% free.`)}
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="disk-confirm">
                  Type <span className="font-mono font-semibold">{name.replace(/^\/dev\//, "")}</span> to confirm
                </Label>
                <Input id="disk-confirm" autoComplete="off" className="font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </div>
            )}

            {action.kind === "grow" && storage && !storageOnly && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={growStorage} onChange={(e) => setGrowStorage(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>
                  Then grow <span className="font-mono">{storage}</span> into the new space
                  <span className="block text-xs text-muted-foreground">Online: its folders and exports stay in use.</span>
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant={action.kind === "remove" ? "destructive" : "default"} disabled={!canSubmit}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {action.kind === "add" ? "Add Disk" : action.kind === "grow" ? (storageOnly ? `Grow ${storage}` : "Grow") : "Remove Disk"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{title.replace(/\?$/, "")}</DialogTitle>
              <DialogDescription>Closing this dialog leaves it going; the Layout tab shows its disk run in progress until it ends.</DialogDescription>
            </DialogHeader>
            {runId && (
              <DiskRunPanel
                title={`${growAfter.current ? "1 · " : ""}${action.kind === "add" ? "New disk" : action.kind === "grow" ? `${name} to ${sizeGb} GiB` : `Remove ${name}`}`}
                started
                run={run}
                error={runError}
              />
            )}
            {(storageOnly || (growAfter.current && (run?.state === "COMPLETED" || op || opError))) && (
              <StorageStepsPanel
                number={growAfter.current ? "2" : undefined}
                title={`Grow ${storage}`}
                running={opRunning}
                op={op}
                error={opError}
              />
            )}
            <DialogFooter>
              <Button variant={finished() || (storageOnly && !opRunning) ? "default" : "outline"} onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
