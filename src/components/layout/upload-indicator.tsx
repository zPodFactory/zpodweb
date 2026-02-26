import { useUploadStore, type UploadEntry } from "@/stores/upload-store"
import { formatBytes, formatSpeed, formatEta } from "@/lib/utils"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Upload, X, CheckCircle2, AlertCircle, Ban, Trash2 } from "lucide-react"

function dotColor(entry: UploadEntry) {
  if (entry.status === "done") return "bg-[#a6e3a1]"
  if (entry.status === "failed") return "bg-[#f38ba8]"
  if (entry.status === "cancelled") return "bg-[#f9e2af]"
  return "bg-[#cba6f7]"
}

function UploadRow({
  entry,
  isFirst,
  isLast,
}: {
  entry: UploadEntry
  isFirst: boolean
  isLast: boolean
}) {
  const { cancelUpload, removeUpload } = useUploadStore()

  const isActive = entry.status === "uploading"
  const isDone = entry.status === "done"
  const isFailed = entry.status === "failed"
  const isCancelled = entry.status === "cancelled"

  const barColor = isDone
    ? "#a6e3a1"
    : isFailed
      ? "#f38ba8"
      : isCancelled
        ? "#f9e2af"
        : "#cba6f7"

  // The filename row is ~20px tall (text-xs + padding).
  // We vertically center the dot at 10px from the top of the row content.
  const dotTop = "top-[14px]" // py-1 (4px) + half row height (~10px)

  return (
    <div className="relative pl-5 py-1">
      {/* Vertical trunk line — spans full height, hidden above first / below last */}
      <div
        className="absolute left-[1px] w-[2px] bg-zinc-600/60"
        style={{
          top: isFirst ? "14px" : "0",
          bottom: isLast ? "calc(100% - 14px)" : "0",
        }}
      />
      {/* Junction dot */}
      <span className={`absolute left-0 ${dotTop} h-[5px] w-[5px] rounded-full ${dotColor(entry)} -translate-y-1/2`} />
      {/* Horizontal connector */}
      <span className={`absolute left-[5px] ${dotTop} w-[13px] border-t border-zinc-500/70 -translate-y-1/2`} />

      {/* Filename + dismiss */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-300 whitespace-nowrap">{entry.filename}</span>
        <button
          onClick={() => isActive ? cancelUpload(entry.id) : removeUpload(entry.id)}
          className="shrink-0 p-0.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden bg-zinc-700 rounded-full mt-1">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{ width: `${entry.progress}%`, backgroundColor: barColor }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-zinc-400 mt-0.5">
        {isActive && (
          <>
            <span>
              {formatBytes(entry.loaded)} / {formatBytes(entry.total)}
            </span>
            <span className="tabular-nums">{entry.progress.toFixed(1)}%</span>
          </>
        )}
        {isDone && (
          <span className="flex items-center gap-1 text-[#a6e3a1]">
            <CheckCircle2 className="h-3 w-3" />
            Complete — {formatBytes(entry.total)}
          </span>
        )}
        {isFailed && (
          <span className="flex items-center gap-1 text-[#f38ba8]">
            <AlertCircle className="h-3 w-3" />
            Failed{entry.error ? `: ${entry.error}` : ""}
          </span>
        )}
        {isCancelled && (
          <span className="flex items-center gap-1 text-[#f9e2af]">
            <Ban className="h-3 w-3" />
            Cancelled
          </span>
        )}
      </div>

      {isActive && (
        <div className="flex items-center justify-between text-xs text-zinc-500 mt-0.5">
          <span>{formatSpeed(entry.speed)}</span>
          <span>ETA: {formatEta(entry.eta)}</span>
        </div>
      )}
    </div>
  )
}

export function UploadIndicator() {
  const uploads = useUploadStore((s) => s.uploads)

  const entries = Array.from(uploads.values())
  if (entries.length === 0) return null

  const activeCount = entries.filter((e) => e.status === "uploading").length
  const failedCount = entries.filter((e) => e.status === "failed").length
  const cancelledCount = entries.filter((e) => e.status === "cancelled").length

  const isUploading = activeCount > 0
  const hasFailed = failedCount > 0
  const hasCancelled = cancelledCount > 0

  const badgeColor = isUploading
    ? "bg-[#cba6f7] animate-pulse"
    : hasFailed
      ? "bg-[#f38ba8]"
      : hasCancelled
        ? "bg-[#f9e2af]"
        : "bg-[#a6e3a1]"

  const badgeCount = isUploading
    ? activeCount
    : hasFailed
      ? failedCount
      : hasCancelled
        ? cancelledCount
        : entries.length

  return (
    <HoverCard openDelay={200} closeDelay={300}>
      <HoverCardTrigger asChild>
        <button className="relative flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span
            className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${badgeColor}`}
          >
            {badgeCount}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        className="w-auto min-w-[280px] px-4 py-3 bg-[#181825] border-[#313244]"
        side="bottom"
        align="end"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-bold text-zinc-100">
            {isUploading
              ? `Component uploads: ${activeCount} active`
              : hasFailed
                ? `Component uploads: ${failedCount} failed`
                : hasCancelled
                  ? `Component uploads: ${cancelledCount} cancelled`
                  : "Component uploads"}
          </p>
          {entries.some((e) => e.status !== "uploading") && (
            <button
              onClick={() => useUploadStore.getState().clearCompleted()}
              className="flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-700/50 hover:bg-zinc-600/60 px-2 py-1 rounded transition-colors whitespace-nowrap"
            >
              <Trash2 className="h-3 w-3" />
              Clear finished
            </button>
          )}
        </div>
        <div className="mt-2.5">
          {entries.map((entry, i) => (
            <UploadRow
              key={entry.id}
              entry={entry}
              isFirst={i === 0}
              isLast={i === entries.length - 1}
            />
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
