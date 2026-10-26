import { useState } from "react"
import { Check, ChevronRight, Loader2, Minus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { FINAL_RUN_STATES } from "@/lib/storage-utils"
import { runStateClasses } from "@/lib/status-colors"
import { cn } from "@/lib/utils"
import type { ZpodDiskRunView, ZpodStorageOperation, ZpodStorageStep } from "@/types"

function StepMark({ status }: { status: "running" | "done" | "failed" | "todo" }) {
  return (
    <span
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full",
        status === "done" && "bg-[#a6e3a1] text-[#11111b]",
        status === "failed" && "bg-[#f38ba8] text-[#11111b]",
        status === "running" && "text-[#cba6f7]",
        status === "todo" && "bg-muted text-muted-foreground"
      )}
    >
      {status === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
      {status === "failed" && <X className="h-3 w-3" strokeWidth={3} />}
      {status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
    </span>
  )
}

/** A disk flow run (vCenter): its state, its name and, when it failed, why. */
export function DiskRunPanel({
  title,
  started,
  run,
  error,
}: {
  title: string
  started: boolean // the run was requested and has an id
  run: ZpodDiskRunView | null
  error: string | null
}) {
  const state = run?.state ?? (started ? "SCHEDULED" : "")
  const final = FINAL_RUN_STATES.includes(state)
  const mark = !started ? "todo" : !final ? "running" : state === "COMPLETED" ? "done" : "failed"
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <StepMark status={mark} />
        <span className="text-sm font-medium">{title}</span>
        {state && (
          <Badge variant="outline" className={cn("ml-auto", runStateClasses(state))}>
            {state}
          </Badge>
        )}
      </div>
      {run?.name && <p className="font-mono text-xs text-muted-foreground">{run.name}</p>}
      {run?.message && state !== "COMPLETED" && (
        <p className={cn("text-xs", final ? "text-[#f38ba8]" : "text-muted-foreground")}>{run.message}</p>
      )}
      {error && <p className="text-xs text-[#f38ba8]">{error}</p>}
    </div>
  )
}

function stepMark(step: ZpodStorageStep): "done" | "failed" | "todo" {
  if (step.status === "failed") return "failed"
  if (step.status === "planned" || step.status === "skipped") return "todo"
  return "done"
}

/** zboxapi's step ids, as what each step does. */
const STEP_TITLES: Record<string, string> = {
  rescan: "Rescan the disk",
  partition: "Create the partition",
  growpart: "Grow the partition",
  partx: "Reread the partition table",
  settle: "Wait for the device",
  pv: "Create the LVM physical volume",
  pvresize: "Resize the physical volume",
  vg: "Create the volume group",
  lv: "Create the logical volume",
  lvextend: "Extend the logical volume",
  mkfs: "Create the filesystem",
  resize2fs: "Grow the filesystem",
  mountpoint: "Mount point",
  "mount-unit": "Write the systemd mount unit",
  "daemon-reload": "Reload systemd",
  mount: "Mount the filesystem",
  unmount: "Unmount the filesystem",
}

function stepTitle(step: string): string {
  return STEP_TITLES[step] ?? step.charAt(0).toUpperCase() + step.slice(1).replace(/-/g, " ")
}

/** zboxapi's step table for a storage create, grow or delete. */
export function StorageStepsPanel({
  title,
  number,
  running,
  op,
  error,
}: {
  title: string
  number?: string // the panel's number in a multi-part flow; its steps are numbered under it (2.1, 2.2…)
  running: boolean
  op: ZpodStorageOperation | null
  error: string | null // zboxapi's 500 names the failing step and what it rolled back
}) {
  const [showCommands, setShowCommands] = useState(false)
  const mark = running ? "running" : error ? "failed" : op ? "done" : "todo"
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <StepMark status={mark} />
        <span className="text-sm font-medium">
          {number && `${number} · `}
          {title}
        </span>
        {op && (
          <span className="ml-auto text-xs text-muted-foreground">
            {op.dry_run ? "dry run · " : ""}
            {op.steps.length} steps
          </span>
        )}
      </div>
      {op && op.steps.length > 0 && (
        <div className="divide-y divide-border/60">
          {op.steps.map((s, i) => (
            <div key={`${s.step}-${i}`} className="py-1.5">
              <div className="grid grid-cols-[18px_2.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0.5 text-xs">
                <span
                  className={cn(
                    "self-center",
                    stepMark(s) === "done" && "text-[#a6e3a1]",
                    stepMark(s) === "failed" && "text-[#f38ba8]",
                    stepMark(s) === "todo" && "text-muted-foreground"
                  )}
                >
                  {stepMark(s) === "done" ? <Check className="h-3.5 w-3.5" /> : stepMark(s) === "failed" ? <X className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                </span>
                <span className="font-mono text-muted-foreground">
                  {number ? `${number}.` : ""}
                  {i + 1}
                </span>
                <span className="font-medium" title={s.step}>
                  {stepTitle(s.step)}
                </span>
                <span className={cn("text-right", s.status === "failed" ? "text-[#f38ba8]" : "text-muted-foreground")}>{s.status}</span>
                {/* The target and detail wrap on their own line under the title, never cut */}
                <span className="col-start-3 col-end-5 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                  {s.target}
                  {s.detail && <span className="font-sans"> · {s.detail}</span>}
                </span>
              </div>
              {showCommands && s.command && (
                <pre className="ml-[70px] mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-background/60 p-1.5 font-mono text-[11px] text-muted-foreground">
                  $ {s.command}
                  {s.output ? `\n${s.output}` : ""}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
      {op && op.steps.some((s) => s.command) && (
        <button
          type="button"
          onClick={() => setShowCommands((v) => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", showCommands && "rotate-90")} />
          {showCommands ? "Hide" : "Show"} each step's command and output
        </button>
      )}
      {error && <p className="whitespace-pre-wrap text-xs text-[#f38ba8]">{error}</p>}
    </div>
  )
}
