import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { useSort } from "@/hooks/use-sort"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { BookOpen, GitBranch, CheckCircle2, XCircle, RefreshCw, Package } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import type { ComponentFull, Library } from "@/types"
import { formatDateTime } from "@/lib/utils"

function daysAgo(dateStr: string): { label: string; days: number } {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return { label: "today", days }
  if (days === 1) return { label: "1 day ago", days }
  return { label: `${days} days ago`, days }
}

function ageBadgeClasses(days: number): string {
  if (days < 5) return "bg-[#a6e3a1]/15 text-[#a6e3a1] border-[#a6e3a1]/30"
  if (days < 15) return "bg-[#f9e2af]/15 text-[#f9e2af] border-[#f9e2af]/30"
  if (days < 30) return "bg-[#fab387]/15 text-[#fab387] border-[#fab387]/30"
  return "bg-[#f38ba8]/15 text-[#f38ba8] border-[#f38ba8]/30"
}

/** A library's component count. After a resync from this page it pops each time it changes, so the
 *  components the resync adds show as they land; otherwise (opening the page) it stays still */
function ComponentCount({
  name,
  total,
  active,
  live,
}: {
  name: string
  total: number
  active: number
  live: boolean
}) {
  const pop = live ? "duration-500 animate-in zoom-in-150 fade-in" : ""
  return (
    <Link
      to={`/components?library=${encodeURIComponent(name)}`}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#89b4fa]"
      title={`List ${name}'s components on the Components page`}
    >
      <Package className="h-3.5 w-3.5" />
      {/* Keyed by the count: a new number mounts again and plays its entrance */}
      <span key={total} className={`font-semibold tabular-nums text-foreground ${pop}`}>
        {total}
      </span>
      component{total !== 1 ? "s" : ""}
      <span className="text-muted-foreground/70">·</span>
      <span key={`a${active}`} className={`tabular-nums ${live ? "duration-500 animate-in fade-in" : ""}`}>{active}</span> active
    </Link>
  )
}

export function LibrariesPage() {
  const { fetchLibraries, fetchComponents, resyncLibrary } = useApi()
  const { user } = useAuthStore()
  const isSuperadmin = user?.superadmin ?? false
  const [libraries, setLibraries] = useState<Library[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<Set<string>>(new Set())
  // The libraries resynced from this page since it opened: only their counts pop as they change
  const [resynced, setResynced] = useState<Set<string>>(new Set())
  // Each library's components (deleted ones aside, as on the Components page), refreshed with the
  // libraries so a resync's new components show as they land
  const [components, setComponents] = useState<ComponentFull[]>([])
  const counts = useMemo(() => {
    const byLib = new Map<string, { total: number; active: number }>()
    for (const c of components) {
      if (c.status === "DELETED") continue
      const n = byLib.get(c.library_name) ?? { total: 0, active: 0 }
      n.total++
      if (c.status === "ACTIVE") n.active++
      byLib.set(c.library_name, n)
    }
    return byLib
  }, [components])
  const { sorted } = useSort(libraries, "name")

  const handleResync = async (lib: Library) => {
    setSyncing((prev) => new Set(prev).add(lib.name))
    setResynced((prev) => new Set(prev).add(lib.name))
    try {
      await resyncLibrary(String(lib.id))
      toast.success(`Resync started for "${lib.name}"`)
      loadLibraries()
    } catch {
      toast.error(`Failed to resync "${lib.name}"`)
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev)
        next.delete(lib.name)
        return next
      })
    }
  }

  const loadLibraries = useCallback(() => {
    fetchLibraries().then(setLibraries).catch(() => {})
    fetchComponents().then(setComponents).catch(() => {})
  }, [fetchLibraries, fetchComponents])

  useEffect(() => {
    fetchLibraries()
      .then(setLibraries)
      .catch(() => toast.error("Failed to fetch libraries"))
      .finally(() => setLoading(false))
    fetchComponents().then(setComponents).catch(() => {})
  }, [fetchLibraries, fetchComponents])

  usePolling(loadLibraries)

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Libraries</h1>
        <Badge variant="outline">{libraries.length} total</Badge>
      </div>

      {libraries.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">
              No libraries found
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map((lib) => (
            <Card key={lib.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4" />
                    {lib.name}
                  </CardTitle>
                  {lib.enabled ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Disabled
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {lib.description}
                </p>
                <ComponentCount
                  name={lib.name}
                  total={counts.get(lib.name)?.total ?? 0}
                  active={counts.get(lib.name)?.active ?? 0}
                  live={resynced.has(lib.name)}
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <a
                    href={lib.git_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono truncate text-primary hover:underline"
                  >
                    {lib.git_url}
                  </a>
                </div>
                <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                  <span>Created: {formatDateTime(lib.creation_date)}</span>
                  {lib.last_modified_date && (
                    <span>Modified: {formatDateTime(lib.last_modified_date)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {lib.last_modified_date && (() => {
                      const { label, days } = daysAgo(lib.last_modified_date)
                      return (
                        <Badge variant="outline" className={`text-xs ${ageBadgeClasses(days)}`}>
                          Updated {label}
                        </Badge>
                      )
                    })()}
                  </div>
                  {isSuperadmin && <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={syncing.has(lib.name)}
                    onClick={() => handleResync(lib)}
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing.has(lib.name) ? "animate-spin" : ""}`} />
                    Resync
                  </Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
