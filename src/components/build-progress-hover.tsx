import { HoverCardContent } from "@/components/ui/hover-card"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/status-badge"
import { ElapsedTime } from "@/components/elapsed-time"
import { TreeConnector, TreeTrunk } from "@/components/tree-trunk"
import { extractComponentType } from "@/lib/component-colors"
import type { HoverRow } from "@/lib/build-progress"
import type { ZpodComponentView } from "@/types"

interface BuildProgressHoverContentProps {
  creationDate: string
  pct: number
  hoverRows: HoverRow[]
  deployedByUid: Map<string, ZpodComponentView[]>
}

export function BuildProgressHoverContent({
  creationDate,
  pct,
  hoverRows,
  deployedByUid,
}: BuildProgressHoverContentProps) {
  return (
    <HoverCardContent
      className="w-auto min-w-[280px] px-4 py-3 bg-[#181825] border-[#313244]"
      side="top"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-zinc-100">Build Progress</p>
        <span className="text-xs text-zinc-400 tabular-nums">
          (<ElapsedTime date={creationDate} />)
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Progress value={pct} className="h-2 flex-1" />
        <span className="text-xs font-medium text-zinc-300 tabular-nums">
          {pct}%
        </span>
      </div>
      <div className="mt-2.5">
        {hoverRows.map((row) => {
          const candidates = deployedByUid.get(row.pi.component_uid) ?? []
          // Match by hostname when available, otherwise take the first unmatched
          const deployed = (row.pi.hostname
            ? candidates.find((c) => c.hostname === row.pi.hostname)
            : candidates[0]) ?? null
          const name = deployed
            ? (deployed.hostname ?? deployed.component.component_name)
            : (row.pi.hostname ?? extractComponentType(row.pi.component_uid))
          const status = deployed ? deployed.status : "TBD"
          const textColor = deployed ? "text-zinc-300" : "text-zinc-500"
          return (
            <div
              key={row.key}
              className="flex items-center min-h-[28px] text-sm"
            >
              {/* Main trunk vertical with junction dot */}
              <TreeTrunk first={row.firstInTrunk} last={row.lastInTrunk} />
              {row.parallel ? (
                <>
                  {/* Bridge from trunk to branch (first item) or spacer */}
                  {row.firstInGroup ? (
                    <span className="w-2.5 border-t-2 border-[#f5c2e7]/70 shrink-0" />
                  ) : (
                    <span className="w-2.5 shrink-0" />
                  )}
                  {/* Branch vertical with junction dot */}
                  <div className="flex flex-col items-center w-0.5 shrink-0 self-stretch">
                    <div
                      className={`flex-1 w-full${row.firstInGroup ? "" : " bg-[#f5c2e7]/70"}`}
                    />
                    <span className="h-[5px] w-[5px] rounded-full bg-[#f5c2e7] shrink-0" />
                    <div
                      className={`flex-1 w-full${row.lastInGroup ? "" : " bg-[#f5c2e7]/70"}`}
                    />
                  </div>
                  {/* Connector from branch to content */}
                  <span className="w-2.5 border-t-2 border-[#f5c2e7]/70 shrink-0" />
                </>
              ) : (
                <TreeConnector />
              )}
              {/* Component name (left) + status badge (right) */}
              <span className={`${textColor} ml-1.5 truncate text-left`}>
                {name}
              </span>
              <span className="ml-auto pl-3 shrink-0">
                <StatusBadge status={status} />
              </span>
            </div>
          )
        })}
      </div>
    </HoverCardContent>
  )
}
