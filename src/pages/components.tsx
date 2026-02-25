import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { SortableHead } from "@/components/sortable-head"
import { Skeleton } from "@/components/ui/skeleton"
import { ComponentUploadDialog } from "@/components/component-upload-dialog"
import { toast } from "sonner"
import { Search, Upload, AlertTriangle, Loader2, Layers } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import type { ComponentFull, Profile, ProfileItem } from "@/types"
import { StatusBadge } from "@/components/status-badge"
import { statusClasses } from "@/lib/status-colors"
import { Switch } from "@/components/ui/switch"

function DownloadStatusBadge({ downloadStatus }: { downloadStatus: string }) {
  const pct = Number(downloadStatus)
  if (!isNaN(pct)) {
    return (
      <Badge variant="outline" className={`gap-1 ${statusClasses("DOWNLOADING")}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Downloading... ({pct}%)
      </Badge>
    )
  }
  const labelMap: Record<string, string> = {
    SCHEDULED: "Scheduled",
    VERIFYING_CHECKSUM: "Verifying Checksum",
    DOWNLOAD_COMPLETED: "Download Completed",
  }
  const label = labelMap[downloadStatus] ?? downloadStatus
  const isProgress = downloadStatus === "SCHEDULED" || downloadStatus === "VERIFYING_CHECKSUM"
  const colorClass = downloadStatus === "DOWNLOAD_COMPLETED"
    ? statusClasses("ACTIVE")
    : downloadStatus === "SCHEDULED"
      ? statusClasses("PENDING")
      : statusClasses("DOWNLOADING")
  return (
    <Badge variant="outline" className={`gap-1 ${colorClass}`}>
      {isProgress && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </Badge>
  )
}

export function ComponentsPage() {
  const { fetchComponents, fetchProfiles, enableComponent, disableComponent } = useApi()
  const { user } = useAuthStore()
  const isSuperadmin = user?.superadmin ?? false
  const [components, setComponents] = useState<ComponentFull[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "IN_PROGRESS">("ACTIVE")
  const [showUpload, setShowUpload] = useState(false)
  const [toggling, setToggling] = useState<Set<number>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<ComponentFull | null>(null)

  const loadComponents = useCallback(() => {
    fetchComponents()
      .then(setComponents)
      .catch(() => toast.error("Failed to fetch components"))
      .finally(() => setLoading(false))
  }, [fetchComponents])

  const loadProfiles = useCallback(() => {
    fetchProfiles()
      .then(setProfiles)
      .catch(() => {})
  }, [fetchProfiles])

  useEffect(() => {
    loadComponents()
    loadProfiles()
  }, [loadComponents, loadProfiles])

  usePolling(loadComponents)
  usePolling(loadProfiles, 30)

  // Build a map of component_uid → list of profile names that use it
  const profilesByComponent = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const profile of profiles) {
      const items = profile.profile.flat() as ProfileItem[]
      const uids = new Set(items.map((item) => item.component_uid))
      for (const uid of uids) {
        const list = map.get(uid)
        if (list) list.push(profile.name)
        else map.set(uid, [profile.name])
      }
    }
    return map
  }, [profiles])

  const filtered = components.filter((c) => {
    const matchesText =
      c.component_name.toLowerCase().includes(filter.toLowerCase()) ||
      c.component_uid.toLowerCase().includes(filter.toLowerCase()) ||
      c.component_description.toLowerCase().includes(filter.toLowerCase())
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && c.status === "ACTIVE") ||
      (statusFilter === "IN_PROGRESS" && !!c.download_status && (c.download_status === "SCHEDULED" || c.download_status === "VERIFYING_CHECKSUM" || !isNaN(Number(c.download_status))))
    return matchesText && matchesStatus
  })

  const { sorted, sort, toggleSort } = useSort(filtered, "component_uid")

  const handleToggleConfirmed = async () => {
    if (!confirmTarget) return
    const comp = confirmTarget
    setConfirmTarget(null)
    setToggling((prev) => new Set(prev).add(comp.id))
    try {
      if (comp.status === "ACTIVE") {
        await disableComponent(comp.id)
        toast.success(`"${comp.component_uid}" disabled`)
      } else {
        await enableComponent(comp.id)
        toast.success(`"${comp.component_uid}" enabled`)
      }
      loadComponents()
    } catch {
      toast.error(`Failed to ${comp.status === "ACTIVE" ? "disable" : "enable"} "${comp.component_uid}"`)
    } finally {
      setToggling((prev) => {
        const next = new Set(prev)
        next.delete(comp.id)
        return next
      })
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Components</h1>
          <Badge variant="outline">{sorted.length} / {components.length}</Badge>
        </div>
        {isSuperadmin && (
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="mr-1 h-3 w-3" />
            Upload
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter components..."
            className="pl-8"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex border">
          {(["ACTIVE", "IN_PROGRESS", "ALL"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "ghost"}
              className="text-xs"
              onClick={() => setStatusFilter(s)}
            >
              {s === "ALL" ? "All" : s === "ACTIVE" ? "Active" : "In Progress"}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No components found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="UID" sortKey="component_uid" sort={sort} onToggle={toggleSort} />
                  <SortableHead label="Name" sortKey="component_name" sort={sort} onToggle={toggleSort} />
                  <SortableHead label="Version" sortKey="component_version" sort={sort} onToggle={toggleSort} />
                  <SortableHead label="Library" sortKey="library_name" sort={sort} onToggle={toggleSort} className="hidden md:table-cell" />
                  <SortableHead label="Description" sortKey="component_description" sort={sort} onToggle={toggleSort} className="hidden lg:table-cell" />
                  <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
                  {isSuperadmin && <TableHead className="w-[80px]">Profiles</TableHead>}
                  {isSuperadmin && <TableHead className="w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((comp) => (
                  <TableRow key={comp.id}>
                    <TableCell className="font-mono whitespace-nowrap">
                      {comp.component_uid}
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {comp.component_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline">{comp.component_version}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {comp.library_name}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[300px] truncate">
                      {comp.component_description}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {comp.status !== "ACTIVE" && comp.download_status ? (
                        <DownloadStatusBadge downloadStatus={comp.download_status} />
                      ) : (
                        <StatusBadge status={comp.status} />
                      )}
                    </TableCell>
                    {isSuperadmin && <TableCell>
                      {(() => {
                        const names = profilesByComponent.get(comp.component_uid) ?? []
                        if (names.length === 0) {
                          return (
                            <Badge variant="outline" className="text-muted-foreground">
                              0
                            </Badge>
                          )
                        }
                        return (
                          <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <Badge variant="outline" className="cursor-default border-[#94e2d5]/40 bg-[#94e2d5]/10 text-[#94e2d5]">
                                {names.length}
                              </Badge>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-auto min-w-[200px] px-4 py-3 bg-[#181825] border-[#313244]" side="left">
                              <p className="text-sm font-bold text-zinc-100">
                                Used in {names.length} profile{names.length > 1 ? "s" : ""}
                              </p>
                              <p className="text-xs font-medium text-zinc-400 mt-4 mb-1">Profiles:</p>
                              <div className="ml-2">
                                {names.map((name, i) => (
                                  <div
                                    key={name}
                                    className="flex items-center min-h-[28px] text-sm"
                                  >
                                    <div className="flex flex-col items-center w-0.5 shrink-0 self-stretch">
                                      <div className={`flex-1 w-full${i === 0 ? "" : " bg-zinc-600/60"}`} />
                                      <span className="h-[5px] w-[5px] rounded-full bg-zinc-400 shrink-0" />
                                      <div className={`flex-1 w-full${i === names.length - 1 ? "" : " bg-zinc-600/60"}`} />
                                    </div>
                                    <span className="w-3.5 border-t border-zinc-500/70 shrink-0" />
                                    <Link
                                      to={`/profiles?profile=${encodeURIComponent(name)}`}
                                      className="flex items-center gap-1.5 ml-1.5 text-zinc-300 hover:text-[#94e2d5] transition-colors"
                                    >
                                      <Layers className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{name}</span>
                                    </Link>
                                  </div>
                                ))}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        )
                      })()}
                    </TableCell>}
                    {isSuperadmin && (
                      <TableCell>
                        <HoverCard openDelay={300} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <span className="cursor-default">
                              <Switch
                                checked={comp.status === "ACTIVE"}
                                disabled={toggling.has(comp.id)}
                                onCheckedChange={() => setConfirmTarget(comp)}
                              />
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-[260px] px-4 py-3 bg-[#181825] border-[#313244]" side="left">
                            <p className="text-sm font-semibold text-zinc-100">
                              {comp.status === "ACTIVE" ? "Disable" : "Enable"} component
                            </p>
                            <p className="text-sm text-zinc-400 mt-1">
                              {comp.status === "ACTIVE"
                                ? "Disabling will remove this component from the list available for profiles and zpod deployments."
                                : "Enabling will download and verify the component, making it available for use in profiles and zpod deployments."}
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ComponentUploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        onUploadComplete={loadComponents}
      />

      {/* Enable / Disable confirmation dialog */}
      <Dialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {confirmTarget?.status === "ACTIVE" ? "Disable" : "Enable"} component
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.status === "ACTIVE" ? (
                <>
                  Are you sure you want to disable{" "}
                  <span className="font-semibold">{confirmTarget?.component_uid}</span>?
                  This will remove it from the list of components available for profiles and zpod deployments.
                </>
              ) : (
                <>
                  Are you sure you want to enable{" "}
                  <span className="font-semibold">{confirmTarget?.component_uid}</span>?
                  This will download and verify the component, making it available for use in profiles and zpod deployments.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmTarget(null)}
              disabled={toggling.has(confirmTarget?.id ?? -1)}
            >
              Cancel
            </Button>
            <Button
              variant={confirmTarget?.status === "ACTIVE" ? "destructive" : "default"}
              onClick={handleToggleConfirmed}
              disabled={toggling.has(confirmTarget?.id ?? -1)}
            >
              {toggling.has(confirmTarget?.id ?? -1) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {confirmTarget?.status === "ACTIVE" ? "Disable" : "Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
