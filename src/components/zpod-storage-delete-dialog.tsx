import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Check, Folder, HardDrive, Loader2 } from "lucide-react"
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
import { TreeConnector, TreeTrunk } from "@/components/tree-trunk"
import { DiskRunPanel } from "@/components/zpod-storage-run"
import { useApi } from "@/hooks/use-api"
import { useDiskRun } from "@/hooks/use-disk-run"
import { apiErrorMessage } from "@/lib/network-utils"
import { formatGiB } from "@/lib/storage-utils"
import { cn } from "@/lib/utils"
import type { ZpodDiskView, ZpodNfsExportView, ZpodStorageView } from "@/types"

interface ZpodStorageDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  zpodId: number
  zpodName: string
  storage: ZpodStorageView
  disk: ZpodDiskView | undefined
  exports: ZpodNfsExportView[] // this storage's exports
  onChanged: () => void
}

type Choice = "keep" | "disk"

export function ZpodStorageDeleteDialog({
  open,
  onOpenChange,
  zpodId,
  zpodName,
  storage,
  disk,
  exports,
  onChanged,
}: ZpodStorageDeleteDialogProps) {
  const { deleteZpodStorage, removeZpodDisk, removeZpodNfsExport } = useApi()
  const [choice, setChoice] = useState<Choice>("keep")
  const [typed, setTyped] = useState("")
  const [unexporting, setUnexporting] = useState<string | null>(null)
  const [unexported, setUnexported] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diskRunId, setDiskRunId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || diskRunId) return
    setChoice("keep")
    setTyped("")
    setUnexporting(null)
    setUnexported([])
    setSubmitting(false)
    setError(null)
    // reset when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onDiskFinal = useCallback(() => onChanged(), [onChanged])
  const { run: diskRun, error: diskRunError } = useDiskRun(zpodId, diskRunId, onDiskFinal)

  const device = `/dev/${storage.disk}`
  const exportedFolders = storage.folders.filter((f) => f.exported && !unexported.includes(f.name))
  const exportOf = (folder: string) => exports.find((e) => e.folder === folder)
  // The disk can go with the storage only when zPodFactory added it (a user disk row)
  const diskRemovable = !!disk && disk.kind === "user" && disk.id !== null
  const blocked = exportedFolders.length > 0
  const confirmed = typed.trim() === storage.name
  const canSubmit = !blocked && !submitting && (choice === "keep" || confirmed)

  const unexport = async (folder: string) => {
    setUnexporting(folder)
    setError(null)
    try {
      await removeZpodNfsExport(zpodId, storage.name, folder)
      setUnexported((u) => [...u, folder])
      toast.success(`${folder} is no longer exported; its files stay`)
      onChanged()
    } catch (err) {
      setError(apiErrorMessage(err, `Could not unexport ${folder}`))
    } finally {
      setUnexporting(null)
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const op = await deleteZpodStorage(zpodId, storage.name)
      onChanged()
      if (choice === "keep") {
        toast.success(`${storage.name} deleted`, {
          description: `${device} is ${op.disk_state ?? "foreign"} now; its data stays on it.`,
        })
        onOpenChange(false)
        return
      }
    } catch (err) {
      setError(apiErrorMessage(err, `Could not delete ${storage.name}`))
      setSubmitting(false)
      return
    }
    try {
      const started = await removeZpodDisk(zpodId, device)
      if (started.flow_run_id) setDiskRunId(started.flow_run_id)
      onChanged()
    } catch (err) {
      setError(
        `${storage.name} is deleted, but ${device} could not be removed: ${apiErrorMessage(err, "zpodapi refused it")}. Remove it from its row under the storages.`
      )
    } finally {
      setSubmitting(false)
    }
  }

  const closable = !submitting

  if (diskRunId) {
    const done = diskRun && ["COMPLETED", "FAILED", "CRASHED", "CANCELLED"].includes(diskRun.state)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Removing {storage.name} and its disk</DialogTitle>
            <DialogDescription>
              {storage.name} is deleted. vCenter detaches and deletes {device}; closing this dialog leaves it going.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[#a6e3a1] text-[#11111b]">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            1 · {storage.name} unmounted
          </div>
          <DiskRunPanel title={`2 · Remove ${device}`} started run={diskRun} error={diskRunError} />
          <DialogFooter>
            <Button
              variant={done ? "default" : "outline"}
              onClick={() => {
                onOpenChange(false)
                if (done) setDiskRunId(null)
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => closable && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Delete {storage.name}?</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{storage.mountpoint}</span> is unmounted from zcore on {zpodName}. Choose what
            happens to its disk, <span className="font-mono">{device}</span>
            {disk ? ` (${disk.size_gb} GiB)` : ""}.
          </DialogDescription>
        </DialogHeader>

        {blocked && (
          <div className="space-y-2 rounded-md border border-[#f9e2af]/45 bg-[#f9e2af]/[0.07] p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#f9e2af]">
              <AlertTriangle className="h-4 w-4" />
              First: {exportedFolders.map((f) => f.name).join(", ")} {exportedFolders.length > 1 ? "are" : "is"} exported
            </div>
            <p className="text-xs">zcore refuses to unmount an exported storage, whichever option you pick.</p>
            {exportedFolders.map((f) => {
              const exp = exportOf(f.name)
              return (
                <div key={f.name} className="flex flex-wrap items-center gap-2 text-xs">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-[#f9e2af] text-[#f9e2af] hover:bg-[#f9e2af]/10 hover:text-[#f9e2af]"
                    disabled={!!unexporting || exp?.protected}
                    onClick={() => unexport(f.name)}
                  >
                    {unexporting === f.name && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    Unexport {f.name}
                  </Button>
                  {exp && (
                    <span className="text-muted-foreground">
                      to {exp.clients.map((c) => c.client).join(", ")}
                      {exp.protected && " · protected"}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="grid gap-2" role="radiogroup" aria-label="Its disk and data">
          <Label>Its disk and data</Label>
          {(
            [
              {
                key: "keep",
                title: "Keep the data on the disk",
                sub: "Only unmounts the storage. Nothing is deleted.",
                danger: false,
                disabled: false,
              },
              {
                key: "disk",
                title: "Also remove its disk",
                sub: diskRemovable
                  ? `Deletes ${device} in vCenter, with everything on it.`
                  : `${device} was not added through zPodFactory: it cannot be removed here.`,
                danger: true,
                disabled: !diskRemovable,
              },
            ] as const
          ).map((o) => {
            const on = choice === o.key
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={o.disabled}
                onClick={() => {
                  setChoice(o.key)
                  setTyped("")
                }}
                className={cn(
                  "flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  on
                    ? o.danger
                      ? "border-destructive bg-destructive/10 ring-1 ring-inset ring-destructive"
                      : "border-primary bg-primary/10 ring-1 ring-inset ring-primary"
                    : "hover:bg-accent"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px]",
                    on ? (o.danger ? "border-destructive" : "border-primary") : "border-muted-foreground"
                  )}
                >
                  {on && <span className={cn("h-2 w-2 rounded-full", o.danger ? "bg-destructive" : "bg-primary")} />}
                </span>
                <span className="grid gap-0.5">
                  <span className={cn("text-sm font-semibold", o.danger && "text-destructive")}>{o.title}</span>
                  <span className="text-xs text-muted-foreground">{o.sub}</span>
                </span>
              </button>
            )
          })}
        </div>

        {choice === "keep" ? (
          <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <div className="font-medium text-muted-foreground">Afterwards</div>
            <p>
              <Check className="mr-1 inline h-3.5 w-3.5 text-[#a6e3a1]" />
              {storage.folders.length ? storage.folders.map((f) => f.name).join(", ") + " and their files stay" : "Its files stay"} on{" "}
              <span className="font-mono">{storage.device}</span>
            </p>
            <p>
              <Check className="mr-1 inline h-3.5 w-3.5 text-[#a6e3a1]" />
              <span className="font-mono">{device}</span> stays attached; it shows under the storages as{" "}
              <span className="font-mono text-[#fab387]">foreign</span>
            </p>
            <p className="text-muted-foreground">
              Mount it again from a terminal:{" "}
              <span className="font-mono text-foreground/80">
                zcli zpod storage adopt {zpodName} --device {storage.device.replace(/^\/dev\//, "")}
              </span>
              . Or remove it later from its row (Remove disk).
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">What goes</Label>
              <div className="rounded-md border border-destructive/45 bg-muted/30 px-3 py-2 text-xs">
                <div className="flex min-h-[26px] items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-mono">{device}</span>
                  <span className="text-muted-foreground">
                    {disk?.size_gb} GiB{disk?.scsi ? ` · SCSI ${disk.scsi}` : ""}
                  </span>
                </div>
                <div className="flex min-h-[26px] items-center pl-[6px]">
                  <TreeTrunk last />
                  <TreeConnector className="mr-1.5" />
                  <HardDrive className="h-3.5 w-3.5 shrink-0 text-[#cba6f7]" />
                  <span className="ml-2 font-mono">{storage.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {storage.mountpoint} · {storage.fstype ?? "?"} · {formatGiB(storage.used_bytes)} used
                  </span>
                </div>
                {storage.folders.map((f, i) => (
                  <div key={f.name} className="flex min-h-[26px] items-center pl-[34px]">
                    <TreeTrunk last={i === storage.folders.length - 1} />
                    <TreeConnector className="mr-1.5" />
                    <Folder className={cn("h-3.5 w-3.5 shrink-0", f.exported ? "text-[#89b4fa]" : "text-muted-foreground")} />
                    <span className="ml-2 font-mono">{f.name}</span>
                    <span className="ml-2 text-muted-foreground">
                      {f.empty ? "empty" : "not empty"}
                      {f.exported && " · exported"}
                    </span>
                  </div>
                ))}
                <p className="mt-1.5 border-t pt-1.5 text-destructive">
                  The disk is detached and deleted in vCenter. Nothing on it can be recovered.
                </p>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="st-confirm">
                Type <span className="font-mono font-semibold">{storage.name}</span> to confirm
              </Label>
              <Input
                id="st-confirm"
                autoComplete="off"
                className="font-mono"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          </>
        )}

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}

        <DialogFooter className="items-center">
          <span className="mr-auto text-xs text-muted-foreground">
            {blocked ? `Unexport ${exportedFolders[0].name} first` : choice === "disk" && !confirmed ? "Type the name to confirm" : ""}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant={choice === "disk" ? "destructive" : "default"} disabled={!canSubmit} onClick={handleSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {choice === "keep" ? "Delete Storage" : "Remove Storage and Disk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
