import type { ProfileItem } from "@/types"

export interface HoverRow {
  pi: ProfileItem
  key: string
  firstInTrunk: boolean
  lastInTrunk: boolean
  parallel: boolean
  firstInGroup: boolean
  lastInGroup: boolean
}

/** Build the flat row list used for the build progress hover card visualization */
export function buildHoverRows(
  profileSteps: (ProfileItem | ProfileItem[])[]
): HoverRow[] {
  const rows: HoverRow[] = []
  const totalVisualRows = profileSteps.reduce(
    (n, s) => n + (Array.isArray(s) ? s.length : 1),
    0
  )
  let rowIdx = 0
  profileSteps.forEach((step, si) => {
    const items = Array.isArray(step) ? step : [step]
    const isParallel = items.length > 1
    items.forEach((pi, ii) => {
      rows.push({
        pi,
        key: `${si}-${ii}`,
        firstInTrunk: rowIdx === 0,
        lastInTrunk: rowIdx === totalVisualRows - 1,
        parallel: isParallel,
        firstInGroup: ii === 0,
        lastInGroup: ii === items.length - 1,
      })
      rowIdx++
    })
  })
  return rows
}
