import { TableHead } from "@/components/ui/table"
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SortConfig } from "@/hooks/use-sort"

interface SortableHeadProps {
  label: string
  sortKey: string
  sort: SortConfig
  onToggle: (key: string) => void
  className?: string
}

export function SortableHead({
  label,
  sortKey,
  sort,
  onToggle,
  className,
}: SortableHeadProps) {
  const active = sort.key === sortKey
  return (
    <TableHead
      className={cn("cursor-pointer select-none", className)}
      onClick={() => onToggle(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sort.direction === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </TableHead>
  )
}
