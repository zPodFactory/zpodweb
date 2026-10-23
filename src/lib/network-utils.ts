/** IPv4 helpers and the client-side checks for zPod networks.
 *  zpodapi stays the judge; these only save a round trip and keep the UI honest. */

import type { ZpodNetwork, ZpodNetworkView } from "@/types"

export function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

export function intToIp(ip: number): string {
  return [(ip >>> 24) & 0xff, (ip >>> 16) & 0xff, (ip >>> 8) & 0xff, ip & 0xff].join(".")
}

function prefixMask(prefixLen: number): number {
  return prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0
}

export function cidrToNetworkIp(cidr: string): number {
  const [ipStr, prefixStr] = cidr.split("/")
  const prefixLen = parseInt(prefixStr, 10)
  if (isNaN(prefixLen)) return 0
  return (ipToInt(ipStr) & prefixMask(prefixLen)) >>> 0
}

/** Network address + 1: the T1 on the management network. */
export function cidrToGateway(cidr: string): string {
  return intToIp((cidrToNetworkIp(cidr) | 1) >>> 0)
}

/** Network address + 2: zcore's address on the management network (DNS for every network). */
export function cidrToZcoreIp(cidr: string): string {
  return intToIp((cidrToNetworkIp(cidr) | 2) >>> 0)
}

/** VLAN id from the last octet of a deploy-time /26 (older zpodapi without `vlan_id`). */
export function cidrToVlanId(cidr: string): number {
  return cidrToNetworkIp(cidr) & 0xff
}

export function cidrPrefix(cidr: string): string {
  return cidr.split("/")[1] ?? "0"
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export interface ParsedGateway {
  cidr: string // the subnet, e.g. "10.42.111.0/24"
  address: string // the gateway itself, e.g. "10.42.111.1"
  prefix: number
  firstHost: string
  lastHost: string
  hosts: number // firstHost to lastHost, the gateway included
}

/** Parse a gateway written like zpodapi wants it: a host address with its prefix,
 *  /8 to /30. Returns the error zpodapi would give, in its words, or the subnet. */
export function parseGateway(value: string): { ok: true; gw: ParsedGateway } | { ok: false; error: string } {
  const [address, prefixStr, extra] = value.trim().split("/")
  if (extra !== undefined || !IPV4.test(address ?? "") || !/^\d{1,2}$/.test(prefixStr ?? "")) {
    return { ok: false, error: "Write the gateway as an IPv4 address with a prefix, like 10.42.111.1/24" }
  }
  const prefix = parseInt(prefixStr, 10)
  if (prefix < 8 || prefix > 30) {
    return { ok: false, error: "The prefix must be between /8 and /30" }
  }
  const ip = ipToInt(address)
  const net = (ip & prefixMask(prefix)) >>> 0
  const broadcast = (net | (~prefixMask(prefix) >>> 0)) >>> 0
  if (ip === net || ip === broadcast) {
    return { ok: false, error: "The gateway must be a host address, not the network or broadcast address" }
  }
  return {
    ok: true,
    gw: {
      cidr: `${intToIp(net)}/${prefix}`,
      address,
      prefix,
      firstHost: intToIp(net + 1),
      lastHost: intToIp(broadcast - 1),
      hosts: broadcast - net - 1,
    },
  }
}

export function cidrsOverlap(a: string, b: string): boolean {
  const [, pa] = a.split("/")
  const [, pb] = b.split("/")
  const prefix = Math.min(parseInt(pa, 10), parseInt(pb, 10))
  if (isNaN(prefix)) return false
  return ((cidrToNetworkIp(a) ^ cidrToNetworkIp(b)) & prefixMask(prefix)) === 0
}

/** VLAN ids zboxapi keeps for itself: zcore's nested-VCF VLANs and the zPod's routed /26s. */
export const RESERVED_VLANS: Record<number, string> = {
  10: "Reserved for zcore's nested VCF VLANs",
  20: "Reserved for zcore's nested VCF VLANs",
  30: "Reserved for zcore's nested VCF VLANs",
  64: "Reserved for the zPod's routed /26",
  128: "Reserved for the zPod's routed /26",
  192: "Reserved for the zPod's routed /26",
}

export function validateNetworkName(name: string, existing: { name: string }[]): string | null {
  const value = name.trim()
  if (!value) return "Give the network a name"
  if (value.length > 32) return "32 characters at most"
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return "Start with a letter; then letters, digits, - or _"
  if (existing.some((n) => n.name.toLowerCase() === value.toLowerCase())) {
    return `${value} is already used on this zPod`
  }
  return null
}

export function validateVlan(value: string, existing: { vlan_id: number; name: string }[]): string | null {
  if (!/^\d+$/.test(value.trim())) return "A number between 1 and 4094"
  const vlan = parseInt(value, 10)
  if (vlan < 1 || vlan > 4094) return "A number between 1 and 4094"
  if (RESERVED_VLANS[vlan]) return RESERVED_VLANS[vlan]
  const used = existing.find((n) => n.vlan_id === vlan)
  if (used) return `Already used by ${used.name}`
  return null
}

/** The first overlap of a candidate subnet with the zPod's networks or the endpoint pool. */
export function findOverlap(
  cidr: string,
  networks: { name: string; cidr: string }[],
  pool: string | null
): string | null {
  for (const n of networks) {
    if (cidrsOverlap(cidr, n.cidr)) return `${cidr} overlaps ${n.name} (${n.cidr})`
  }
  if (pool && /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(pool) && cidrsOverlap(cidr, pool)) {
    return `${cidr} overlaps the endpoint's zPod pool ${pool}. Pick a subnet outside it.`
  }
  return null
}

/** An example host on a network: network address + 10 (+ 11 when that is the gateway). */
export function sampleHost(gateway: string): string {
  const [address, prefixStr] = gateway.split("/")
  const prefix = parseInt(prefixStr, 10)
  if (!address || isNaN(prefix)) return ""
  const net = (ipToInt(address) & prefixMask(prefix)) >>> 0
  let host = net + 10
  if (host === ipToInt(address)) host += 1
  return `${intToIp(host)}/${prefix}`
}

/** What zboxapi on this zcore can do. zboxapi 0.2.0 (zcore 13.7) brought masquerade and
 *  the enable/disable routes; zcore 13.5 ships 0.1.1 without them. An unknown version is
 *  given the benefit of the doubt: zpodapi still answers 501 when the feature is missing. */
export function zcoreNetworkFeatures(zcoreVersion: string): { masquerade: boolean; toggle: boolean } {
  const m = zcoreVersion.match(/^(\d+)\.(\d+)/)
  if (!m) return { masquerade: true, toggle: true }
  const major = parseInt(m[1], 10)
  const minor = parseInt(m[2], 10)
  const ok = major > 13 || (major === 13 && minor >= 7)
  return { masquerade: ok, toggle: ok }
}

/** The management network: VLAN 0 by kind when zpodapi says so, else the first one. */
export function managementNetwork<T extends ZpodNetwork | ZpodNetworkView>(networks: T[]): T | undefined {
  return networks.find((n) => n.kind === "zpod" && n.vlan_id === 0) ?? networks[0]
}

/** zpodapi's error text: its `detail` string, or the messages of a validation 422. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === "string" && detail) return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d as { msg?: string })?.msg?.replace(/^Value error, /, ""))
      .filter(Boolean)
    if (msgs.length) return msgs.join("; ")
  }
  return fallback
}

/** zboxapi's own 404 for a route it does not have (zboxapi 0.1.1 on zcore 13.5),
 *  as opposed to a 404 about the VLAN itself ("VLAN 400 not found"). */
export function isMissingZboxapiRoute(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response
  return res?.status === 404 && res.data?.detail === "Not Found"
}

/** True when zpodapi has the user-networks API (its network rows carry `kind`). */
export function hasNetworksApi(networks: ZpodNetwork[] | undefined): boolean {
  return !!networks?.length && networks.every((n) => typeof n.kind === "string")
}
