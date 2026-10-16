/** Reachability of a zPod user network, and the polyline its packet follows in the
 *  Topology tab. The rules are the ones the routing flow and the three-network test
 *  established: masquerade or a global route brings replies back from the internet,
 *  only a global route lets the fabric in, zcore routes between all its networks. */

import type { ZpodNetworkView } from "@/types"

export type TopologyPath = "internet" | "fabric" | "zpod"
export type Verdict = "ok" | "fail" | "wait"

export const TOPOLOGY_PATHS: { key: TopologyPath; label: string }[] = [
  { key: "internet", label: "To the internet" },
  { key: "fabric", label: "From the fabric" },
  { key: "zpod", label: "To the management network" },
]

export function reachability(
  n: ZpodNetworkView,
  path: TopologyPath,
  ctx: { zpodName: string; zcoreIp: string; mgmtCidr: string; masqueradeSupported: boolean }
): { verdict: Verdict; why: string } {
  if (n.status !== "ACTIVE") {
    return { verdict: "fail", why: `eth1.${n.vlan_id} is ${n.status.toLowerCase()} on zcore: nothing goes through.` }
  }
  if (path === "zpod") {
    return {
      verdict: "ok",
      why: `zcore is the gateway of both: ${n.cidr} reaches ${ctx.mgmtCidr} through eth1.${n.vlan_id} and eth0, no NSX involved.`,
    }
  }
  if (path === "internet") {
    if (n.routing === "GLOBAL") {
      return { verdict: "ok", why: `Advertised: the T1 routes ${n.cidr} to zcore and the T0 knows it, so replies come straight back.` }
    }
    if (n.masquerade) {
      return { verdict: "ok", why: `zcore rewrites the source to its own ${ctx.zcoreIp} (the nftables rule in the box), so replies come back to zcore.` }
    }
    if (n.routing === "PENDING") {
      return { verdict: "wait", why: "A routing change is running. If it advertises the subnet, replies will come back; until then they have nowhere to go." }
    }
    return {
      verdict: "fail",
      why: ctx.masqueradeSupported
        ? `Leaves zcore's eth0 with a source in ${n.cidr}, which nothing upstream routes back: no masquerade and no global route.`
        : `Leaves zcore's eth0 with a source in ${n.cidr}, which nothing upstream routes back. This zcore has no masquerade (it needs zcore 13.7); only a global route would help.`,
    }
  }
  if (n.routing === "GLOBAL") {
    return { verdict: "ok", why: `The T0 learns ${n.cidr} from the T1 static route ${ctx.zpodName}-${n.name} → ${ctx.zcoreIp}.` }
  }
  if (n.routing === "PENDING") {
    return { verdict: "wait", why: `Advertise run in progress: the fabric gets a route to ${n.cidr} only if it completes.` }
  }
  return { verdict: "fail", why: `The fabric has no route to ${n.cidr} (routing LOCAL). Masquerade only works outbound.` }
}

/** Fixed coordinates of the drawing (SVG units). */
export const L = {
  internet: [80, 80] as const,
  t0: [230, 80] as const,
  fabric: [90, 330] as const,
  eth0X: 430,
  eth0Y: 260,
  trunkY: 160,
  eth1X: 600,
  eth1TrunkY: 290,
  portY: 350,
  zpodLeft: 310,
  zcoreLeft: 370,
  zcoreTop: 232,
  // one network picked: its port alone, zcore narrower, an example VM on its VLAN to the right
  focusX: 720,
  zRightFocus: 900,
  vmX: 1010,
  // all networks: one port every 100 units from here
  allX0: 520,
  allDx: 100,
}

/** The packet's polyline. The example VM reaches zcore the way frames do: up its
 *  portgroup to the trunk segment, along it to zcore's eth1, then to its sub-interface. */
export function routePoints(
  n: ZpodNetworkView,
  path: TopologyPath,
  verdict: Verdict
): { pts: [number, number][]; blocked?: [number, number] } {
  const px = L.focusX
  const E = L.eth0X
  const up: [number, number][] = [
    [L.vmX, L.portY],
    [L.vmX, L.trunkY],
    [L.eth1X, L.trunkY],
    [L.eth1X, L.eth1TrunkY],
    [px, L.eth1TrunkY],
    [px, L.portY],
  ]
  if (n.status !== "ACTIVE") return { pts: up, blocked: [px, L.portY] }
  if (path === "internet") {
    const p: [number, number][] = [...up, [E, L.portY], [E, L.eth0Y], [E, L.trunkY], [E, 80], [230, 80], [80, 80]]
    return verdict === "ok" ? { pts: p } : { pts: [...p.slice(0, 10), [L.zpodLeft, 80]], blocked: [L.zpodLeft, 80] }
  }
  if (path === "fabric") {
    const f: [number, number][] = [[90, 330], [230, 80], [E, 80], [E, L.trunkY], [E, L.eth0Y], [E, L.portY], ...[...up].reverse()]
    return verdict === "ok" ? { pts: f } : { pts: [[90, 330], [230, 80], [304, 80]], blocked: [L.zpodLeft, 80] }
  }
  return { pts: [...up, [E, L.portY], [E, L.eth0Y]] }
}

export function pointsToPath(pts: [number, number][]): string {
  return "M" + pts.map(([x, y]) => `${x},${y}`).join(" L")
}

export function networkMode(n: ZpodNetworkView): "down" | "global" | "pending" | "masquerade" | "local" {
  if (n.status !== "ACTIVE") return "down"
  if (n.routing === "GLOBAL") return "global"
  if (n.routing === "PENDING") return "pending"
  return n.masquerade ? "masquerade" : "local"
}
