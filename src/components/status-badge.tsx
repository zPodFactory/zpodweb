import { Badge } from "@/components/ui/badge"
import { statusClasses, isInProgressStatus } from "@/lib/status-colors"
import { Loader2 } from "lucide-react"

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={`gap-1 ${statusClasses(status)}`}>
      {isInProgressStatus(status) && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      {status}
    </Badge>
  )
}
