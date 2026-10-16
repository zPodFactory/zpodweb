import { useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  L,
  TOPOLOGY_PATHS,
  networkMode,
  pointsToPath,
  reachability,
  routePoints,
  type TopologyPath,
  type Verdict,
} from "@/lib/zpod-topology"
import { sampleHost } from "@/lib/network-utils"
import type { ZpodNetworkView } from "@/types"

interface ZpodNetworksTopologyProps {
  zpodName: string
  zpodDomain: string
  t0Name: string
  t1Name: string
  segmentName: string
  zcoreIp: string
  eth0: string // zcore's management address with prefix
  mgmtCidr: string
  networks: ZpodNetworkView[] // every network, in the API's order
  masqueradeSupported: boolean
  selected: string // a user network's name, or "all"
  path: TopologyPath
  onSelect: (name: string) => void
  onPath: (path: TopologyPath) => void
}

// Catppuccin accents, as in status-colors; neutrals come from the theme variables.
const C = {
  green: "#a6e3a1",
  red: "#f38ba8",
  down: "#f2805e",
  yellow: "#f9e2af",
  peach: "#fab387",
  blue: "#89b4fa",
  teal: "#94e2d5",
  lavender: "#b4befe",
  amber: "#fbbf24",
  amberText: "#fcd34d",
  purple: "#c084fc",
}
const VERDICT_COLOR: Record<Verdict, string> = { ok: C.green, fail: C.red, wait: C.yellow }
const VERDICT_LABEL: Record<Verdict, string> = { ok: "WORKS", fail: "BLOCKED", wait: "PENDING" }
const MODE_COLOR = { down: C.down, global: C.peach, pending: C.yellow, masquerade: C.green, local: C.blue }
const GROUPS: { kind: ZpodNetworkView["kind"]; label: string; color: string }[] = [
  { kind: "zcore", label: "zcore · nested VCF", color: C.amber },
  { kind: "zpod", label: "zPod /26s", color: C.lavender },
  { kind: "user", label: "user networks", color: C.teal },
]

const T = "fill-muted-foreground font-mono text-[10.5px]"
const TS = "fill-foreground font-mono text-[10.5px] font-semibold"

function Box({
  x,
  y,
  w,
  title,
  sub,
  stroke,
  titleColor,
  dashed,
}: {
  x: number
  y: number
  w: number
  title: string
  sub: string
  stroke: string
  titleColor?: string
  dashed?: boolean
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* opaque, so the lines under it stop at its edge */}
      <rect
        x={-w / 2}
        y={-26}
        width={w}
        height={52}
        className="fill-card"
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
      <text y={-4} textAnchor="middle" className="text-[13px] font-semibold" fill={titleColor ?? "hsl(var(--foreground))"}>
        {title}
      </text>
      <text y={13} textAnchor="middle" className={T}>
        {sub}
      </text>
    </g>
  )
}

export function ZpodNetworksTopology(props: ZpodNetworksTopologyProps) {
  const { networks, selected, path, onSelect, onPath, zpodName, zcoreIp, mgmtCidr, masqueradeSupported } = props
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  )

  // The management network is eth0 itself; every other network is a port on eth1.
  const ports = networks.filter((n) => n.vlan_id !== 0)
  const users = ports.filter((n) => n.kind === "user")
  const all = selected === "all" || !users.some((n) => n.name === selected)
  const sel = all ? null : users.find((n) => n.name === selected)!
  const visible = all ? ports : [sel!]
  const portX = (i: number) => (all ? L.allX0 + i * L.allDx : L.focusX)
  const last = portX(visible.length - 1)
  const zR = all ? Math.max(last + 70, 1150) : L.zRightFocus
  const right = all ? zR + 20 : L.vmX + 140
  const mid = (L.zcoreLeft + zR) / 2

  // Heights follow the content: port labels, then one row per masquerade rule.
  const masq = visible.filter((n) => n.masquerade)
  const contentBottom = all ? 446 : L.portY + 92
  const nftTop = contentBottom + 22
  const zBottom = (masq.length ? nftTop + (masq.length - 1) * 30 + 13 : contentBottom) + 14
  const zpodBottom = Math.max(zBottom, 360) + 16

  const ctx = { zpodName, zcoreIp, mgmtCidr, masqueradeSupported }
  const verdict = sel ? reachability(sel, path, ctx) : null
  const route = sel && verdict ? routePoints(sel, path, verdict.verdict) : null
  const d = route ? pointsToPath(route.pts) : ""

  // T1 static routes to zcore: the deploy /26s and the advertised (or advertising) user networks
  const zpodRoutes = ports.filter((n) => n.kind === "zpod")
  const userRoutes = users.filter((n) => n.routing === "GLOBAL" || n.routing === "PENDING")
  const routeColor = (n: ZpodNetworkView) =>
    n.kind === "zpod" ? undefined : n.routing === "GLOBAL" ? C.peach : C.yellow
  const routeText = (n: ZpodNetworkView) =>
    `${n.cidr}  ${n.name}${n.routing === "PENDING" ? " (routing change running)" : ""}`

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Network">
          <span className="mr-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Network</span>
          {users.map((n) => (
            <Chip key={n.name} on={!all && sel?.name === n.name} onClick={() => onSelect(n.name)}>
              {n.name}
            </Chip>
          ))}
          <Chip on={all} onClick={() => onSelect("all")}>
            All networks
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Path">
          <span className="mr-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">Path</span>
          {TOPOLOGY_PATHS.map((p) => (
            <Chip key={p.key} on={!all && path === p.key} disabled={all} onClick={() => onPath(p.key)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <svg
          viewBox={`0 0 ${right + 20} ${zpodBottom + 14}`}
          className="block h-auto w-full min-w-[960px]"
          role="img"
          aria-label={`zPod ${zpodName}: zcore and upstream network topology`}
        >
          {/* layer 1: the zPod, links, trunk, zcore and its lines */}
          <rect
            x={L.zpodLeft}
            y={18}
            width={right - L.zpodLeft}
            height={zpodBottom - 18}
            fill={C.peach}
            fillOpacity={0.035}
            stroke={C.peach}
            strokeWidth={2}
            strokeDasharray="8 5"
          />
          <text x={324} y={40} className="text-[13px] font-bold" fill={C.peach}>
            zPod {zpodName}
          </text>
          <g className="stroke-border" strokeWidth={2}>
            <line x1={80} y1={80} x2={230} y2={80} />
            <line x1={230} y1={80} x2={L.eth0X} y2={80} />
            <line x1={90} y1={330} x2={230} y2={80} />
            <line x1={L.eth0X} y1={80} x2={L.eth0X} y2={L.trunkY} />
          </g>

          <text x={530} y={64} className={TS}>
            T1 static routes → zcore {zcoreIp}
          </text>
          {all ? (
            <>
              {zpodRoutes.map((n, i) => (
                <text key={n.name} x={530} y={79 + i * 14} className={T}>
                  {routeText(n)}
                </text>
              ))}
              {userRoutes.map((n, i) => (
                <text key={n.name} x={760} y={79 + i * 14} className={T} style={{ fill: routeColor(n) }}>
                  {routeText(n)}
                </text>
              ))}
            </>
          ) : (
            <>
              {userRoutes.includes(sel!) ? (
                <text x={530} y={79} className={T} style={{ fill: routeColor(sel!) }}>
                  {routeText(sel!)}
                </text>
              ) : (
                <text x={530} y={79} className={T}>
                  none for {sel!.name} (routing {sel!.routing})
                </text>
              )}
              <text x={530} y={93} className={cn(T, "opacity-70")}>
                + {zpodRoutes.length + userRoutes.length - (userRoutes.includes(sel!) ? 1 : 0)} other routes
              </text>
            </>
          )}

          <line x1={380} y1={L.trunkY} x2={all ? zR : L.vmX} y2={L.trunkY} stroke={C.peach} strokeOpacity={0.4} strokeWidth={7} strokeLinecap="round" />
          <text x={zR - 10} y={150} textAnchor="end" className="font-mono text-[11px] font-semibold" fill={C.peach}>
            {props.segmentName} · 802.1Q trunk · VLANs 0–4094
          </text>
          <line x1={L.eth0X} y1={L.trunkY} x2={L.eth0X} y2={L.eth0Y} className="stroke-border" strokeWidth={2} />
          <text x={440} y={198} className={TS}>
            eth0 · native
          </text>
          <text x={440} y={211} className={T}>
            {props.eth0}
          </text>
          <line x1={L.eth1X} y1={L.trunkY} x2={L.eth1X} y2={L.eth1TrunkY} stroke={C.peach} strokeOpacity={0.4} strokeWidth={4} />
          <text x={610} y={198} className={TS}>
            eth1 · 802.1Q trunk
          </text>
          <text x={610} y={211} className={T}>
            {all ? `${ports.length} tagged VLANs` : `VLAN ${sel!.vlan_id} of ${ports.length} tagged`}
          </text>

          <rect
            x={L.zcoreLeft}
            y={L.zcoreTop}
            width={zR - L.zcoreLeft}
            height={zBottom - L.zcoreTop}
            fill={C.amber}
            fillOpacity={0.06}
            stroke={C.amber}
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
          <text x={zR - 14} y={256} textAnchor="end" className="text-[15px] font-bold" fill={C.amberText}>
            zcore.{props.zpodDomain}
          </text>
          <text x={zR - 14} y={271} textAnchor="end" className={T}>
            network · dns · nfs · zboxapi
          </text>
          <line
            x1={Math.min(L.allX0 - 40, 560)}
            y1={L.eth1TrunkY}
            x2={last + 40}
            y2={L.eth1TrunkY}
            stroke={C.peach}
            strokeOpacity={0.4}
            strokeWidth={4}
          />
          <g stroke={C.blue} strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="3 3">
            <line x1={L.eth0X} y1={L.portY} x2={last} y2={L.portY} />
            <line x1={L.eth0X} y1={L.eth0Y} x2={L.eth0X} y2={L.portY} />
          </g>
          <text x={L.eth0X} y={L.portY + 22} textAnchor="middle" className={T}>
            routing
          </text>
          {visible.map((n, i) => (
            <line key={n.name} x1={portX(i)} y1={L.eth1TrunkY} x2={portX(i)} y2={L.portY} className="stroke-border" strokeWidth={1.5} />
          ))}
          {all ? (
            GROUPS.map((g) => {
              const idx = visible.map((n, i) => (n.kind === g.kind ? i : -1)).filter((i) => i >= 0)
              if (!idx.length) return null
              const a = portX(idx[0]) - 40
              const b = portX(idx[idx.length - 1]) + 40
              return (
                <g key={g.kind} stroke={g.color} strokeWidth={1.5}>
                  <line x1={a} y1={425} x2={b} y2={425} />
                  <line x1={a} y1={420} x2={a} y2={425} />
                  <line x1={b} y1={420} x2={b} y2={425} />
                  <text x={(a + b) / 2} y={440} textAnchor="middle" stroke="none" fill={g.color} className="text-[10.5px] font-semibold uppercase tracking-wider">
                    {g.label}
                  </text>
                </g>
              )
            })
          ) : (
            <>
              <text x={L.focusX} y={L.portY + 86} textAnchor="middle" className={cn(T, "opacity-70")}>
                + {ports.length - 1} VLANs on eth1 hidden
              </text>
              <line x1={L.vmX} y1={L.trunkY} x2={L.vmX} y2={L.portY} stroke={C.blue} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="6 4" />
              <text x={L.vmX + 8} y={226} className={TS}>
                VLAN {sel!.vlan_id}
              </text>
              <text x={L.vmX + 8} y={240} className={T}>
                portgroup, tagged
              </text>
            </>
          )}

          {/* layer 2: the path highlight, under every box */}
          {route && (
            <path
              d={d}
              fill="none"
              stroke={VERDICT_COLOR[verdict!.verdict]}
              strokeOpacity={0.35}
              strokeWidth={4}
              strokeLinejoin="round"
              strokeDasharray={verdict!.verdict === "wait" ? "6 5" : undefined}
            />
          )}

          {/* layer 3: boxes and ports, opaque */}
          {masq.map((n, i) => {
            const y = nftTop + i * 30
            return (
              <g key={n.name}>
                <rect x={mid - 210} y={y - 13} width={420} height={24} className="fill-card" stroke={C.green} strokeOpacity={0.5} />
                <text x={mid} y={y + 3} textAnchor="middle" className="font-mono text-[10.5px]" fill={C.green}>
                  nftables masquerade: {n.cidr} → eth0{n.status !== "ACTIVE" ? " (interface down)" : ""}
                </text>
              </g>
            )
          })}
          <circle cx={L.eth0X} cy={L.eth0Y} r={7} className="fill-card stroke-muted-foreground" strokeWidth={2} />
          {visible.map((n, i) => {
            const mode = networkMode(n)
            const sys = n.kind !== "user"
            return (
              <g key={n.name} transform={`translate(${portX(i)},${L.portY})`} opacity={all && sys ? 0.55 : 1}>
                <circle
                  r={7}
                  className="fill-card"
                  stroke={mode === "down" ? C.down : !all ? "#cba6f7" : "hsl(var(--muted-foreground))"}
                  strokeWidth={2}
                  strokeDasharray={mode === "down" ? "3 2" : undefined}
                />
                <text y={22} textAnchor="middle" className={TS}>
                  eth1.{n.vlan_id}
                </text>
                <text y={35} textAnchor="middle" className={T}>
                  {n.gateway}
                </text>
                <text y={48} textAnchor="middle" className={T}>
                  {n.name}
                </text>
                <text y={61} textAnchor="middle" className="font-mono text-[10.5px]" fill={MODE_COLOR[mode]}>
                  {mode}
                </text>
              </g>
            )
          })}
          <Box x={80} y={80} w={140} title="internet" sub="www.google.com" stroke="hsl(var(--muted-foreground))" dashed />
          <Box x={230} y={80} w={110} title="NSX T0" sub={props.t0Name || "T0"} stroke="#3b82f6" titleColor="#93c5fd" />
          <Box x={90} y={330} w={160} title="Your network" sub="fabric · laptops, CI" stroke="hsl(var(--muted-foreground))" />
          <Box x={L.eth0X} y={80} w={160} title="NSX T1" sub={props.t1Name} stroke="#a855f7" titleColor="#d8b4fe" />
          {sel && (
            <g transform={`translate(${L.vmX},${L.portY})`}>
              <rect x={-65} y={-32} width={130} height={64} className="fill-card" stroke={C.blue} strokeWidth={1.5} strokeDasharray="5 3" />
              <text y={-10} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
                example VM
              </text>
              <text y={6} textAnchor="middle" className={T}>
                {sampleHost(sel.gateway)}
              </text>
              <text y={20} textAnchor="middle" className={T}>
                on {sel.name}
              </text>
            </g>
          )}

          {/* layer 4: the block marker and the packet, the only things that cross boxes */}
          {route?.blocked && (
            <g transform={`translate(${route.blocked[0]},${route.blocked[1]})`}>
              <circle r={14} fill={C.red} fillOpacity={0.15} stroke={C.red} strokeWidth={2} />
              <text y={5} textAnchor="middle" className="font-mono text-[14px] font-bold" fill={C.red}>
                ✕
              </text>
            </g>
          )}
          {route &&
            (reduceMotion ? (
              <circle
                cx={route.pts[route.pts.length - 1][0]}
                cy={route.pts[route.pts.length - 1][1]}
                r={6}
                fill={VERDICT_COLOR[verdict!.verdict]}
                className="stroke-background"
                strokeWidth={2}
              />
            ) : (
              <circle key={d} r={6} fill={VERDICT_COLOR[verdict!.verdict]} className="stroke-background" strokeWidth={2}>
                <animateMotion dur="4s" repeatCount="indefinite" path={d} />
              </circle>
            ))}
        </svg>
      </div>

      {sel ? (
        <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
          {TOPOLOGY_PATHS.map((p) => {
            const v = reachability(sel, p.key, ctx)
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={path === p.key}
                onClick={() => onPath(p.key)}
                className={cn(
                  "grid gap-1 bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                  path === p.key && "bg-accent/60 shadow-[inset_0_2px_0_hsl(var(--primary))]"
                )}
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className="rounded border px-1.5 font-mono text-[10.5px]"
                    style={{ color: VERDICT_COLOR[v.verdict], borderColor: `${VERDICT_COLOR[v.verdict]}66`, background: `${VERDICT_COLOR[v.verdict]}1a` }}
                  >
                    {VERDICT_LABEL[v.verdict]}
                  </span>
                  {sel.name} · {p.label.toLowerCase()}
                </span>
                <span className="text-xs text-muted-foreground">{v.why}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Every network on zcore, grouped by kind. Pick a user network to follow its paths.
        </p>
      )}
    </div>
  )
}

function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
        on ? "border-primary bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
        disabled && "cursor-default opacity-40 hover:bg-transparent"
      )}
    >
      {children}
    </button>
  )
}
