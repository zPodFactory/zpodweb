import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, X } from "lucide-react"
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
import { nfsOptions, parseNfsOptions, validateFolderName, validateNfsClient } from "@/lib/storage-utils"
import { cn } from "@/lib/utils"
import type { ZpodNfsExportView, ZpodStorageView } from "@/types"

const NEW_FOLDER = "__new__"

interface ZpodStorageExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  zpodId: number
  zcoreFqdn: string
  storages: ZpodStorageView[]
  /** The zPod's networks, offered as one-click clients. */
  networks: { name: string; cidr: string }[]
  /** Open on this folder (its row's "Export over NFS"), or on this export to edit it. */
  initial: { storage: string; folder: string } | null
  editing: ZpodNfsExportView | null
  onChanged: () => void
}

export function ZpodStorageExportDialog({
  open,
  onOpenChange,
  zpodId,
  zcoreFqdn,
  storages,
  networks,
  initial,
  editing,
  onChanged,
}: ZpodStorageExportDialogProps) {
  const { addZpodNfsExport, setZpodNfsExport, addZpodStorageFolder } = useApi()
  const [storage, setStorage] = useState("")
  const [folder, setFolder] = useState("")
  const [newFolder, setNewFolder] = useState("")
  const [anyHost, setAnyHost] = useState(true)
  const [clients, setClients] = useState<string[]>([])
  const [clientInput, setClientInput] = useState("")
  const [readOnly, setReadOnly] = useState(false)
  const [noRootSquash, setNoRootSquash] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportable = (s: ZpodStorageView) => s.folders.filter((f) => !f.exported)

  useEffect(() => {
    if (!open) return
    setError(null)
    setClientInput("")
    setNewFolder("")
    setSubmitting(false)
    if (editing) {
      const list = editing.clients.map((c) => c.client)
      const opts = parseNfsOptions(editing.options)
      setStorage(editing.storage ?? "")
      setFolder(editing.folder ?? "")
      setAnyHost(list.length === 1 && list[0] === "*")
      setClients(list.filter((c) => c !== "*"))
      setReadOnly(opts.readOnly)
      setNoRootSquash(opts.noRootSquash)
      return
    }
    const st = storages.find((s) => s.name === initial?.storage) ?? storages.find((s) => exportable(s).length) ?? storages[0]
    setStorage(st?.name ?? "")
    setFolder(initial?.folder ?? (st && exportable(st)[0]?.name) ?? NEW_FOLDER)
    setAnyHost(true)
    setClients([])
    setReadOnly(false)
    setNoRootSquash(true)
    // reset when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, initial])

  const st = storages.find((s) => s.name === storage)
  const folders = st ? exportable(st) : []
  const creatingFolder = !editing && folder === NEW_FOLDER
  const folderName = creatingFolder ? newFolder.trim() : folder
  const folderError = creatingFolder ? validateFolderName(newFolder, st?.folders ?? []) : !folder ? "Pick a folder" : null
  const clientError = clientInput.trim() ? validateNfsClient(clientInput) : null
  const clientsError = !anyHost && clients.length === 0 ? "Add at least one client, or allow any host" : null
  const options = nfsOptions(readOnly, noRootSquash)
  const path = `${st?.mountpoint ?? "/FILER/STORAGEnn"}/${folderName || "FOLDER"}`
  const canSubmit = !!st && !folderError && !clientsError && !submitting

  const suggestions = useMemo(() => networks.filter((n) => !clients.includes(n.cidr)), [networks, clients])

  const addClient = (value: string) => {
    const v = value.trim()
    if (!v || validateNfsClient(v) || clients.includes(v)) return
    setClients((c) => [...c, v])
    setClientInput("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !st) return
    setSubmitting(true)
    setError(null)
    const list = anyHost ? ["*"] : clients
    try {
      if (editing) {
        await setZpodNfsExport(zpodId, st.name, folderName, { clients: list, options })
        toast.success(`${folderName} export updated`)
      } else {
        if (creatingFolder) await addZpodStorageFolder(zpodId, st.name, folderName, {})
        await addZpodNfsExport(zpodId, { storage: st.name, folder: folderName, clients: anyHost ? null : clients, options })
        toast.success(`${path} exported`, { description: `To ${list.join(", ")}` })
      }
      onOpenChange(false)
      onChanged()
    } catch (err) {
      setError(apiErrorMessage(err, `Could not export ${folderName}`))
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  const label = folderName || "folder"
  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit the export of ${editing.folder}` : "Export a folder over NFS"}</DialogTitle>
            <DialogDescription>
              zcore serves it to the clients you allow. Exporting never changes what is in the folder.
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <p className="font-mono text-sm text-[#89b4fa]">{editing.path}</p>
          ) : (
            <div className="grid gap-1.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="exp-storage">Storage</Label>
                  <select
                    id="exp-storage"
                    className="h-9 rounded-md border border-input bg-transparent px-3 font-mono text-sm"
                    value={storage}
                    onChange={(e) => {
                      setStorage(e.target.value)
                      const next = storages.find((s) => s.name === e.target.value)
                      setFolder((next && exportable(next)[0]?.name) ?? NEW_FOLDER)
                    }}
                  >
                    {storages.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="exp-folder">Folder</Label>
                  <select
                    id="exp-folder"
                    className="h-9 rounded-md border border-input bg-transparent px-3 font-mono text-sm"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                  >
                    {folders.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                    <option value={NEW_FOLDER}>+ New folder…</option>
                  </select>
                </div>
              </div>
              {creatingFolder && (
                <div className="grid gap-1">
                  <Input
                    aria-label="New folder name"
                    placeholder="DATASTORE02"
                    className={cn("font-mono", newFolder && folderError && "border-destructive")}
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                  />
                  <p className={cn("text-xs", newFolder && folderError ? "text-destructive" : "text-muted-foreground")}>
                    {(newFolder && folderError) || "Created first, root:root 0777, then exported"}
                  </p>
                </div>
              )}
              <p className="font-mono text-xs text-[#89b4fa]">{path}</p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Who can mount it</Label>
            <div className="grid grid-cols-2 overflow-hidden rounded-md border" role="radiogroup" aria-label="Who can mount it">
              {(
                [
                  { any: true, title: "Any host (*)", sub: "Whatever reaches zcore. The default." },
                  { any: false, title: "Only these clients", sub: "IPv4 addresses or networks" },
                ] as const
              ).map((o, i) => (
                <button
                  key={o.title}
                  type="button"
                  role="radio"
                  aria-checked={anyHost === o.any}
                  onClick={() => setAnyHost(o.any)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 px-3 py-2 text-left text-xs transition-colors",
                    i > 0 && "border-l",
                    anyHost === o.any ? "bg-primary/10 ring-1 ring-inset ring-primary" : "hover:bg-accent"
                  )}
                >
                  <span className={cn("font-semibold", anyHost === o.any && "text-primary")}>{o.title}</span>
                  <span className="text-muted-foreground">{o.sub}</span>
                </button>
              ))}
            </div>
            {!anyHost && (
              <div className="grid gap-2 rounded-md border bg-muted/30 p-2.5">
                {clients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {clients.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 rounded bg-[#89b4fa]/15 py-0.5 pl-2 pr-1 font-mono text-xs text-[#89b4fa]">
                        {c}
                        <button
                          type="button"
                          aria-label={`Remove ${c}`}
                          onClick={() => setClients((l) => l.filter((x) => x !== c))}
                          className="rounded p-0.5 hover:bg-[#89b4fa]/20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <Input
                    aria-label="Add a client"
                    placeholder="10.42.111.25 or 10.42.111.0/24"
                    className={cn("h-8 font-mono text-xs", clientError && "border-destructive")}
                    value={clientInput}
                    onChange={(e) => setClientInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addClient(clientInput)
                      }
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" className="h-8" disabled={!!clientError || !clientInput.trim()} onClick={() => addClient(clientInput)}>
                    Add
                  </Button>
                </div>
                {clientError && <p className="text-xs text-destructive">{clientError}</p>}
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>This zPod's networks:</span>
                    {suggestions.map((n) => (
                      <button
                        key={n.cidr}
                        type="button"
                        onClick={() => addClient(n.cidr)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] hover:bg-accent"
                      >
                        <Plus className="h-3 w-3" />
                        {n.name} <span className="font-mono">{n.cidr}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {clientsError && <p className="text-xs text-destructive">{clientsError}</p>}
          </div>

          <div className="grid gap-2">
            <Label>Access</Label>
            <div className="grid w-56 grid-cols-2 overflow-hidden rounded-md border" role="radiogroup" aria-label="Access">
              {([false, true] as const).map((ro) => (
                <button
                  key={String(ro)}
                  type="button"
                  role="radio"
                  aria-checked={readOnly === ro}
                  onClick={() => setReadOnly(ro)}
                  className={cn(
                    "h-8 text-xs transition-colors",
                    ro && "border-l",
                    readOnly === ro ? "bg-accent font-semibold" : "text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  {ro ? "Read-only" : "Read-write"}
                </button>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={noRootSquash}
                onChange={(e) => setNoRootSquash(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#fab387]"
              />
              <span>
                Let root write as root (<span className="font-mono text-[#fab387]">no_root_squash</span>)
                <span className="block text-xs text-muted-foreground">
                  Needed for an ESXi datastore. Off: root on a client maps to nobody.
                </span>
              </span>
            </label>
            <p className="font-mono text-xs text-muted-foreground">options: {options}</p>
          </div>

          <div className="grid gap-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Mount it as</span>
            <span className="break-all font-mono text-foreground/80">
              ESXi · esxcli storage nfs add -H {zcoreFqdn} -s {path} -v {label}
            </span>
            <span className="break-all font-mono text-foreground/80">
              Linux · mount {zcoreFqdn}:{path} /mnt/{label.toLowerCase()}
            </span>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Export"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
