import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Check,
  ChevronRight,
  Copy,
  Expand,
  Folder,
  FolderPlus,
  HardDrive,
  Info,
  Lock,
  Monitor,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Undo2,
  UserCog,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmationDialog } from "@/components/confirmation-dialog"
import { TreeConnector, TreeTrunk } from "@/components/tree-trunk"
import { ZpodDiskDialog, type DiskAction } from "@/components/zpod-disk-dialog"
import { ZpodStorageAddDialog } from "@/components/zpod-storage-add-dialog"
import { ZpodStorageDeleteDialog } from "@/components/zpod-storage-delete-dialog"
import { ZpodStorageExportDialog } from "@/components/zpod-storage-export-dialog"
import { ZpodStorageFolderDialog, ZpodStorageFolderRemoveDialog } from "@/components/zpod-storage-folder-dialog"
import { StorageLayoutBadge, ZpodStorageLayout } from "@/components/zpod-storage-layout"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { usePreferencesStore, type StorageView } from "@/stores/preferences-store"
import { apiErrorMessage, cidrsOverlap } from "@/lib/network-utils"
import {
  blankDisks,
  formatGiB,
  formatGiBWhole,
  isNotImplemented,
  nfsAccessLabel,
  parseNfsOptions,
  usageColor,
  usagePercent,
} from "@/lib/storage-utils"
import { storageKindClasses } from "@/lib/status-colors"
import { cn, copyToClipboard } from "@/lib/utils"
import type {
  ZpodDiskView,
  ZpodNfsExportView,
  ZpodNfsStatus,
  ZpodStorageFolderView,
  ZpodStorageView,
} from "@/types"

interface ZpodStorageCardProps {
  zpodId: number
  zpodName: string
  zcoreFqdn: string
  isMaintainer: boolean
  zcoreActive: boolean
  /** The zPod's networks, offered as NFS clients. */
  networks: { name: string; cidr: string }[]
}

interface StorageData {
  storages: ZpodStorageView[]
  disks: ZpodDiskView[]
  exports: ZpodNfsExportView[]
  status: ZpodNfsStatus | null
}

const TABS: { key: StorageView; label: string }[] = [
  { key: "storages", label: "Storages" },
  { key: "layout", label: "Layout" },
]

/** The group of exports that are not a folder of a storage, folded like a storage. */
const OTHER_EXPORTS = "__other_exports__"

const ZCORE_FILER = "The zcore filer: grow only"
const DISK_RUN_RUNNING = "A disk run is running on this zPod"

export function ZpodStorageCard({
  zpodId,
  zpodName,
  zcoreFqdn,
  isMaintainer,
  zcoreActive,
  networks,
}: ZpodStorageCardProps) {
  const { fetchZpodStorages, fetchZpodDisks, fetchZpodNfsExports, fetchZpodNfsStatus, removeZpodNfsExport } = useApi()
  const { storageView, setStorageView: setTab, storagesFolded, setStorageFolded } = usePreferencesStore()
  // A view saved before the Disks and NFS tabs were folded into Storages falls back to it
  const tab: StorageView = storageView === "layout" ? "layout" : "storages"
  const [data, setData] = useState<StorageData | null>(null)
  const [unsupported, setUnsupported] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const stopped = useRef(false)

  // Dialogs. The add-storage and disk dialogs stay mounted so a run keeps going when closed.
  const [addOpen, setAddOpen] = useState(false)
  const [addOnDisk, setAddOnDisk] = useState<string | null>(null)
  const [diskOpen, setDiskOpen] = useState(false)
  const [diskAction, setDiskAction] = useState<DiskAction | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ZpodStorageView | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportInitial, setExportInitial] = useState<{ storage: string; folder: string } | null>(null)
  const [exportEditing, setExportEditing] = useState<ZpodNfsExportView | null>(null)
  const [folderTarget, setFolderTarget] = useState<{ storage: ZpodStorageView; folder: ZpodStorageFolderView | null } | null>(null)
  const [folderRemove, setFolderRemove] = useState<{ storage: string; folder: ZpodStorageFolderView } | null>(null)
  const [unexportTarget, setUnexportTarget] = useState<ZpodNfsExportView | null>(null)
  const [unexporting, setUnexporting] = useState(false)

  const load = useCallback(async () => {
    if (!zcoreActive || stopped.current) return
    const [storages, disks, exports, status] = await Promise.allSettled([
      fetchZpodStorages(zpodId),
      fetchZpodDisks(zpodId),
      fetchZpodNfsExports(zpodId),
      fetchZpodNfsStatus(zpodId),
    ])
    if (storages.status === "rejected" && isNotImplemented(storages.reason)) {
      // zboxapi is too old: say so once and stop asking
      stopped.current = true
      setUnsupported(apiErrorMessage(storages.reason, "This zcore's zboxapi cannot manage storage."))
      return
    }
    const firstError = [storages, disks, exports].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined
    setFailed(firstError ? apiErrorMessage(firstError.reason, "The storage state could not be read from zcore") : null)
    setData((prev) => ({
      storages: storages.status === "fulfilled" ? storages.value : prev?.storages ?? [],
      disks: disks.status === "fulfilled" ? disks.value : prev?.disks ?? [],
      exports: exports.status === "fulfilled" ? exports.value : prev?.exports ?? [],
      status: status.status === "fulfilled" ? status.value : prev?.status ?? null,
    }))
  }, [zcoreActive, zpodId, fetchZpodStorages, fetchZpodDisks, fetchZpodNfsExports, fetchZpodNfsStatus])

  useEffect(() => {
    load()
  }, [load])
  usePolling(load)

  const storages = useMemo(() => data?.storages ?? [], [data])
  const disks = useMemo(() => data?.disks ?? [], [data])
  const exports = useMemo(() => data?.exports ?? [], [data])
  const diskRunning = disks.some((d) => d.status === "PENDING")
  const exportOf = (storage: string, folder: string) => exports.find((e) => e.storage === storage && e.folder === folder)
  // Exports outside /FILER/<storage>/<folder>, mostly system ones from /etc/exports: no row of the tree holds them
  const otherExports = exports.filter(
    (e) => !e.storage || !e.folder || !storages.some((s) => s.name === e.storage && s.folders.some((f) => f.name === e.folder))
  )
  const diskOf = (s: ZpodStorageView) => disks.find((d) => d.device === `/dev/${s.disk}`)

  // --- openers ---
  const openAdd = (device: string | null) => {
    setAddOnDisk(device)
    setAddOpen(true)
  }
  const openDisk = (action: DiskAction) => {
    setDiskAction(action)
    setDiskOpen(true)
  }
  const openExport = (initial: { storage: string; folder: string } | null, editing: ZpodNfsExportView | null) => {
    setExportInitial(initial)
    setExportEditing(editing)
    setExportOpen(true)
  }
  const openDelete = (s: ZpodStorageView) => {
    setDeleteTarget(s)
    setDeleteOpen(true)
  }

  const handleUnexport = async () => {
    if (!unexportTarget?.storage || !unexportTarget.folder) return
    setUnexporting(true)
    try {
      await removeZpodNfsExport(zpodId, unexportTarget.storage, unexportTarget.folder)
      toast.success(`${unexportTarget.folder} is no longer exported; its files stay`)
      setUnexportTarget(null)
      load()
    } catch (err) {
      toast.error(`Could not unexport ${unexportTarget.folder}`, { description: apiErrorMessage(err, "zpodapi refused it") })
    } finally {
      setUnexporting(false)
    }
  }

  const title = (
    <CardTitle className="flex items-center gap-2 text-base">
      <HardDrive className="h-4 w-4" />
      Storage
      {data && <Badge variant="outline" className="ml-1">{storages.length}</Badge>}
    </CardTitle>
  )

  if (!zcoreActive || unsupported) {
    return (
      <Card>
        <CardHeader className="pb-3">{title}</CardHeader>
        <CardContent>
          {unsupported ? (
            <div className="flex items-start gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Storage management needs zcore 13.7 with zboxapi 0.2.1 or later. {unsupported} STORAGE01 and NFS-01 work
                as they always have.
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Storage is read from zcore once it is ACTIVE.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  const blanks = blankDisks(disks)
  const foreign = disks.filter((d) => d.state === "foreign" && d.device)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {title}
            <div className="inline-flex overflow-hidden rounded-md border" role="tablist" aria-label="Storage view">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "border-r px-3 py-1 text-xs font-medium transition-colors last:border-r-0",
                    tab === t.key
                      ? "bg-accent text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]"
                      : "text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  {t.label}
                  {data && t.key === "storages" && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">{storages.length}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {isMaintainer && (
            <div className="flex flex-wrap gap-2">
              {tab === "storages" && (
                <Button variant="outline" size="sm" className="gap-1.5" disabled={!storages.length} onClick={() => openExport(null, null)}>
                  <Share2 className="h-3.5 w-3.5" />
                  Export Folder
                </Button>
              )}
              <span title={diskRunning ? DISK_RUN_RUNNING : undefined}>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={diskRunning && !blanks.length} onClick={() => openAdd(null)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Storage
                </Button>
              </span>
            </div>
          )}
        </div>
        {failed && <p className="mt-2 text-xs text-muted-foreground">{failed}</p>}
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-sm text-muted-foreground">Reading the storage state from zcore…</p>
        ) : tab === "storages" ? (
          <>
            {data.status && <NfsStatusLine status={data.status} exports={exports} zcoreFqdn={zcoreFqdn} networks={networks} />}
            <div className="overflow-x-auto">
              <Table className="[&_td]:px-2.5 [&_td]:py-2 [&_td]:align-middle [&_th]:h-10 [&_th]:px-2.5">
                <TableHeader>
                  <TableRow>
                    <TableHead>Storage · Folder</TableHead>
                    <TableHead>Used · Owner, mode</TableHead>
                    <TableHead>Mount · Path</TableHead>
                    <TableHead className="hidden xl:table-cell">Disk</TableHead>
                    <TableHead>NFS clients · Access</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="w-[72px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storages.map((s) => {
                    const open = !storagesFolded[s.name]
                    return [
                      <StorageRow
                        key={s.name}
                        s={s}
                        open={open}
                        isMaintainer={isMaintainer}
                        onToggle={() => setStorageFolded(s.name, open)}
                        onGrow={() => {
                          const d = diskOf(s)
                          if (d) openDisk({ kind: "grow", disk: d })
                        }}
                        growDisabled={!diskOf(s) ? "Its disk is not in the disk list" : diskRunning ? DISK_RUN_RUNNING : undefined}
                        onAddFolder={() => setFolderTarget({ storage: s, folder: null })}
                        onDelete={() => openDelete(s)}
                      />,
                      ...(open
                        ? s.folders.map((f, i) => (
                            <FolderRow
                              key={`${s.name}/${f.name}`}
                              f={f}
                              last={i === s.folders.length - 1}
                              exp={exportOf(s.name, f.name)}
                              status={data.status}
                              zcoreFqdn={zcoreFqdn}
                              networks={networks}
                              isMaintainer={isMaintainer}
                              onExport={() => openExport({ storage: s.name, folder: f.name }, null)}
                              onEditExport={(e) => openExport(null, e)}
                              onUnexport={setUnexportTarget}
                              onOwnerMode={() => setFolderTarget({ storage: s, folder: f })}
                              onRemove={() => setFolderRemove({ storage: s.name, folder: f })}
                            />
                          ))
                        : []),
                    ]
                  })}
                  {otherExports.length > 0 && (
                    <OtherExportRows
                      exports={otherExports}
                      open={!storagesFolded[OTHER_EXPORTS]}
                      onToggle={() => setStorageFolded(OTHER_EXPORTS, !storagesFolded[OTHER_EXPORTS])}
                      status={data.status}
                      zcoreFqdn={zcoreFqdn}
                      networks={networks}
                    />
                  )}
                  {storages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-muted-foreground">
                        No storage on this zPod.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {(blanks.length > 0 || foreign.length > 0) && (
              <div className="mt-2 space-y-1.5">
                {blanks.map((d) => (
                  <div key={d.device} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                    <HardDrive className="h-4 w-4 text-[#94e2d5]" />
                    <span className="font-mono">{d.device}</span>
                    <span className="text-muted-foreground">{d.size_gb} GiB blank disk, no storage on it yet</span>
                    {isMaintainer && (
                      <div className="ml-auto flex gap-2">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => openAdd(d.device)}>
                          Create storage on it
                        </Button>
                        <RemoveDiskButton disk={d} diskRunning={diskRunning} onRemove={() => openDisk({ kind: "remove", disk: d })} />
                      </div>
                    )}
                  </div>
                ))}
                {foreign.map((d) => (
                  <div key={d.device} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                    <HardDrive className="h-4 w-4 text-[#fab387]" />
                    <span className="font-mono">{d.device}</span>
                    <span className="text-muted-foreground">
                      {d.size_gb} GiB, not blank and not mounted.{" "}
                      {d.kind === "user" && (
                        <>
                          Mount it again with <span className="font-mono text-foreground/80">zcli zpod storage adopt</span>.
                        </>
                      )}
                    </span>
                    {isMaintainer && (
                      <div className="ml-auto">
                        <RemoveDiskButton disk={d} diskRunning={diskRunning} onRemove={() => openDisk({ kind: "remove", disk: d })} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <ZpodStorageLayout disks={disks} storages={storages} exports={exports} zcoreFqdn={zcoreFqdn} />
        )}
      </CardContent>

      {isMaintainer && (
        <>
          <ZpodStorageAddDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            zpodId={zpodId}
            zpodName={zpodName}
            storages={storages}
            disks={disks}
            initialDisk={addOnDisk}
            onChanged={load}
          />
          <ZpodDiskDialog open={diskOpen} onOpenChange={setDiskOpen} zpodId={zpodId} action={diskAction} onChanged={load} />
          {deleteTarget && (
            <ZpodStorageDeleteDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              zpodId={zpodId}
              zpodName={zpodName}
              storage={storages.find((s) => s.name === deleteTarget.name) ?? deleteTarget}
              disk={diskOf(deleteTarget)}
              exports={exports.filter((e) => e.storage === deleteTarget.name)}
              onChanged={load}
            />
          )}
          <ZpodStorageExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            zpodId={zpodId}
            zcoreFqdn={zcoreFqdn}
            storages={storages}
            networks={networks}
            initial={exportInitial}
            editing={exportEditing}
            onChanged={load}
          />
          {folderTarget && (
            <ZpodStorageFolderDialog
              open={!!folderTarget}
              onOpenChange={(o) => !o && setFolderTarget(null)}
              zpodId={zpodId}
              storage={folderTarget.storage}
              folder={folderTarget.folder}
              onChanged={load}
            />
          )}
          {folderRemove && (
            <ZpodStorageFolderRemoveDialog
              open={!!folderRemove}
              onOpenChange={(o) => !o && setFolderRemove(null)}
              zpodId={zpodId}
              storage={folderRemove.storage}
              folder={folderRemove.folder}
              onChanged={load}
            />
          )}
          <ConfirmationDialog
            open={!!unexportTarget}
            onOpenChange={(o) => !o && setUnexportTarget(null)}
            title={`Unexport ${unexportTarget?.folder ?? ""}?`}
            description={
              <>
                <span className="font-mono">{unexportTarget?.path}</span> stops being served over NFS; clients that have it
                mounted lose access. The folder and its files stay.
              </>
            }
            onConfirm={handleUnexport}
            loading={unexporting}
            confirmText="Unexport"
            icon={<Undo2 className="h-5 w-5 text-destructive" />}
          />
        </>
      )}
    </Card>
  )
}

// --- Storages tab ---

function UsageCell({ s }: { s: ZpodStorageView }) {
  const pct = usagePercent(s)
  const color = usageColor(pct)
  const bar = (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-300 ring-1 ring-inset ring-black/10 dark:bg-background dark:ring-white/5">
      <div className={cn("h-full", color.bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      {/* The whole bar and its percentage open the card, not just the number */}
      <HoverCardTrigger asChild>
        <div tabIndex={0} className="flex min-w-[8rem] cursor-default items-center gap-2 py-1">
          {bar}
          <span className={cn("whitespace-nowrap font-mono text-xs", color.text, color.strong && "font-semibold")}>
            {pct.toFixed(1)}%
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-auto min-w-[220px] border-[#313244] bg-[#181825] px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-zinc-100">{s.name}</p>
          <span className={cn("font-mono text-xs", color.text, color.strong && "font-semibold")}>{pct.toFixed(1)}%</span>
        </div>
        <div className="mt-1.5">{bar}</div>
        <p className="mt-2 font-mono text-xs text-zinc-300">
          {formatGiB(s.used_bytes)} of {formatGiBWhole(s.size_bytes)}
        </p>
        <p className="text-xs text-zinc-400">{formatGiB(s.available_bytes)} free</p>
      </HoverCardContent>
    </HoverCard>
  )
}

function StorageRow({
  s,
  open,
  isMaintainer,
  onToggle,
  onGrow,
  growDisabled,
  onAddFolder,
  onDelete,
}: {
  s: ZpodStorageView
  open: boolean
  isMaintainer: boolean
  onToggle: () => void
  onGrow: () => void
  growDisabled: string | undefined
  onAddFolder: () => void
  onDelete: () => void
}) {
  const exported = s.folders.filter((f) => f.exported).length
  const zcoreFiler = s.kind === "zcore" || s.protected
  return (
    <TableRow className={cn("bg-muted/30 hover:bg-muted/50", open && s.folders.length > 0 && "border-b-0")}>
      <TableCell className="whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} the folders of ${s.name}`}
            disabled={!s.folders.length}
            onClick={onToggle}
            className="grid h-5 w-5 place-items-center rounded-sm text-muted-foreground hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
          </button>
          <HardDrive className="h-4 w-4 text-[#cba6f7]" />
          <span className="font-mono font-semibold">{s.name}</span>
          <StorageLayoutBadge layout={s.layout} />
          {s.folders.length > 0 && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]" title={`${exported} of ${s.folders.length} folders exported`}>
              {exported}/{s.folders.length}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <UsageCell s={s} />
      </TableCell>
      <TableCell className="font-mono text-xs">
        <span className="text-[#89b4fa]">{s.mountpoint}</span>
        {s.fstype && <span className="text-muted-foreground"> · {s.fstype}</span>}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap font-mono text-xs text-muted-foreground xl:table-cell">
        {s.disk}
        {s.layout === "lvm" && s.vg && s.lv && <span className="text-[#f5c2e7]/80"> · {s.vg}/{s.lv}</span>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {s.folders.length ? `${exported} of ${s.folders.length} folders exported` : "no folders"}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={storageKindClasses(s.kind)}>
          {s.kind}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {isMaintainer && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${s.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <MenuItem
                icon={<Expand />}
                label="Grow…"
                hint={growDisabled ?? `Grow ${s.disk} in vCenter, then ${s.name} into it, online`}
                disabled={!!growDisabled}
                onSelect={onGrow}
              />
              <MenuItem icon={<FolderPlus />} label="Add folder…" hint={`A folder in ${s.mountpoint}`} onSelect={onAddFolder} />
              <DropdownMenuSeparator />
              <MenuItem
                icon={<Trash2 />}
                label="Delete storage…"
                destructive
                hint={zcoreFiler ? ZCORE_FILER : "Keep its data on the disk, or remove the disk too"}
                disabled={zcoreFiler}
                onSelect={onDelete}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  )
}

function FolderRow({
  f,
  last,
  exp,
  status,
  zcoreFqdn,
  networks,
  isMaintainer,
  onExport,
  onEditExport,
  onUnexport,
  onOwnerMode,
  onRemove,
}: {
  f: ZpodStorageFolderView
  last: boolean
  exp: ZpodNfsExportView | undefined
  status: ZpodNfsStatus | null
  zcoreFqdn: string
  networks: { name: string; cidr: string }[]
  isMaintainer: boolean
  onExport: () => void
  onEditExport: (e: ZpodNfsExportView) => void
  onUnexport: (e: ZpodNfsExportView) => void
  onOwnerMode: () => void
  onRemove: () => void
}) {
  const systemExport = exp?.owner === "system"
  const exportLocked = exp?.protected ? "Protected export" : systemExport ? "System export, from /etc/exports" : undefined
  const access = exp ? parseNfsOptions(exp.options) : null
  const mounts = exp ? mountsOf(status, exp) : []
  return (
    <TableRow className={cn(!last && "border-b-0")}>
      {/* h-px lets the inner div fill the cell, so the trunk joins the next row's */}
      <TableCell className="h-px !py-0">
        <div className="flex h-full min-h-[36px] items-center pl-[9px]">
          <TreeTrunk last={last} />
          <TreeConnector className="mr-1.5" />
          <Folder className={cn("h-3.5 w-3.5 shrink-0", f.exported ? "text-[#89b4fa]" : "text-muted-foreground")} />
          <span className={cn("ml-1.5 font-mono text-[13px]", !f.exported && "text-muted-foreground")}>{f.name}</span>
          {exp && mounts.length > 0 && (
            <span className="ml-1.5">
              <MountsBadge exp={exp} clients={mounts} zcoreFqdn={zcoreFqdn} networks={networks} />
            </span>
          )}
          {f.empty && (
            <Badge
              variant="outline"
              className="ml-1.5 border-[#b4befe]/35 bg-[#b4befe]/10 px-1.5 py-0 text-[10px] font-normal text-[#b4befe]"
            >
              empty
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
        {f.owner} · {f.mode}
      </TableCell>
      <TableCell className="font-mono text-xs text-[#89b4fa]/90 [overflow-wrap:anywhere]">{f.path}</TableCell>
      <TableCell className="hidden xl:table-cell" />
      <TableCell>
        {exp ? (
          <div className="flex flex-wrap items-center gap-1">
            {exp.clients.map((c) => (
              <span key={c.client} className="rounded bg-[#89b4fa]/15 px-1.5 py-0.5 font-mono text-[11px] text-[#89b4fa]">
                {c.client}
              </span>
            ))}
            <span className={cn("text-xs", access?.noRootSquash ? "text-[#fab387]" : "text-muted-foreground")}>
              {nfsAccessLabel(exp.options)}
            </span>
            {!exp.active && <span className="text-xs text-[#f38ba8]">inactive</span>}
          </div>
        ) : (
          <span className="text-xs italic text-muted-foreground/80">not exported</span>
        )}
      </TableCell>
      <TableCell>
        {f.protected || exp?.protected ? (
          <Badge variant="outline" className={storageKindClasses("protected")}>
            protected
          </Badge>
        ) : systemExport ? (
          <Badge variant="outline" className={storageKindClasses("system")}>
            system
          </Badge>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-0.5">
          {exp && <CopyShareButton zcoreFqdn={zcoreFqdn} exp={exp} />}
          {isMaintainer && !f.protected ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${f.name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {exp ? (
                  <>
                    <MenuItem
                      icon={<Pencil />}
                      label="Edit export…"
                      hint={exportLocked ?? "Clients and access"}
                      disabled={!!exportLocked}
                      onSelect={() => onEditExport(exp)}
                    />
                    <MenuItem
                      icon={<Undo2 />}
                      label="Unexport"
                      hint={exportLocked ?? "Clients lose access; the files stay"}
                      disabled={!!exportLocked}
                      onSelect={() => onUnexport(exp)}
                    />
                  </>
                ) : (
                  <MenuItem icon={<Share2 />} label="Export over NFS…" hint="Choose who can mount it" onSelect={onExport} />
                )}
                <MenuItem icon={<UserCog />} label="Change owner and mode…" hint={`Now ${f.owner}, ${f.mode}`} onSelect={onOwnerMode} />
                <DropdownMenuSeparator />
                <MenuItem
                  icon={<Trash2 />}
                  label="Remove folder…"
                  destructive
                  hint={f.exported ? "Exported: unexport it first" : f.empty ? "It is empty" : "Deletes it with everything in it"}
                  disabled={f.exported}
                  onSelect={onRemove}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : isMaintainer && f.protected ? (
            <span className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground" title="Protected: the nested ESXi datastore">
              <Lock className="h-3.5 w-3.5" />
            </span>
          ) : (
            // Keeps the copy buttons in one column whether or not a row has a menu
            <span className="w-7" />
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

/** Remove a blank or foreign disk, disabled with the reason when it cannot be. */
function RemoveDiskButton({ disk, diskRunning, onRemove }: { disk: ZpodDiskView; diskRunning: boolean; onRemove: () => void }) {
  const reason =
    disk.kind !== "user"
      ? "Created and removed with the zPod"
      : disk.id === null
        ? "Not added through zPodFactory"
        : diskRunning
          ? DISK_RUN_RUNNING
          : disk.status === "PENDING"
            ? "Its disk run is still going"
            : undefined
  return (
    <span title={reason ?? "Detached and deleted in vCenter, with its data"}>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-destructive hover:text-destructive"
        disabled={!!reason}
        onClick={onRemove}
      >
        Remove disk
      </Button>
    </span>
  )
}

/** The rows under the storages for exports that are not one of their folders, mostly system ones
 *  from /etc/exports: shown with who mounts them, changed only on zcore. */
function OtherExportRows({
  exports,
  open,
  onToggle,
  status,
  zcoreFqdn,
  networks,
}: {
  exports: ZpodNfsExportView[]
  open: boolean
  onToggle: () => void
  status: ZpodNfsStatus | null
  zcoreFqdn: string
  networks: { name: string; cidr: string }[]
}) {
  return (
    <>
      <TableRow className={cn("bg-muted/30 hover:bg-muted/50", open && "border-b-0")}>
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} the other exports`}
              onClick={onToggle}
              className="grid h-5 w-5 place-items-center rounded-sm text-muted-foreground hover:bg-accent"
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
            </button>
            <Share2 className="h-4 w-4 text-[#89b4fa]" />
            <span className="font-semibold">Other exports</span>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {exports.length}
            </Badge>
          </div>
        </TableCell>
        <TableCell colSpan={6} className="text-xs text-muted-foreground">
          Outside the storages, from /etc/exports on zcore: shown here, not changed here.
        </TableCell>
      </TableRow>
      {open &&
        exports.map((e, i) => {
          const mounts = mountsOf(status, e)
          const { noRootSquash } = parseNfsOptions(e.options)
          const last = i === exports.length - 1
          return (
            <TableRow key={e.path} className={cn(!last && "border-b-0")}>
              {/* h-px lets the inner div fill the cell, so the trunk joins the next row's */}
              <TableCell className="h-px !py-0">
                <div className="flex h-full min-h-[36px] items-center pl-[9px]">
                  <TreeTrunk last={last} />
                  <TreeConnector className="mr-1.5" />
                  <Folder className="h-3.5 w-3.5 shrink-0 text-[#89b4fa]" />
                  <span className="ml-1.5 font-mono text-[13px]">{e.path.replace(/\/+$/, "").split("/").pop() || "/"}</span>
                  {mounts.length > 0 && (
                    <span className="ml-1.5">
                      <MountsBadge exp={e} clients={mounts} zcoreFqdn={zcoreFqdn} networks={networks} />
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell />
              <TableCell className="font-mono text-xs text-[#89b4fa]/90 [overflow-wrap:anywhere]">
                {e.path}
                {!e.folder_exists && <span className="ml-1.5 font-sans text-[#f38ba8]">missing</span>}
              </TableCell>
              <TableCell className="hidden xl:table-cell" />
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  {e.clients.map((c) => (
                    <span key={c.client} className="rounded bg-[#89b4fa]/15 px-1.5 py-0.5 font-mono text-[11px] text-[#89b4fa]">
                      {c.client}
                    </span>
                  ))}
                  <span className={cn("text-xs", noRootSquash ? "text-[#fab387]" : "text-muted-foreground")}>
                    {nfsAccessLabel(e.options)}
                  </span>
                  {!e.active && <span className="text-xs text-[#f38ba8]">inactive</span>}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={storageKindClasses(e.protected ? "protected" : e.owner === "system" ? "system" : "user")}
                >
                  {e.protected ? "protected" : e.owner === "system" ? "system" : "user"}
                </Badge>
              </TableCell>
              <TableCell>
                {/* Same place as a folder's copy button: left of where its action menu sits */}
                <div className="flex items-center justify-end gap-0.5">
                  <CopyShareButton zcoreFqdn={zcoreFqdn} exp={e} />
                  <span className="w-7" />
                </div>
              </TableCell>
            </TableRow>
          )
        })}
    </>
  )
}

/** One line over the tree: the NFS server's state, how much it serves and who has something mounted. */
function NfsStatusLine({
  status,
  exports,
  zcoreFqdn,
  networks,
}: {
  status: ZpodNfsStatus
  exports: ZpodNfsExportView[]
  zcoreFqdn: string
  networks: { name: string; cidr: string }[]
}) {
  const up = status.service === "active"
  // NFSv3 reports the mounted path; NFSv4 does not, so those clients are counted on their own
  const unplaced = status.clients.filter((c) => !c.path || !exports.some((e) => trimPath(e.path) === trimPath(c.path!)))
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
      <span className="flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", up ? "bg-[#a6e3a1]" : "bg-[#f38ba8]")} />
        nfs-server {status.service}
        {status.enabled ? ", enabled" : ", not enabled at boot"}
      </span>
      <span className="text-muted-foreground">NFS {status.versions.join(" · ")}</span>
      {status.threads !== null && <span className="text-muted-foreground">{status.threads} threads</span>}
      <span className="text-muted-foreground">
        {status.exports} exports
        {status.inactive_exports.length ? `, ${status.inactive_exports.length} inactive` : ", all active"}
      </span>
      <span className="text-muted-foreground">
        {status.clients.length} {status.clients.length === 1 ? "client" : "clients"} mounted
      </span>
      {unplaced.length > 0 && <MountsBadge clients={unplaced} zcoreFqdn={zcoreFqdn} networks={networks} />}
      <span className="ml-auto text-muted-foreground">
        server <span className="font-mono text-[#89b4fa]">{zcoreFqdn}</span>
      </span>
    </div>
  )
}

const trimPath = (p: string) => p.replace(/\/+$/, "")

/** The clients that have this export mounted. Only NFSv3 reports the path; NFSv4 clients are never matched. */
function mountsOf(status: ZpodNfsStatus | null, e: ZpodNfsExportView) {
  return (status?.clients ?? []).filter((c) => c.path && trimPath(c.path) === trimPath(e.path))
}

/** A pulsing dot and a count: the hosts that have an export mounted now. Its hover card says
 *  what is mounted and how, then lists the hosts as a tree under the export. Without `exp`,
 *  these are NFS 4 clients, which do not report which export they have mounted. */
function MountsBadge({
  exp,
  clients,
  zcoreFqdn,
  networks,
}: {
  exp?: ZpodNfsExportView
  clients: ZpodNfsStatus["clients"]
  zcoreFqdn: string
  networks: { name: string; cidr: string }[]
}) {
  const n = clients.length
  const noun = n === 1 ? "client" : "clients"
  const networkOf = (ip: string) =>
    /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? networks.find((net) => cidrsOverlap(`${ip}/32`, net.cidr))?.name : undefined
  const access = exp ? parseNfsOptions(exp.options) : null
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Mounted by ${n} ${noun}`}
          className="inline-flex cursor-default items-center gap-1.5 px-1 py-0.5 font-mono text-[11px] text-[#a6e3a1]"
        >
          <PulseDot />
          {n}
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-auto min-w-[280px] max-w-[420px] border-[#313244] bg-[#181825] p-0">
        <div className="flex items-center gap-2 border-b border-[#313244] px-3 py-2">
          <PulseDot />
          <span className="text-sm font-medium">
            {exp ? "Mounted by" : "Mounted over NFS 4 by"} {n} {noun}
          </span>
        </div>
        <div className="space-y-2 px-3 py-2">
          {exp ? (
            <div className="space-y-1 text-[11px]">
              <div className="font-mono text-muted-foreground [overflow-wrap:anywhere]">
                {zcoreFqdn}:<span className="text-[#89b4fa]">{exp.path}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                <span className={cn("font-mono", access?.noRootSquash && "text-[#fab387]")}>{nfsAccessLabel(exp.options)}</span>
                <span>·</span>
                <span>
                  exported to{" "}
                  <span className="font-mono">{exp.clients.map((c) => c.client).join(", ")}</span>
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">NFS 4 does not report which export a client has mounted.</p>
          )}
          <div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Share2 className="h-3 w-3 text-[#89b4fa]" />
              <span className="font-mono">{exp ? (exp.folder ?? exp.path) : zcoreFqdn}</span>
            </div>
            {clients.map((c, i) => {
              const net = networkOf(c.client)
              return (
                <div key={`${c.client}-${i}`} className="flex min-h-[22px] items-center pl-[5px] text-[11px]">
                  <TreeTrunk last={i === n - 1} />
                  <TreeConnector className="mr-1.5 w-2.5" />
                  <Monitor className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="ml-1.5 font-mono">{c.client}</span>
                  {net && <span className="ml-1.5 truncate text-muted-foreground">{net}</span>}
                  <span className="ml-auto shrink-0 pl-4">
                    <span className="rounded bg-[#313244] px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                      NFS {c.version}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="border-t border-[#313244] px-3 py-1.5 text-[10px] text-muted-foreground">
          Live from nfs-server; refreshed with the card
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function PulseDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#a6e3a1] opacity-60 [animation-duration:2s]" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#a6e3a1]" />
    </span>
  )
}

/** Copies the share as a client mounts it, <zcore fqdn>:<export path>; a check mark confirms it. */
function CopyShareButton({ zcoreFqdn, exp }: { zcoreFqdn: string; exp: ZpodNfsExportView }) {
  const [copied, setCopied] = useState(false)
  const share = `${zcoreFqdn}:${exp.path}`
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
      title={`Copy ${share}`}
      aria-label={`Copy the NFS share ${share}`}
      onClick={async () => {
        if (await copyToClipboard(share)) {
          toast.success("NFS share copied", { description: share })
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } else toast.error("Could not copy to the clipboard")
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[#a6e3a1]" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

function MenuItem({
  icon,
  label,
  hint,
  disabled,
  destructive,
  onSelect,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  disabled?: boolean
  destructive?: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={onSelect}
      className={cn("items-start", destructive && "text-destructive focus:text-destructive")}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="grid gap-0.5">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
    </DropdownMenuItem>
  )
}
