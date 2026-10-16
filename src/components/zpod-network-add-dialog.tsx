import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Info, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"
import {
  apiErrorMessage,
  findOverlap,
  parseGateway,
  validateNetworkName,
  validateVlan,
} from "@/lib/network-utils"
import type { ZpodNetworkView } from "@/types"

interface ZpodNetworkAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  zpodId: number
  zpodName: string
  networks: ZpodNetworkView[]
  pool: string | null
  isSuperadmin: boolean
  masqueradeSupported: boolean
  zcoreVersion: string
  onAdded: () => void
}

type Routing = "LOCAL" | "GLOBAL"

export function ZpodNetworkAddDialog({
  open,
  onOpenChange,
  zpodId,
  zpodName,
  networks,
  pool,
  isSuperadmin,
  masqueradeSupported,
  zcoreVersion,
  onAdded,
}: ZpodNetworkAddDialogProps) {
  const { addZpodNetwork } = useApi()
  const [vlan, setVlan] = useState("")
  const [name, setName] = useState("")
  const [gateway, setGateway] = useState("")
  const [masquerade, setMasquerade] = useState(false)
  const [routing, setRouting] = useState<Routing>("LOCAL")
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setVlan("")
    setName("")
    setGateway("")
    setMasquerade(false)
    setRouting("LOCAL")
    setTouched({})
    setServerError(null)
  }, [open])

  const vlanError = validateVlan(vlan, networks)
  const nameError = validateNetworkName(name, networks)
  const parsed = useMemo(() => parseGateway(gateway), [gateway])
  const overlap = parsed.ok ? findOverlap(parsed.gw.cidr, networks, pool) : null
  const gatewayError = !parsed.ok ? parsed.error : overlap
  const canSubmit = !vlanError && !nameError && !gatewayError && !submitting

  const show = (field: string, error: string | null) => (touched[field] ? error : null)

  // Global routing turns masquerade off as its last step: the two never go together.
  const chooseRouting = (r: Routing) => {
    setRouting(r)
    if (r === "GLOBAL") setMasquerade(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ vlan: true, name: true, gateway: true })
    if (!canSubmit) return
    setSubmitting(true)
    setServerError(null)
    try {
      const created = await addZpodNetwork(zpodId, {
        name: name.trim(),
        vlan: parseInt(vlan, 10),
        gateway: gateway.trim(),
        masquerade,
        routing,
      })
      toast.success(
        created.routing === "PENDING"
          ? `${created.name} added; advertising it to the fabric`
          : `${created.name} added on VLAN ${created.vlan_id}`
      )
      onOpenChange(false)
      onAdded()
    } catch (err) {
      setServerError(apiErrorMessage(err, `Failed to add ${name.trim()}`))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add network to {zpodName}</DialogTitle>
            <DialogDescription>Creates a VLAN interface with its own subnet on zcore.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[1fr_1.6fr] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="net-vlan">VLAN ID</Label>
              <Input
                id="net-vlan"
                inputMode="numeric"
                placeholder="111"
                className={cn("font-mono", show("vlan", vlanError) && "border-destructive")}
                value={vlan}
                onChange={(e) => setVlan(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, vlan: true }))}
              />
              <p className={cn("text-xs", show("vlan", vlanError) ? "text-destructive" : "text-muted-foreground")}>
                {show("vlan", vlanError) ?? "1–4094, not 10/20/30/64/128/192"}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="net-name">Name</Label>
              <Input
                id="net-name"
                placeholder="LOCALNET111"
                maxLength={32}
                className={cn("font-mono", show("name", nameError) && "border-destructive")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              />
              <p className={cn("text-xs", show("name", nameError) ? "text-destructive" : "text-muted-foreground")}>
                {show("name", nameError) ?? "Letter first; letters, digits, - or _"}
              </p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="net-gateway">Gateway (zcore address with prefix)</Label>
            <Input
              id="net-gateway"
              placeholder="10.42.111.1/24"
              className={cn("font-mono", show("gateway", gatewayError) && "border-destructive")}
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, gateway: true }))}
            />
            {show("gateway", gatewayError) && (
              <p className="text-xs text-destructive">{gatewayError}</p>
            )}
          </div>

          {parsed.ok && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 rounded-md border bg-muted/40 px-3 py-2 text-xs">
              <dt className="text-muted-foreground">Subnet</dt>
              <dd className="font-mono">{parsed.gw.cidr}</dd>
              <dt className="text-muted-foreground">Interface</dt>
              <dd className="font-mono">{vlanError ? "eth1.?" : `eth1.${parseInt(vlan, 10)}`} on zcore</dd>
              <dt className="text-muted-foreground">Usable hosts</dt>
              <dd className="font-mono">
                {parsed.gw.firstHost} – {parsed.gw.lastHost} ({parsed.gw.hosts} besides the gateway)
              </dd>
              <dt className="text-muted-foreground">Overlap</dt>
              <dd className={cn("font-mono", overlap ? "text-destructive" : "text-[#a6e3a1]")}>
                {overlap ? "see above" : `none (zPod networks${pool ? `, pool ${pool}` : ""})`}
              </dd>
            </dl>
          )}

          {masqueradeSupported ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="net-masq" className={cn(routing === "GLOBAL" && "text-muted-foreground")}>
                  Masquerade
                </Label>
                <p className="text-xs text-muted-foreground">
                  {routing === "GLOBAL"
                    ? "Not available with global routing"
                    : "Translate this subnet's traffic to zcore's address on the way out"}
                </p>
              </div>
              <Switch
                id="net-masq"
                checked={masquerade}
                onCheckedChange={setMasquerade}
                disabled={routing === "GLOBAL"}
              />
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Masquerade is not available: this zPod runs zcore {zcoreVersion || "older than 13.7"}, and
                masquerade needs zcore 13.7 (zboxapi 0.2.0). The network will route inside the zPod without
                translation.
              </span>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Routing</Label>
            <div className="grid grid-cols-2 overflow-hidden rounded-md border" role="radiogroup" aria-label="Routing">
              <button
                type="button"
                role="radio"
                aria-checked={routing === "LOCAL"}
                onClick={() => chooseRouting("LOCAL")}
                className={cn(
                  "flex flex-col items-start gap-0.5 px-3 py-2 text-left text-xs transition-colors",
                  routing === "LOCAL" ? "bg-[#89b4fa]/10 ring-1 ring-inset ring-[#89b4fa]" : "hover:bg-accent"
                )}
              >
                <span className={cn("font-semibold", routing === "LOCAL" && "text-[#89b4fa]")}>Local</span>
                <span className="text-muted-foreground">Routed inside the zPod only</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={routing === "GLOBAL"}
                disabled={!isSuperadmin}
                onClick={() => chooseRouting("GLOBAL")}
                className={cn(
                  "flex flex-col items-start gap-0.5 border-l px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed",
                  routing === "GLOBAL" ? "bg-[#fab387]/10 ring-1 ring-inset ring-[#fab387]" : "hover:bg-accent",
                  !isSuperadmin && "opacity-60 hover:bg-transparent"
                )}
              >
                <span className={cn("font-semibold", routing === "GLOBAL" && "text-[#fab387]")}>Global</span>
                <span className="text-muted-foreground">
                  {isSuperadmin
                    ? "Advertise to the NSX fabric after creation"
                    : "Superadmin only. Ask a superadmin to advertise it later."}
                </span>
              </button>
            </div>
          </div>

          {serverError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {serverError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || (Object.keys(touched).length > 0 && !canSubmit)}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Network
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
