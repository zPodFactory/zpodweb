import { useTargetStore } from "@/stores/target-store"
import { IconTooltip } from "@/components/icon-tooltip"
import { useAuthStore } from "@/stores/auth-store"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Server, User, Plug, Eye, EyeOff } from "lucide-react"
import { StatusBadge } from "@/components/status-badge"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/utils"
import { DetailRow } from "@/components/detail-row"

function TokenRow({ label, value }: { label: string; value: string }) {
  const [visible, setVisible] = useState(false)
  const masked = value ? "*".repeat(Math.min(value.length, 32)) : "—"
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">
          {visible ? value : masked}
        </span>
        {value && (
          <IconTooltip label={visible ? "Hide" : "Show"}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setVisible(!visible)}
            >
              {visible ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
          </IconTooltip>
        )}
      </div>
    </div>
  )
}

export function FactoryPage() {
  const { targets, activeTargetId } = useTargetStore()
  const { user } = useAuthStore()
  const activeTarget = targets.find((t) => t.id === activeTargetId)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Factory</h1>
        {activeTarget && (
          <Badge variant="outline">
            <Plug className="mr-1 h-3 w-3" />
            Connected
          </Badge>
        )}
      </div>

      {activeTarget ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Target connection */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="h-4 w-4" />
                  Target
                </CardTitle>
                <Badge variant="secondary">{activeTarget.name}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <DetailRow label="Name" value={activeTarget.name} />
              <div className="flex justify-between py-1">
                <span className="text-sm text-muted-foreground">API URL</span>
                <a
                  href={activeTarget.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-primary hover:underline"
                >
                  {activeTarget.url}
                </a>
              </div>
              <TokenRow label="API Token" value={activeTarget.token} />
              <Separator className="my-2" />
              <DetailRow
                label="Last Connected"
                value={
                  activeTarget.lastConnected
                    ? new Date(activeTarget.lastConnected).toLocaleString("en-GB")
                    : "—"
                }
              />
            </CardContent>
          </Card>

          {/* Current user */}
          {user && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="h-4 w-4" />
                    User
                  </CardTitle>
                  {user.superadmin && (
                    <Badge variant="default">Superadmin</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <DetailRow label="Username" value={user.username} />
                <DetailRow label="Email" value={user.email} />
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <StatusBadge status={user.status} />
                </div>
                <Separator className="my-2" />
                <DetailRow
                  label="Created"
                  value={formatDateTime(user.creation_date)}
                />
                <DetailRow
                  label="Last Connection"
                  value={
                    user.last_connection_date
                      ? formatDateTime(user.last_connection_date)
                      : "—"
                  }
                />
                {user.description && (
                  <>
                    <Separator className="my-2" />
                    <DetailRow label="Description" value={user.description} />
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">
              No active target connection
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
