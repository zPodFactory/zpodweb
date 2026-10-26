/** Helpers for the zPod Storage card: sizes, usage colours, names and the checks
 *  zboxapi makes. zpodapi stays the judge; these only save a round trip. */

import type { ZpodDiskView, ZpodStorageView } from "@/types"

const GIB = 1024 ** 3

/** Bytes as GiB with one decimal: "404.3 GiB". */
export function formatGiB(bytes: number): string {
  return `${(bytes / GIB).toFixed(1)} GiB`
}

/** Bytes as whole GiB, for a filesystem's size: "492 GiB". */
export function formatGiBWhole(bytes: number): string {
  return `${Math.round(bytes / GIB)} GiB`
}

/** Used share of a storage as df shows it: used / (used + available). */
export function usagePercent(s: Pick<ZpodStorageView, "used_bytes" | "available_bytes">): number {
  const total = s.used_bytes + s.available_bytes
  return total > 0 ? (s.used_bytes / total) * 100 : 0
}

/** Usage bands: green under 60%, yellow under 75%, orange under 90%, red from 90%. */
export function usageColor(pct: number): { bar: string; text: string; strong: boolean } {
  if (pct >= 90) return { bar: "bg-[#f38ba8]", text: "text-[#f38ba8]", strong: true } // Red
  if (pct >= 75) return { bar: "bg-[#fab387]", text: "text-[#fab387]", strong: true } // Peach
  if (pct >= 60) return { bar: "bg-[#f9e2af]", text: "text-muted-foreground", strong: false } // Yellow
  return { bar: "bg-[#a6e3a1]", text: "text-muted-foreground", strong: false } // Green
}

/** The name zboxapi gives a new storage when none is asked for. */
export function nextStorageName(storages: { name: string }[]): string {
  const taken = new Set(storages.map((s) => s.name))
  let n = 2
  while (taken.has(`STORAGE${String(n).padStart(2, "0")}`)) n += 1
  return `STORAGE${String(n).padStart(2, "0")}`
}

export function validateStorageName(name: string, storages: { name: string }[]): string | null {
  const value = name.trim()
  if (!/^STORAGE\d{2,3}$/.test(value)) return "STORAGE followed by two or three digits, like STORAGE03"
  if (storages.some((s) => s.name === value)) return `${value} already exists`
  return null
}

export function validateFolderName(name: string, existing: { name: string }[]): string | null {
  const value = name.trim()
  if (!value) return "Give the folder a name"
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(value)) {
    return "Start with a letter or digit; then letters, digits, . - or _ (63 at most)"
  }
  if (existing.some((f) => f.name === value)) return `${value} already exists on this storage`
  return null
}

export function validateOwner(value: string): string | null {
  return /^[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$/.test(value.trim()) ? null : "user:group, like root:root"
}

export function validateMode(value: string): string | null {
  return /^[0-7]{3,4}$/.test(value.trim()) ? null : "Octal, like 0777 or 755"
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** An NFS client as zpodapi takes it: an IPv4 address, an IPv4 network, or * for everyone. */
export function validateNfsClient(value: string): string | null {
  const v = value.trim()
  if (v === "*") return null
  const [address, prefix, extra] = v.split("/")
  if (extra === undefined && IPV4.test(address ?? "")) {
    if (prefix === undefined) return null
    if (/^\d{1,2}$/.test(prefix) && parseInt(prefix, 10) <= 32) return null
  }
  return "An IPv4 address or network, like 10.42.111.25 or 10.42.111.0/24"
}

/** exports(5) options for every client. zcli's default is read-write with no_root_squash. */
export function nfsOptions(readOnly: boolean, noRootSquash: boolean): string {
  return [readOnly ? "ro" : "rw", "no_subtree_check", noRootSquash && "no_root_squash"].filter(Boolean).join(",")
}

export function parseNfsOptions(options: string): { readOnly: boolean; noRootSquash: boolean } {
  const parts = options.split(",")
  return { readOnly: parts.includes("ro"), noRootSquash: parts.includes("no_root_squash") }
}

/** A short "rw · no_root_squash" for a table cell. */
export function nfsAccessLabel(options: string): string {
  const { readOnly, noRootSquash } = parseNfsOptions(options)
  return [readOnly ? "ro" : "rw", noRootSquash && "no_root_squash"].filter(Boolean).join(" · ")
}

/** zpodapi's 501: this zcore's zboxapi is too old for storage management. */
export function isNotImplemented(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 501
}

/** The blank disks a storage can be created on: this zPod's, ACTIVE, nothing on them. */
export function blankDisks(disks: ZpodDiskView[]): ZpodDiskView[] {
  return disks.filter((d) => d.state === "blank" && d.status === "ACTIVE" && d.id !== null && d.device)
}

/** The largest disk zpodapi adds or grows to (zpodfactory_zpod_disk_max_gb). */
export const DISK_MAX_GB = 2048

export const FINAL_RUN_STATES = ["COMPLETED", "FAILED", "CRASHED", "CANCELLED"]
