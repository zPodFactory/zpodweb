import { useState, useMemo } from "react"

export type SortDirection = "asc" | "desc"

export interface SortConfig {
  key: string
  direction: SortDirection
}

export function useSort<T>(
  data: T[],
  defaultKey: string,
  defaultDirection: SortDirection = "asc"
) {
  const [sort, setSort] = useState<SortConfig>({
    key: defaultKey,
    direction: defaultDirection,
  })

  const sorted = useMemo(() => {
    const copy = [...data]
    copy.sort((a, b) => {
      const aVal = getNestedValue(a, sort.key)
      const bVal = getNestedValue(b, sort.key)

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      let cmp: number
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      }

      return sort.direction === "asc" ? cmp : -cmp
    })
    return copy
  }, [data, sort])

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    )
  }

  return { sorted, sort, toggleSort }
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}
