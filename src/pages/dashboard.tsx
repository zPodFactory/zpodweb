import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import {
  Server,
  Activity,
  Hammer,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"
import type { Zpod, Profile, ProfileItem } from "@/types"
import { ZpodStatus } from "@/types"
import { StatusBadge } from "@/components/status-badge"
import {
  HoverCard,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { BuildProgressHoverContent } from "@/components/build-progress-hover"
import { buildHoverRows } from "@/lib/build-progress"
import { flattenProfileItems } from "@/lib/profile-utils"
import { formatDateTime } from "@/lib/utils"
import { Link } from "react-router"

const BAR_PALETTE = [
  "#89b4fa", "#f5c2e7", "#a6e3a1", "#fab387", "#f38ba8",
  "#f5c2e7", "#f5c2e7", "#f5c2e7", "#74c7ec", "#b4befe",
  "#f5c2e7", "#89dceb", "#f5c2e7", "#f5e0dc",
]

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-zinc-200">{label}</p>
      <p className="text-sm font-bold text-[#89b4fa]">{payload[0].value} zPod{payload[0].value !== 1 ? "s" : ""}</p>
    </div>
  )
}

export function DashboardPage() {
  const { fetchZpods, fetchProfiles } = useApi()
  const [zpods, setZpods] = useState<Zpod[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const loadZpods = useCallback(() => {
    fetchZpods().then(setZpods).catch(() => {})
  }, [fetchZpods])

  useEffect(() => {
    Promise.all([fetchZpods(), fetchProfiles()])
      .then(([z, p]) => { setZpods(z); setProfiles(p) })
      .catch(() => toast.error("Failed to fetch zpods"))
      .finally(() => setLoading(false))
  }, [fetchZpods, fetchProfiles])

  usePolling(loadZpods)

  const total = zpods.length
  const active = zpods.filter((z) => z.status === ZpodStatus.ACTIVE).length
  const building = zpods.filter(
    (z) =>
      z.status === ZpodStatus.BUILDING ||
      z.status === ZpodStatus.CONFIG_SCRIPTS ||
      z.status === ZpodStatus.PENDING
  ).length
  const failed = zpods.filter(
    (z) =>
      z.status === ZpodStatus.DEPLOY_FAILED ||
      z.status === ZpodStatus.DESTROY_FAILED
  ).length

  const profileCounts = Object.entries(
    zpods.reduce(
      (acc, z) => {
        const p = z.profile || "unknown"
        acc[p] = (acc[p] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  )
    .map(([profile, count]) => ({ profile, count }))
    .sort((a, b) => b.count - a.count)

  const { profileComponentCounts, profileStepsMap } = useMemo(() => {
    const counts = new Map<string, number>()
    const steps = new Map<string, (ProfileItem | ProfileItem[])[]>()
    for (const p of profiles) {
      counts.set(p.name, flattenProfileItems(p.profile).length)
      steps.set(p.name, p.profile)
    }
    return { profileComponentCounts: counts, profileStepsMap: steps }
  }, [profiles])

  const recentZpods = [...zpods]
    .sort(
      (a, b) =>
        new Date(b.creation_date).getTime() -
        new Date(a.creation_date).getTime()
    )
    .slice(0, 5)

  const stats = [
    { label: "Total zPods", value: total, icon: Server },
    { label: "Active", value: active, icon: Activity },
    { label: "Building", value: building, icon: Hammer },
    { label: "Failed", value: failed, icon: AlertTriangle },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center bg-muted">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Profile breakdown chart */}
      {profileCounts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">zPods per Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={profileCounts}
                margin={{ left: 10, right: 10, bottom: 5 }}
              >
                <XAxis
                  dataKey="profile"
                  tick={{ fontSize: 11, fill: "#a6adc8" }}
                  tickLine={false}
                  axisLine={{ stroke: "#45475a" }}
                  interval={0}
                />
                <YAxis hide />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "#585b7033" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {profileCounts.map((_, i) => (
                    <Cell
                      key={i}
                      fill={BAR_PALETTE[i % BAR_PALETTE.length]}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent zPods table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent zPods</CardTitle>
        </CardHeader>
        <CardContent>
          {recentZpods.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No zpods found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Domain
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Profile
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Endpoint
                  </TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentZpods.map((zpod) => {
                  const totalFromProfile = profileComponentCounts.get(zpod.profile) ?? 0
                  const done = (zpod.components ?? []).filter(
                    (c) => c.status === "ACTIVE"
                  ).length
                  const showProgress =
                    zpod.status !== "ACTIVE" &&
                    zpod.status !== "DELETED" &&
                    !zpod.status.endsWith("_FAILED") &&
                    totalFromProfile > 0
                  const pct = totalFromProfile > 0
                    ? Math.round((done / totalFromProfile) * 100)
                    : 0
                  const deployedComponents = zpod.components ?? []
                  const profileSteps = profileStepsMap.get(zpod.profile) ?? []
                  const deployedByUid = new Map(deployedComponents.map((c) => [c.component.component_uid, c]))
                  const hoverRows = buildHoverRows(profileSteps)
                  return (
                    <React.Fragment key={zpod.id}>
                      <TableRow className={showProgress ? "border-b-0" : ""}>
                        <TableCell className="font-medium">
                          <Link
                            to={`/zpods/${zpod.id}`}
                            className="hover:underline text-primary"
                          >
                            {zpod.name}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {zpod.domain}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {zpod.profile}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {zpod.endpoint?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(zpod.creation_date)}
                        </TableCell>
                        <TableCell>
                          {showProgress ? (
                            <HoverCard openDelay={200} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <span className="cursor-default">
                                  <StatusBadge status={zpod.status} />
                                </span>
                              </HoverCardTrigger>
                              <BuildProgressHoverContent
                                creationDate={zpod.creation_date}
                                pct={pct}
                                hoverRows={hoverRows}
                                deployedByUid={deployedByUid}
                              />
                            </HoverCard>
                          ) : (
                            <StatusBadge status={zpod.status} />
                          )}
                        </TableCell>
                      </TableRow>
                      {showProgress && (
                        <TableRow>
                          <TableCell colSpan={6} className="p-0">
                            <Progress value={pct} className="h-1 w-full rounded-none" />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
