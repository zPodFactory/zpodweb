import { Folder, HardDrive, Share2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { TreeConnector, TreeTrunk } from "@/components/tree-trunk"
import { formatGiB, formatGiBWhole, usageColor, usagePercent } from "@/lib/storage-utils"
import { storageLayoutClasses } from "@/lib/status-colors"
import { cn } from "@/lib/utils"
import type { ZpodDiskView, ZpodNfsExportView, ZpodStorageView } from "@/types"

/** The zcore VM's disks side by side, each with what is on it: partition or volume,
 *  filesystem and mount, then its folders and who they are exported to. */
export function ZpodStorageLayout({
  disks,
  storages,
  exports,
  zcoreFqdn,
}: {
  disks: ZpodDiskView[]
  storages: ZpodStorageView[]
  exports: ZpodNfsExportView[]
  zcoreFqdn: string
}) {
  const visible = disks.filter((d) => d.device)
  // What the VM has for storage: every disk but zcore's own system disk
  const assignedGb = visible.filter((d) => d.state !== "system").reduce((sum, d) => sum + d.size_gb, 0)
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono font-medium text-amber-400/90">{zcoreFqdn}</span>
          <span>· SCSI controller 0 · {visible.length} disks</span>
          <span className="ml-auto">
            <span className="font-mono font-semibold text-[#b4befe]">
              {assignedGb >= 1024 ? `${(assignedGb / 1024).toFixed(2)} TiB` : `${assignedGb} GiB`}
            </span>{" "}
            assigned for storage <span className="text-muted-foreground/70">(system disk not counted)</span>
          </span>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {visible.map((d) => (
            <DiskColumn
              key={d.device}
              disk={d}
              storage={storages.find((s) => `/dev/${s.disk}` === d.device)}
              exports={exports}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" />virtual disk (vCenter)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-[#cba6f7]/60 bg-[#cba6f7]/10" />filesystem, mounted under /FILER</span>
        <span className="flex items-center gap-1.5"><Folder className="h-3.5 w-3.5 text-[#89b4fa]" />folder exported over NFS</span>
        <span className="flex items-center gap-1.5"><Folder className="h-3.5 w-3.5" />folder not exported</span>
      </div>
    </div>
  )
}

function DiskColumn({
  disk,
  storage,
  exports,
}: {
  disk: ZpodDiskView
  storage: ZpodStorageView | undefined
  exports: ZpodNfsExportView[]
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background/60 p-2.5">
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm font-semibold">{disk.device}</span>
        <span className="font-mono text-sm font-semibold text-[#b4befe]">{disk.size_gb} GiB</span>
        {disk.scsi && <span className="font-mono text-xs text-muted-foreground">{disk.scsi}</span>}
        <Badge variant="outline" className="ml-auto px-1.5 py-0 text-[10px]">
          {disk.kind}
        </Badge>
      </div>

      {disk.state === "system" && <Block muted>zcore system disk: the OS, never changed here</Block>}
      {disk.state === "blank" && <Block dashed>Blank: nothing on it yet. Create a storage on it from the Storages tab.</Block>}
      {disk.state === "foreign" && (
        <Block dashed>Not blank, not mounted: a filesystem kept by a storage delete, or something zcore did not make.</Block>
      )}
      {disk.status === "PENDING" && <Block dashed>A disk run is in progress.</Block>}

      {storage && (
        <HoverCard openDelay={250} closeDelay={100}>
          {/* The box names the layout only; hovering it shows the whole disk-to-mount chain */}
          <HoverCardTrigger asChild>
            <div tabIndex={0} className="cursor-default rounded border border-border/80 p-2 transition-colors hover:border-border">
              <StorageLayoutBadge layout={storage.layout} />
              <FilesystemBlock storage={storage} exports={exports} />
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="right" align="start" className="w-auto min-w-[260px] border-[#313244] bg-[#181825] px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="font-mono font-semibold">{storage.name}</span>
              <StorageLayoutBadge layout={storage.layout} />
            </div>
            <LayoutChain disk={disk} storage={storage} />
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  )
}

function FilesystemBlock({ storage, exports }: { storage: ZpodStorageView; exports: ZpodNfsExportView[] }) {
  const pct = usagePercent(storage)
  const color = usageColor(pct)
  return (
    <div className="mt-1.5 rounded border border-[#cba6f7]/50 bg-[#cba6f7]/[0.07] p-2">
      <div className="flex items-center gap-2 text-xs">
        <HardDrive className="h-3.5 w-3.5 text-[#cba6f7]" />
        <span className="font-mono font-semibold">{storage.name}</span>
        <span className="text-muted-foreground">{storage.fstype ?? "?"}</span>
        <span className={cn("ml-auto font-mono", color.text, color.strong && "font-semibold")}>{pct.toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-300 ring-1 ring-inset ring-black/10 dark:bg-background dark:ring-white/5">
        <div className={cn("h-full", color.bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {formatGiB(storage.used_bytes)} of {formatGiBWhole(storage.size_bytes)} ·{" "}
        <span className="font-mono text-[#89b4fa]">{storage.mountpoint}</span>
      </div>
      {storage.folders.length > 0 && (
        <div className="mt-1.5">
          {storage.folders.map((f, i) => {
            const exp = exports.find((e) => e.storage === storage.name && e.folder === f.name)
            return (
              <div key={f.name} className="flex min-h-[24px] items-center pl-[6px] text-xs">
                <TreeTrunk last={i === storage.folders.length - 1} />
                <TreeConnector className="mr-1.5" />
                <Folder className={cn("h-3.5 w-3.5 shrink-0", f.exported ? "text-[#89b4fa]" : "text-muted-foreground")} />
                <span className="ml-1.5 truncate font-mono">{f.name}</span>
                {exp && (
                  <span className="ml-auto flex min-w-0 items-center gap-1 pl-2 text-[11px] text-[#89b4fa]">
                    <Share2 className="h-3 w-3 shrink-0" />
                    <span className="truncate font-mono">{exp.clients.map((c) => c.client).join(", ")}</span>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** "raw" or "LVM"; only LVM is coloured. */
export function StorageLayoutBadge({ layout, className }: { layout: "raw" | "lvm"; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("px-1.5 py-0 font-mono text-[10px]", storageLayoutClasses(layout), className)}
      title={layout === "lvm" ? "LVM: GPT partition, volume group, logical volume" : "Raw: one GPT partition"}
    >
      {layout === "lvm" ? "LVM" : "raw"}
    </Badge>
  )
}

/** Disk, partition, then VG and LV for LVM, then the filesystem and its mount: each level
 *  indented under the one it lives on. */
function LayoutChain({ disk, storage }: { disk: ZpodDiskView; storage: ZpodStorageView }) {
  const part = storage.layout === "lvm" ? `${storage.disk}1` : storage.device.replace(/^\/dev\//, "")
  const levels: { label: string; name: string; detail: string; className?: string }[] = [
    { label: "disk", name: disk.device ?? storage.disk, detail: `${disk.size_gb} GiB${disk.scsi ? ` · ${disk.scsi}` : ""}` },
    { label: "part", name: part, detail: "GPT partition" },
    ...(storage.layout === "lvm"
      ? [
          { label: "vg", name: storage.vg ?? "?", detail: "volume group", className: "text-[#f5c2e7]" },
          { label: "lv", name: storage.lv ?? "?", detail: "logical volume", className: "text-[#f5c2e7]" },
        ]
      : []),
    {
      label: "fs",
      name: storage.fstype ?? "?",
      detail: `${formatGiBWhole(storage.size_bytes)} · ${storage.mountpoint}`,
      className: "text-[#cba6f7]",
    },
  ]
  return (
    <div className="space-y-1 text-[11px]">
      {levels.map((l, i) => (
        <div key={l.label} className="flex items-center" style={{ paddingLeft: Math.max(i - 1, 0) * 14 }}>
          {i > 0 && <span aria-hidden className="mr-1.5 h-[9px] w-2.5 shrink-0 -translate-y-1 border-b border-l border-zinc-500/70" />}
          <span className="w-7 shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">{l.label}</span>
          <span className={cn("font-mono", l.className)}>{l.name}</span>
          <span className="ml-2 whitespace-nowrap text-muted-foreground">{l.detail}</span>
        </div>
      ))}
    </div>
  )
}

function Block({ children, muted, dashed }: { children: React.ReactNode; muted?: boolean; dashed?: boolean }) {
  return (
    <div
      className={cn(
        "rounded border px-2 py-1.5 text-xs text-muted-foreground",
        dashed && "border-dashed",
        muted && "bg-muted/40"
      )}
    >
      {children}
    </div>
  )
}
