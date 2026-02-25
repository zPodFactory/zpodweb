import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useAuthStore } from "@/stores/auth-store"
import { useTargetStore } from "@/stores/target-store"
import { usePreferencesStore } from "@/stores/preferences-store"
import { useApi } from "@/hooks/use-api"
import { usePolling } from "@/hooks/use-polling"
import { isInProgressStatus } from "@/lib/status-colors"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { IconTooltip } from "@/components/icon-tooltip"
import { LogOut, ChevronDown, Settings2, Server } from "lucide-react"
import { toast } from "sonner"
import type { Zpod } from "@/types"

const INTERVAL_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "2s", value: 2 },
  { label: "5s", value: 5 },
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
]

function ZpodStats() {
  const navigate = useNavigate()
  const { fetchZpods } = useApi()
  const [zpods, setZpods] = useState<Zpod[]>([])

  const load = useCallback(() => {
    fetchZpods().then(setZpods).catch(() => {})
  }, [fetchZpods])

  useEffect(() => { load() }, [load])
  usePolling(load)

  const active = zpods.filter((z) => z.status === "ACTIVE").length
  const inProgress = zpods.filter((z) => isInProgressStatus(z.status)).length
  const failed = zpods.filter((z) => z.status.endsWith("_FAILED")).length

  if (zpods.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <IconTooltip label="Active zPods">
        <Badge
          variant="outline"
          className="bg-[#a6e3a1]/15 text-[#a6e3a1] border-[#a6e3a1]/30 text-xs cursor-pointer hover:bg-[#a6e3a1]/25 transition-colors"
          onClick={() => navigate("/zpods?status=ACTIVE")}
        >
          {active} Active
        </Badge>
      </IconTooltip>
      {inProgress > 0 && (
        <IconTooltip label="Building / Deleting">
          <Badge
            variant="outline"
            className="bg-[#89b4fa]/15 text-[#89b4fa] border-[#89b4fa]/30 text-xs cursor-pointer hover:bg-[#89b4fa]/25 transition-colors"
            onClick={() => navigate("/zpods?status=BUILDING")}
          >
            {inProgress} In Progress
          </Badge>
        </IconTooltip>
      )}
      {failed > 0 && (
        <IconTooltip label="Deploy / Destroy failed">
          <Badge
            variant="outline"
            className="bg-[#f38ba8]/15 text-[#f38ba8] border-[#f38ba8]/30 text-xs cursor-pointer hover:bg-[#f38ba8]/25 transition-colors"
            onClick={() => navigate("/zpods?status=FAILED")}
          >
            {failed} Failed
          </Badge>
        </IconTooltip>
      )}
    </div>
  )
}

export function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { targets, activeTargetId, clearActiveTarget } = useTargetStore()
  const { pollingInterval, setPollingInterval } = usePreferencesStore()
  const activeTarget = targets.find((t) => t.id === activeTargetId)
  const [prefsOpen, setPrefsOpen] = useState(false)

  function handleLogout() {
    sessionStorage.setItem("zpodweb-manual-disconnect", "1")
    logout()
    clearActiveTarget()
    navigate("/login")
  }

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??"

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-background px-4">
        {/* Left: zpod stats */}
        <div className="flex items-center gap-3">
          <ZpodStats />
        </div>

        {/* Right: target badge + user menu */}
        <div className="flex items-center gap-3">
          <IconTooltip label={activeTarget?.url ?? "No target"}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a6e3a1] shrink-0" />
              <Server className="h-3 w-3" />
              <span>{activeTarget?.name ?? "No target"}</span>
            </div>
          </IconTooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm">
                  {user?.username}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>
                {user?.username}
                <p className="text-xs font-normal text-muted-foreground">
                  {user?.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPrefsOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" />
                Preferences
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Preferences</DialogTitle>
            <DialogDescription>
              Customize your web UI experience.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs text-muted-foreground">
              Auto-refresh — how often each page refreshes its data
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={pollingInterval === opt.value ? "default" : "outline"}
                  className="text-xs"
                  onClick={() => {
                    setPollingInterval(opt.value)
                    toast.success(
                      opt.value === 0
                        ? "Auto-refresh disabled"
                        : `Auto-refresh set to ${opt.label}`
                    )
                  }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
