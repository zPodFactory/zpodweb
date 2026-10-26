import { cn } from "@/lib/utils"

/** One row's piece of a vertical tree trunk: a line through a junction dot. The line stops
 *  above the dot on the first row and below it on the last. Its row must be a flex row;
 *  the trunk stretches to the row's height so the rows join into one line. */
export function TreeTrunk({ first = false, last = false }: { first?: boolean; last?: boolean }) {
  return (
    <div aria-hidden className="flex w-0.5 shrink-0 flex-col items-center self-stretch">
      <div className={cn("w-full flex-1", !first && "bg-zinc-600/60")} />
      <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-zinc-400" />
      <div className={cn("w-full flex-1", !last && "bg-zinc-600/60")} />
    </div>
  )
}

/** The short line from a trunk's dot to the row's content. */
export function TreeConnector({ className }: { className?: string }) {
  return <span aria-hidden className={cn("w-3.5 shrink-0 border-t border-zinc-500/70", className)} />
}
