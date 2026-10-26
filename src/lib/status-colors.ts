/** Status badge color classes — Catppuccin Mocha palette */

/** Statuses that represent ongoing work (should show spinner) */
const IN_PROGRESS_STATUSES = new Set([
  "PENDING",
  "BUILDING",
  "CONFIG_SCRIPTS",
  "POST_SCRIPTS",
  "DELETING",
])

export function isInProgressStatus(status: string): boolean {
  return IN_PROGRESS_STATUSES.has(status)
}

export function statusClasses(status: string): string {
  // Catch all *_FAILED statuses with red
  if (status.endsWith("_FAILED") || status === "FAILED_UNKNOWN") {
    // Red #f38ba8
    return "bg-[#f38ba8]/15 text-[#f38ba8] border-[#f38ba8]/30"
  }

  switch (status) {
    case "ACTIVE":
    case "COMPLETED":
    case "ENABLED":
      // Green #a6e3a1
      return "bg-[#a6e3a1]/15 text-[#a6e3a1] border-[#a6e3a1]/30"
    case "BUILDING":
    case "CONFIG_SCRIPTS":
    case "POST_SCRIPTS":
    case "DOWNLOADING":
    case "IN_PROGRESS":
      // Blue #89b4fa
      return "bg-[#89b4fa]/15 text-[#89b4fa] border-[#89b4fa]/30"
    case "PENDING":
      // Yellow #f9e2af
      return "bg-[#f9e2af]/15 text-[#f9e2af] border-[#f9e2af]/30"
    case "DELETING":
    case "DELETED":
      // Peach #fab387
      return "bg-[#fab387]/15 text-[#fab387] border-[#fab387]/30"
    case "TBD":
      // Violet / Mauve #cba6f7
      return "bg-[#cba6f7]/15 text-[#cba6f7] border-[#cba6f7]/30"
    case "INACTIVE":
    case "NOT_STARTED":
    default:
      // Overlay 1 #7f849c
      return "bg-[#7f849c]/15 text-[#7f849c] border-[#7f849c]/30"
  }
}

/** Live status of a zPod network (read from zboxapi on every list). */
export function networkStatusClasses(status: string): string {
  switch (status) {
    case "ACTIVE":
      // Green #a6e3a1
      return "bg-[#a6e3a1]/15 text-[#a6e3a1] border-[#a6e3a1]/30"
    case "DISABLED":
      // Red-orange #f2805e: down on purpose, but still close to red
      return "bg-[#f2805e]/15 text-[#f2805e] border-[#f2805e]/40"
    case "MISSING":
      // Red #f38ba8
      return "bg-[#f38ba8]/15 text-[#f38ba8] border-[#f38ba8]/30"
    default:
      // UNKNOWN: Overlay 1 #7f849c
      return "bg-[#7f849c]/15 text-[#7f849c] border-[#7f849c]/30"
  }
}

/** Routing of a zPod network: GLOBAL is the one to notice, as in zcli. */
export function networkRoutingClasses(routing: string): string {
  switch (routing) {
    case "GLOBAL":
      // Peach #fab387
      return "bg-[#fab387]/15 text-[#fab387] border-[#fab387]/45"
    case "PENDING":
      // Yellow #f9e2af
      return "bg-[#f9e2af]/10 text-[#f9e2af] border-[#f9e2af]/30"
    default:
      // LOCAL: Blue #89b4fa
      return "bg-[#89b4fa]/10 text-[#89b4fa] border-[#89b4fa]/30"
  }
}

/** Text colour of a network kind (zpod, zcore, user). */
export function networkKindTextClass(kind: string): string {
  switch (kind) {
    case "zpod":
      return "text-[#b4befe]" // Lavender
    case "user":
      return "text-[#94e2d5]" // Teal
    default:
      return "text-[#7f849c]" // zcore: Overlay 1, configured by the image, read-only
  }
}

/** Who a storage, folder or export belongs to: zcore's own, a protected one, or the user's. */
/** LVM (partition, VG, LV) stands out; raw (one partition), the common case, stays muted. */
export function storageLayoutClasses(layout: "raw" | "lvm"): string {
  return layout === "lvm"
    ? "bg-[#f5c2e7]/10 text-[#f5c2e7] border-[#f5c2e7]/40" // Pink
    : "text-muted-foreground"
}

export function storageKindClasses(kind: "zcore" | "user" | "protected" | "system"): string {
  switch (kind) {
    case "zcore":
      return "bg-[#f9e2af]/10 text-[#f9e2af] border-[#f9e2af]/30" // Yellow
    case "protected":
      return "bg-[#fab387]/15 text-[#fab387] border-[#fab387]/40" // Peach
    case "system":
      return "bg-[#7f849c]/15 text-[#a6adc8] border-[#7f849c]/30" // Overlay 1
    default:
      return "bg-[#94e2d5]/10 text-[#94e2d5] border-[#94e2d5]/30" // user: Teal
  }
}

/** A disk flow run's Prefect state. */
export function runStateClasses(state: string): string {
  switch (state) {
    case "COMPLETED":
      return "bg-[#a6e3a1]/15 text-[#a6e3a1] border-[#a6e3a1]/30"
    case "FAILED":
    case "CRASHED":
    case "CANCELLED":
      return "bg-[#f38ba8]/15 text-[#f38ba8] border-[#f38ba8]/30"
    default:
      // SCHEDULED, PENDING, RUNNING
      return "bg-[#cba6f7]/15 text-[#cba6f7] border-[#cba6f7]/30"
  }
}
