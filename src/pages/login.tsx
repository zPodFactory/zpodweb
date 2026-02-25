import { useState, useRef, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useTargetStore } from "@/stores/target-store"
import { useAuthStore } from "@/stores/auth-store"
import { validateTarget } from "@/hooks/use-api"
import { generateId } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { TargetDialog } from "@/components/target/target-dialog"
import { toast } from "sonner"
import { IconTooltip } from "@/components/icon-tooltip"
import {
  Plug,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  Server,
} from "lucide-react"
import type { TargetProfile } from "@/types"

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get("returnTo") || "/"
  const { targets, addTarget, removeTarget, setActiveTarget, updateTarget } =
    useTargetStore()
  const { setUser, setLoading, isLoading } = useAuthStore()

  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<TargetProfile | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const autoConnectAttempted = useRef(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLInputElement>(null)

  async function handleConnect(target: TargetProfile) {
    try {
      setConnectingId(target.id)
      setLoading(true)
      const user = await validateTarget(target.url, target.token)
      updateTarget(target.id, {
        lastConnected: new Date().toISOString(),
      })
      sessionStorage.removeItem("zpodweb-manual-disconnect")
      setActiveTarget(target.id)
      setUser(user)
      navigate(returnTo)
    } catch {
      toast.error("Connection failed", {
        description: "Invalid credentials or unreachable server.",
      })
    } finally {
      setConnectingId(null)
      setLoading(false)
    }
  }

  async function handleQuickConnect() {
    const formName = nameRef.current?.value || "Unnamed"
    const formUrl = urlRef.current?.value || ""
    const formToken = tokenRef.current?.value || ""
    const formSave = saveRef.current?.checked ?? true

    if (!formUrl || !formToken) {
      toast.error("Please fill in the API URL and Token fields.")
      return
    }

    const id = generateId()
    const target: TargetProfile = {
      id,
      name: formName,
      url: formUrl.replace(/\/+$/, ""),
      token: formToken,
      lastConnected: new Date().toISOString(),
    }

    try {
      setLoading(true)
      const user = await validateTarget(target.url, target.token)
      if (formSave) {
        addTarget(target)
      }
      setActiveTarget(target.id)
      setUser(user)
      navigate(returnTo)
    } catch (err) {
      console.error("[zpodweb] connect error:", err)
      toast.error("Connection failed", {
        description: "Invalid credentials or unreachable server.",
      })
    } finally {
      setLoading(false)
    }
  }

  function handleSaveTarget(target: TargetProfile) {
    if (editTarget) {
      updateTarget(editTarget.id, target)
    } else {
      addTarget(target)
    }
    setEditTarget(null)
    setShowAddDialog(false)
  }

  // Auto-connect when exactly one saved target exists,
  // but skip if the user just explicitly disconnected this session.
  useEffect(() => {
    if (autoConnectAttempted.current) return
    if (sessionStorage.getItem("zpodweb-manual-disconnect")) return
    if (targets.length === 1) {
      autoConnectAttempted.current = true
      handleConnect(targets[0])
    }
  }, [targets.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/zpodfactory-logo.png"
            alt="zPodFactory"
            className="h-16 w-16"
          />
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            zPodFactory
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect to a zPodFactory instance to get started
          </p>
        </div>

        {/* Saved targets */}
        {targets.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Saved Targets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {targets.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.url}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleConnect(t)}
                      disabled={isLoading}
                    >
                      {connectingId === t.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plug className="h-3 w-3" />
                      )}
                      <span className="ml-1 hidden sm:inline">Connect</span>
                    </Button>
                    <IconTooltip label="Edit target">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditTarget(t)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </IconTooltip>
                    <IconTooltip label="Delete target">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeTarget(t.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </IconTooltip>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="mr-1 h-3 w-3" /> Add Target
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick connect — only shown when no saved targets (first-time) */}
        {targets.length === 0 && (
          <>
            <Separator />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Connect to a Target
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Target Name</Label>
                  <Input
                    ref={nameRef}
                    id="name"
                    placeholder="My zPodFactory"
                    defaultValue={
                      import.meta.env.ZPODWEB_DEFAULT_ZPODFACTORY_NAME || "zPodFactory"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">API URL</Label>
                  <Input
                    ref={urlRef}
                    id="url"
                    placeholder="http://172.16.0.10:8000"
                    defaultValue={
                      import.meta.env.ZPODWEB_DEFAULT_ZPODFACTORY_API_URL || ""
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token">API Token</Label>
                  <Input
                    ref={tokenRef}
                    id="token"
                    type="password"
                    placeholder="Enter your access token"
                    defaultValue={
                      import.meta.env.ZPODWEB_DEFAULT_ZPODFACTORY_API_TOKEN || ""
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={saveRef}
                    type="checkbox"
                    id="save"
                    defaultChecked
                    className="h-4 w-4"
                  />
                  <Label htmlFor="save" className="text-sm font-normal">
                    Save this target
                  </Label>
                </div>
                <Button
                  className="w-full"
                  onClick={handleQuickConnect}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plug className="mr-2 h-4 w-4" />
                  )}
                  Connect
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground">
          <a
            href="https://zpodfactory.github.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-foreground transition-colors"
          >
            zpodfactory.github.io
          </a>
        </p>
      </div>

      {/* Edit / Add target dialog */}
      <TargetDialog
        open={showAddDialog || editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false)
            setEditTarget(null)
          }
        }}
        target={editTarget}
        onSave={handleSaveTarget}
      />
    </div>
  )
}
