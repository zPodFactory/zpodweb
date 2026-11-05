import { Link } from "react-router"
import { AlertTriangle, Network } from "lucide-react"
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card"
import { ZpodDetails } from "@/components/zpod-list-view"
import { cidrToNetworkIp, cidrsOverlap } from "@/lib/network-utils"
import { isInProgressStatus, statusHex } from "@/lib/status-colors"
import { parentCidr, zpodSubnets } from "@/lib/zpod-utils"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { EndpointFull, Zpod, ZpodNetwork } from "@/types"

/** A range wider than this many /24s gets the count and bar only: the map would be noise */
const MAP_MAX_SLOTS = 256
/** The colors of the zPod network diagram, so the two read alike */
const T0_COLOR = "#89b4fa"
const T1_COLOR = "#cba6f7"
const USER_NET_COLOR = "#94e2d5"
const WARN_COLOR = "#f9e2af"

interface Slot {
  zpod: Zpod
  cidr: string
}

/** Where every zPod's /24 sits, and which zPods sit outside the range */
function allocate(range: string, zpods: Zpod[]) {
  const prefix = parseInt(range.split("/")[1] ?? "", 10)
  const size = prefix >= 1 && prefix <= 24 ? 2 ** (24 - prefix) : 0
  const base = cidrToNetworkIp(range)
  const slots = new Map<number, Slot>()
  const outside: Slot[] = []
  for (const zpod of zpods) {
    const subnets = zpodSubnets(zpod.networks ?? [])
    if (!subnets.length) continue
    const cidr = parentCidr(subnets)
    const index = (cidrToNetworkIp(cidr) - base) / 256
    if (size && index >= 0 && index < size) slots.set(index, { zpod, cidr })
    else outside.push({ zpod, cidr })
  }
  return { size, base, slots, outside }
}

/** The zPods that route user networks globally (advertised through the T0), with those networks */
function advertisingZpods(zpods: Zpod[]): { zpod: Zpod; nets: ZpodNetwork[] }[] {
  return zpods
    .map((zpod) => ({
      zpod,
      nets: (zpod.networks ?? [])
        .filter((n) => n.kind === "user" && n.routing === "GLOBAL")
        .sort((a, b) => cidrToNetworkIp(a.cidr) - cidrToNetworkIp(b.cidr)),
    }))
    .filter((z) => z.nets.length > 0)
    .sort((a, b) => a.zpod.name.localeCompare(b.zpod.name))
}

/** The /24 at `index` in the range */
function slotCidr(base: number, index: number): string {
  const ip = base + index * 256
  return `${[ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255].join(".")}.0/24`
}

const netLink = (zpod: Zpod, cidr: string) => `/zpods/${zpod.id}?network=${encodeURIComponent(cidr)}`

/** How many user networks a zPod routes globally (advertised through the T0) */
const globalCount = (zpod: Zpod) => (zpod.networks ?? []).filter((n) => n.kind === "user" && n.routing === "GLOBAL").length

/** The zPod range as a map of its /24s, like a contribution graph: each zPod's in its status
 *  color (pulsing while it builds or is deleted) with the number of global user networks it
 *  advertises on it, opening the zPod's summary
 *  on hover and its page on click */
function RangeMap({ size, base, slots, t0 }: { size: number; base: number; slots: Map<number, Slot>; t0?: string }) {
  return (
    <div className="flex flex-wrap gap-[3px]" aria-label={`${slots.size} of ${size} zPod subnets used`}>
      {Array.from({ length: size }, (_, i) => {
        const slot = slots.get(i)
        if (!slot) {
          return (
            <span
              key={i}
              className="h-4 w-4 rounded-[3px] border border-[#45475a]/80 bg-[#181825]/60"
              title={`${slotCidr(base, i)} · free`}
            />
          )
        }
        const advertised = globalCount(slot.zpod)
        return (
          <HoverCard key={i}>
            <HoverCardTrigger asChild>
              <Link
                to={`/zpods/${slot.zpod.id}`}
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-[3px] font-mono text-[10px] font-bold leading-none text-[#11111b] ring-offset-background transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  // Pending, building, running scripts or deleting: the slot is changing
                  isInProgressStatus(slot.zpod.status) && "animate-pulse"
                )}
                style={{ backgroundColor: statusHex(slot.zpod.status) }}
                aria-label={`${slot.zpod.name}, ${slot.cidr}${advertised ? `, ${advertised} global user network${advertised !== 1 ? "s" : ""}` : ""}`}
              >
                {advertised > 0 ? advertised : null}
              </Link>
            </HoverCardTrigger>
            <ZpodDetails zpod={slot.zpod} t0={t0} />
          </HoverCard>
        )
      })}
    </div>
  )
}

/**
 * A branch of the tree: `gap` px of room above the row, a line down from the parent (to the row's
 * middle when it is the last child) and a tick to the row at `mid`, half the row's height in rem
 * (the rows are sized in rem, so the tick stays on their middle whatever the root font size).
 */
function Branch({
  last,
  color,
  dashed,
  mid,
  gap = 0,
  children,
}: {
  last: boolean
  color: string
  dashed?: boolean
  mid: number
  gap?: number
  children: ReactNode
}) {
  return (
    <div className="relative pl-6" style={{ paddingTop: gap }}>
      <span
        className={cn("absolute left-0 top-0", !last && "bottom-0", dashed ? "border-l border-dashed" : "w-px")}
        style={{ ...(dashed ? { borderColor: color } : { backgroundColor: color }), ...(last ? { height: `calc(${gap}px + ${mid}rem)` } : {}) }}
      />
      <span className="absolute left-0 h-px w-5" style={{ top: `calc(${gap}px + ${mid}rem)`, backgroundColor: color }} />
      {children}
    </div>
  )
}

/**
 * The user networks routed globally as a tree: the physical network, the endpoint's T0 under it,
 * each advertising zPod's T1 under the T0, and the networks each T1 advertises under it. It grows
 * downward, one row per T1 and per network, so many zPods stay readable at any width. No VLAN:
 * this is the routed (L3) view, where two zPods can reuse a VLAN ID for different subnets.
 */
function AdvertisedTopology({ t0, range, items }: { t0: string; range: string; items: { zpod: Zpod; nets: ZpodNetwork[] }[] }) {
  return (
    <div className="text-xs">
      <div className="flex h-7 items-center gap-2 text-sm text-muted-foreground" title="Physical network fabric, and the internet beyond">
        <Network className="h-5 w-5" aria-hidden />
        physical network
      </div>
      {/* ml-2.5: under the icon's middle */}
      <div className="ml-2.5">
        <Branch last color="#7f849c" dashed mid={1.125} gap={4}>
          <div className="flex h-9 items-center">
            <span
              className="rounded-md border px-3 py-1.5 font-mono text-sm leading-5"
              style={{ borderColor: `${T0_COLOR}80`, backgroundColor: `${T0_COLOR}1a`, color: T0_COLOR }}
              title={`NSX T0 ${t0}`}
            >
              {t0 || "T0"}
            </span>
          </div>
          {/* ml-4: the T1s hang from a line inside the T0 box */}
          <div className="ml-4">
            {items.map(({ zpod, nets }, i) => (
              <Branch key={zpod.id} last={i === items.length - 1} color={T0_COLOR} mid={1} gap={i === 0 ? 14 : 10}>
                <div className="flex h-8 items-center gap-2">
                  <Link
                    to={`/zpods/${zpod.id}`}
                    className="whitespace-nowrap rounded-md border px-2.5 py-1 font-mono text-[13px] leading-5 hover:underline"
                    style={{ borderColor: `${T1_COLOR}66`, backgroundColor: `${T1_COLOR}14`, color: T1_COLOR }}
                    title={`Open ${zpod.name}`}
                  >
                    zPod-{zpod.name}-tier1
                  </Link>
                  <span className="text-muted-foreground">
                    {nets.length} network{nets.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="ml-4">
                  {nets.map((n, j) => {
                    const inRange = cidrsOverlap(n.cidr, range)
                    const color = inRange ? WARN_COLOR : USER_NET_COLOR
                    return (
                      <Branch key={n.cidr} last={j === nets.length - 1} color={T1_COLOR} mid={0.75} gap={j === 0 ? 4 : 0}>
                        <div className="flex h-6 items-center gap-3 whitespace-nowrap">
                          <Link
                            to={netLink(zpod, n.cidr)}
                            className="w-32 font-mono underline-offset-2 hover:underline"
                            style={{ color }}
                            title={inRange ? "Inside the zPod range: a future zPod's /24 could land on it" : `Show it in ${zpod.name}'s Networks table`}
                          >
                            {inRange && <AlertTriangle className="mr-1 inline h-3 w-3 align-[-2px]" />}
                            {n.cidr}
                          </Link>
                          <span className="text-foreground/80">{n.name ?? ""}</span>
                        </div>
                      </Branch>
                    )
                  })}
                </div>
              </Branch>
            ))}
          </div>
        </Branch>
      </div>
    </div>
  )
}

/**
 * An endpoint's advertised networks, for an administrator: the zPod range (`network.networks`) as
 * a map of its /24s, and the user networks the zPods route globally, which live outside that
 * range, as a T0 / T1 topology. A zPod outside the range, or a user network inside it (where a
 * future zPod's /24 would land), is flagged.
 */
export function EndpointNetworks({ endpoint, zpods }: { endpoint: EndpointFull; zpods: Zpod[] }) {
  const range = endpoint.endpoints.network.networks
  const t0 = endpoint.endpoints.network.t0
  const { size, base, slots, outside } = allocate(range, zpods)
  const advertising = advertisingZpods(zpods)
  const used = slots.size
  const pct = size ? Math.round((used / size) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Network className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">Advertised networks</span>
        {t0 && (
          <span className="text-xs text-muted-foreground">
            through <span className="font-mono" style={{ color: T0_COLOR }}>{t0}</span>
          </span>
        )}
      </div>

      {/* The zPod range */}
      <div className="ml-5 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="font-medium text-foreground">zPod range</span>{" "}
            <span className="font-mono text-[#b4befe]">{range}</span>
          </span>
          {size > 0 && (
            <span className="tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{used}</span> of {size} /24 used ({pct}%)
            </span>
          )}
        </div>
        {size > 0 && size <= MAP_MAX_SLOTS && <RangeMap size={size} base={base} slots={slots} t0={t0} />}
        {size > MAP_MAX_SLOTS && (
          <div className="h-1.5 overflow-hidden rounded-full bg-[#313244]">
            <div className="h-full rounded-full bg-[#b4befe]" style={{ width: `${pct}%` }} />
          </div>
        )}
        {outside.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: WARN_COLOR }}>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Outside the zPod range:
            </span>
            {outside.map(({ zpod, cidr }) => (
              <Link key={zpod.id} to={netLink(zpod, cidr)} className="font-mono underline-offset-2 hover:underline">
                {cidr} <span className="font-sans text-muted-foreground">{zpod.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* The user networks routed globally, set apart from the range by a thin rule */}
      <div className="ml-5 space-y-2 border-t border-[#45475a]/60 pt-4">
        {/* A heading like "Advertised networks", with its note muted beside it */}
        <div className="text-sm">
          <span className="font-medium text-foreground">User networks advertised to the NSX fabric</span>{" "}
          <span className="text-xs text-muted-foreground">routed globally, outside the zPod range</span>
        </div>
        {advertising.length === 0 ? (
          <p className="text-xs text-muted-foreground">None: every advertised network is a zPod /24.</p>
        ) : (
          <AdvertisedTopology t0={t0} range={range} items={advertising} />
        )}
      </div>
    </div>
  )
}
