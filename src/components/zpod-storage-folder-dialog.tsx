import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
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
import { useApi } from "@/hooks/use-api"
import { apiErrorMessage } from "@/lib/network-utils"
import { validateFolderName, validateMode, validateOwner } from "@/lib/storage-utils"
import { cn } from "@/lib/utils"
import type { ZpodStorageFolderView, ZpodStorageView } from "@/types"

/** Add a folder to a storage, or change a folder's owner and mode. */
export function ZpodStorageFolderDialog({
  open,
  onOpenChange,
  zpodId,
  storage,
  folder,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  zpodId: number
  storage: ZpodStorageView
  folder: ZpodStorageFolderView | null // null: add a folder
  onChanged: () => void
}) {
  const { addZpodStorageFolder, setZpodStorageFolder } = useApi()
  const [name, setName] = useState("")
  const [owner, setOwner] = useState("")
  const [mode, setMode] = useState("")
  const [recursive, setRecursive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("")
    setOwner(folder?.owner ?? "root:root")
    setMode(folder?.mode ?? "0777")
    setRecursive(false)
    setSubmitting(false)
    setError(null)
  }, [open, folder])

  const nameError = folder ? null : validateFolderName(name, storage.folders)
  const ownerError = validateOwner(owner)
  const modeError = validateMode(mode)
  const unchanged = !!folder && owner.trim() === folder.owner && mode.trim() === folder.mode
  const canSubmit = !nameError && !ownerError && !modeError && !unchanged && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      if (folder) {
        await setZpodStorageFolder(zpodId, storage.name, folder.name, { owner: owner.trim(), mode: mode.trim(), recursive })
        toast.success(`${folder.name} is ${owner.trim()}, ${mode.trim()}`)
      } else {
        const created = await addZpodStorageFolder(zpodId, storage.name, name.trim(), { owner: owner.trim(), mode: mode.trim() })
        toast.success(`Added ${created.path}`)
      }
      onOpenChange(false)
      onChanged()
    } catch (err) {
      setError(apiErrorMessage(err, folder ? `Could not change ${folder.name}` : `Could not add ${name.trim()}`))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[460px]">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{folder ? `Owner and mode of ${folder.name}` : `Add a folder to ${storage.name}`}</DialogTitle>
            <DialogDescription className="font-mono">
              {folder ? folder.path : `${storage.mountpoint}/${name.trim() || "FOLDER"}`}
            </DialogDescription>
          </DialogHeader>
          {!folder && (
            <div className="grid gap-1.5">
              <Label htmlFor="fo-name">Name</Label>
              <Input
                id="fo-name"
                placeholder="DATASTORE02"
                className={cn("font-mono", name && nameError && "border-destructive")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className={cn("text-xs", name && nameError ? "text-destructive" : "text-muted-foreground")}>
                {(name && nameError) || "Letters, digits, . - or _"}
              </p>
            </div>
          )}
          <div className="grid grid-cols-[1.6fr_1fr] gap-3">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="fo-owner">Owner</Label>
              <Input
                id="fo-owner"
                className={cn("font-mono", ownerError && "border-destructive")}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
              <p className={cn("text-xs", ownerError ? "text-destructive" : "text-muted-foreground")}>{ownerError ?? "user:group"}</p>
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="fo-mode">Mode</Label>
              <Input
                id="fo-mode"
                inputMode="numeric"
                className={cn("font-mono", modeError && "border-destructive")}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              />
              <p className={cn("text-xs", modeError ? "text-destructive" : "text-muted-foreground")}>{modeError ?? "octal"}</p>
            </div>
          </div>
          {folder && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                Apply to everything inside too
                <span className="block text-xs text-muted-foreground">Off: only the folder itself changes.</span>
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
            <Button type="submit" disabled={!canSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {folder ? "Save" : "Add Folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Remove a folder. An empty one goes on a plain confirm; one with files needs the name typed. */
export function ZpodStorageFolderRemoveDialog({
  open,
  onOpenChange,
  zpodId,
  storage,
  folder,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  zpodId: number
  storage: string
  folder: ZpodStorageFolderView
  onChanged: () => void
}) {
  const { removeZpodStorageFolder } = useApi()
  const [typed, setTyped] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTyped("")
    setSubmitting(false)
    setError(null)
  }, [open])

  const force = !folder.empty
  const canSubmit = !submitting && (!force || typed.trim() === folder.name)

  const handleRemove = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await removeZpodStorageFolder(zpodId, storage, folder.name, force)
      toast.success(`${folder.path} removed`)
      onOpenChange(false)
      onChanged()
    } catch (err) {
      setError(apiErrorMessage(err, `Could not remove ${folder.name}`))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Remove {folder.name}?
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{folder.path}</span>{" "}
            {force ? "is not empty: it is deleted with everything in it. Nothing can be recovered." : "is empty."}
          </DialogDescription>
        </DialogHeader>
        {force && (
          <div className="grid gap-1.5">
            <Label htmlFor="fo-confirm">
              Type <span className="font-mono font-semibold">{folder.name}</span> to confirm
            </Label>
            <Input id="fo-confirm" autoComplete="off" className="font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!canSubmit} onClick={handleRemove}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {force ? "Remove Folder and Files" : "Remove Folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
