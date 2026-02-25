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
