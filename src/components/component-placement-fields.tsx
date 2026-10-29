import { useState } from "react"
import { ChevronRight, Layers } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { extractComponentType } from "@/lib/component-colors"
import { DEPLOY_VLANS, cidrToGateway, cidrToVlanId, hostAddress, hostIdRange } from "@/lib/network-utils"
import { cn } from "@/lib/utils"
import type { ComponentNetworkSpec, ZpodNetwork } from "@/types"

/** Components with their own deploy path: placement fixed, no network override
 *  (zpodcommon component_placement.PROTECTED_COMPONENTS). vlan_id stays allowed (ESXi). */
const PROTECTED_COMPONENTS = new Set([
  "zcore",
  "vyos",
  "vcsa",
  "esxi",
  "proxmox",
  "proxmox-dm",
  "proxmox-bs",
  "cloudbuilder",
  "vcfinstaller",
])

function isProtectedComponent(componentUid: string): boolean {
  return PROTECTED_COMPONENTS.has(extractComponentType(componentUid))
}

export interface PlacementValue {
  nested: boolean | null
  network: ComponentNetworkSpec | null
  vlan_id: number | null
}

const NETWORK_FIELDS: { key: keyof ComponentNetworkSpec; label: string; placeholder: string }[] = [
  { key: "portgroup", label: "Portgroup", placeholder: "VM Network" },
  { key: "ip", label: "IP / prefix", placeholder: "from host ID" },
  { key: "gateway", label: "Gateway", placeholder: "zPod network's" },
  { key: "dns", label: "DNS", placeholder: "zcore" },
]

/** The network with its empty fields dropped; null when nothing is left */
function cleanNetwork(network: ComponentNetworkSpec): ComponentNetworkSpec | null {
  const kept = Object.fromEntries(Object.entries(network).filter(([, v]) => v)) as ComponentNetworkSpec
  return Object.keys(kept).length > 0 ? kept : null
}

/** Where a component deploys and what it plugs into (zcli --nested, --vlan-id,
 *  --portgroup/--ip/--gateway/--dns). Folded unless something is set; zpodapi checks the rest. */
export function ComponentPlacementFields({
  componentUid,
  value,
  onChange,
  canNest = true,
}: {
  componentUid: string
  value: PlacementValue
  onChange: (updates: Partial<PlacementValue>) => void
  /** A vCenter in the zPod (or earlier in the profile) to nest in; zpodapi doesn't check it */
  canNest?: boolean
}) {
  const isSet = value.nested != null || value.vlan_id != null || value.network != null
  const [open, setOpen] = useState(isSet)
  const locked = isProtectedComponent(componentUid)
  const type = extractComponentType(componentUid)
  // A network is for nested components only; a protected one keeps its own
  // Without a vCenter nothing can nest, so no network either
  const networkDisabled = locked || value.nested === false || !canNest
  // zpodcore: vlan_id gives the address, network.ip gives another one; one or the other
  const vlanSet = value.vlan_id != null
  const ipSet = !!value.network?.ip

  return (
    <div className="rounded border border-border/60 bg-background/40">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        <Layers className="h-3 w-3" />
        Placement &amp; network
        {!open && isSet && <span className="ml-auto text-[10px] text-[#89b4fa]">set</span>}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-2">
          <div>
            <Label className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">Placement</Label>
            <Select
              value={value.nested == null ? "default" : value.nested ? "nested" : "endpoint"}
              disabled={locked}
              onValueChange={(v) => onChange({ nested: v === "default" ? null : v === "nested" })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" className="text-xs">Library default</SelectItem>
                {/* Kept when already set (a profile), so the select shows it and it can be changed */}
                {(canNest || value.nested === true) && (
                  <SelectItem value="nested" className="text-xs">
                    Nested in the zPod{!canNest && " (no vCenter)"}
                  </SelectItem>
                )}
                <SelectItem value="endpoint" className="text-xs">On the endpoint</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">VLAN ID (tagged guest)</Label>
            <Input
              className="h-7 text-xs"
              type="number"
              value={value.vlan_id ?? ""}
              placeholder={ipSet ? "IP given" : "untagged"}
              disabled={ipSet}
              title={ipSet ? "An IP gives the address: clear it to use a VLAN ID" : undefined}
              onChange={(e) => onChange({ vlan_id: e.target.value ? parseInt(e.target.value, 10) : null })}
            />
          </div>
          {NETWORK_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <Label className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">{label}</Label>
              <Input
                className="h-7 text-xs font-mono"
                value={value.network?.[key] ?? ""}
                placeholder={key === "ip" && vlanSet ? "from VLAN ID" : placeholder}
                disabled={networkDisabled || (key === "ip" && vlanSet)}
                title={key === "ip" && vlanSet ? "A VLAN ID gives the address: clear it to set an IP" : undefined}
                onChange={(e) => onChange({ network: cleanNetwork({ ...value.network, [key]: e.target.value }) })}
              />
            </div>
          ))}
          <p className="col-span-2 text-[10px] leading-snug text-muted-foreground">
            {locked
              ? `${type} has a fixed placement and its own network; only a VLAN ID can be set (guests told their VLAN, like ESXi).`
              : !canNest
                ? "No vCenter in this zPod, so nothing can be nested: the component deploys on the endpoint, without a network override."
                : "The network is for nested components only. To put one on a VLAN, give a portgroup on that VLAN (with a host ID or an IP). VLAN ID is for guests that tag their own interface (ESXi); it gives the address, so it and IP exclude each other."}
          </p>
        </div>
      )}
    </div>
  )
}

/** Where the host ID lands: the network (the VLAN ID's, else mgmt), the host IDs it takes and,
 *  with the zPod's networks (component add), the address. A profile has no zPod yet, so only
 *  the deploy networks' ranges are known. host_id is the last octet in the network's /24. */
function hostIdInfo(
  vlanId: number | null,
  hostId: number | null,
  networks?: ZpodNetwork[],
  network?: ComponentNetworkSpec | null
): { tone: "ok" | "error" | "unknown"; name: string; range?: [number, number]; address?: string } {
  // network.ip gives the address itself: zpodapi refuses a host ID with it
  if (network?.ip) return hostId != null ? { tone: "error", name: "not with an IP" } : { tone: "unknown", name: network.ip }
  // Another portgroup: its VLAN, read in the vCenter at deploy, picks the network
  if (vlanId == null && network?.portgroup && network.portgroup !== "VM Network") {
    return { tone: "unknown", name: "portgroup's VLAN, at deploy" }
  }
  const vlan = vlanId ?? 0
  if (!networks) {
    const name = DEPLOY_VLANS[vlan]
    // No zPod yet: the last octet is all that is known (host_id is the last octet in the /24)
    const address = hostId != null ? `x.x.x.${hostId}` : undefined
    // A user network: only the zPod knows it, zpodapi checks at deploy
    if (!name) return { tone: "unknown", name: `VLAN ${vlan} (checked at deploy)`, address }
    const range = hostIdRange(`10.0.0.${vlan}/26`, `10.0.0.${vlan + 1}`)
    const out = hostId != null && (hostId < range[0] || hostId > range[1])
    return { tone: out ? "error" : "ok", name, range, address }
  }
  const net = networks.find((n) => (n.vlan_id ?? cidrToVlanId(n.cidr)) === vlan)
  if (!net) return { tone: "error", name: `no network on VLAN ${vlan}` }
  const range = hostIdRange(net.cidr, net.gateway ?? cidrToGateway(net.cidr))
  const out = hostId != null && (hostId < range[0] || hostId > range[1])
  return {
    tone: out ? "error" : "ok",
    name: net.name ?? `VLAN ${vlan}`,
    range,
    address: hostId != null ? hostAddress(net.cidr, hostId) : undefined,
  }
}

// Green: the host ID (or auto, left empty) fits; red: it can't deploy like this
const TONE_TEXT = {
  ok: "text-[#a6e3a1]",
  error: "text-[#f38ba8]",
  unknown: "text-muted-foreground/60",
}

/** "Host ID" with, right of it, where it lands, live as the host ID and VLAN ID change. A host
 *  ID that fits shows only its address (`10.60.36.70`, green); empty or outside, the network and
 *  the host IDs it takes (`vlan64 [66–126]`, red when outside or the zPod has no such network). */
export function HostIdLabel({
  vlanId,
  hostId,
  networks,
  network,
}: {
  vlanId: number | null
  hostId: number | null
  networks?: ZpodNetwork[]
  network?: ComponentNetworkSpec | null
}) {
  const info = hostIdInfo(vlanId, hostId, networks, network)
  const range = info.range ? ` [${info.range[0]}–${info.range[1]}]` : ""
  const fits = info.address && info.tone !== "error"
  const title = `${info.name}${range}${info.address ? `: ${hostId} → ${info.address}` : ""}`
  return (
    <Label className="mb-1 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="shrink-0">Host ID</span>
      <span className={cn("truncate font-mono font-normal", TONE_TEXT[info.tone])} title={title}>
        {fits ? info.address : `${info.name}${range}`}
      </span>
    </Label>
  )
}
