import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"
import { apiErrorMessage } from "@/lib/network-utils"
import type { ZpodNetworkRoutingRunView, ZpodNetworkView } from "@/types"

/** A routing run started from this page, kept so the dialog can be reopened on it. */
export interface RoutingRun {
  flowRunId: string
  target: "GLOBAL" | "LOCAL"
  dryRun: boolean
  masqueradeAfter: boolean
}

interface ZpodNetworkRoutingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  zpodId: number
  zpodName: string
  network: ZpodNetworkView
  target: "GLOBAL" | "LOCAL"
  /** Reopen on a run already started (the row's "Show routing run"). */
  run: RoutingRun | null
  masqueradeSupported: boolean
  onRunStarted: (name: string, run: RoutingRun) => void
  onChanged: () => void
}

const FINAL_STATES = ["COMPLETED", "FAILED", "CRASHED", "CANCELLED"]
const POLL_MS = 3000 // as zcli does
// Prefect's state types in the order a run goes through them
const STEPS = ["SCHEDULED", "PENDING", "RUNNING"]

export function ZpodNetworkRoutingDialog({
  open,
  onOpenChange,
  zpodId,
  zpodName,
  network,
  target,
  run,
  masqueradeSupported,
  onRunStarted,
  onChanged,
}: ZpodNetworkRoutingDialogProps) {
  const { setZpodNetworkRouting, fetchZpodNetworkRoutingRun, setZpodNetworkMasquerade } = useApi()
  const advertise = target === "GLOBAL"
  const [dryRun, setDryRun] = useState(false)
  const [masqueradeAfter, setMasqueradeAfter] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<RoutingRun | null>(null)
  const [state, setState] = useState<ZpodNetworkRoutingRunView | null>(null)
  const [seen, setSeen] = useState<string[]>([])
  const followUpDone = useRef(false)

  // Reset only when the dialog opens. `run` follows the network's PENDING state and goes
  // back to null when a run ends; resetting on that would drop the verdict on screen.
  const runAtOpen = useRef(run)
  runAtOpen.current = run
  useEffect(() => {
    if (!open) return
    const run = runAtOpen.current
    setDryRun(false)
    setMasqueradeAfter(masqueradeSupported)
    setStarting(false)
    setError(null)
    setCurrent(run)
    setState(null)
    setSeen([])
    followUpDone.current = false
  }, [open, masqueradeSupported])

  // Follow the run until it reaches a final state. Closing the dialog leaves it going.
  useEffect(() => {
    if (!open || !current) return
    let stop = false
    const poll = async () => {
      try {
        const r = await fetchZpodNetworkRoutingRun(zpodId, network.name, current.flowRunId)
        if (stop) return
        setState(r)
        setSeen((s) => (s.includes(r.state) ? s : [...s, r.state]))
        if (FINAL_STATES.includes(r.state)) {
          stop = true
          onChanged()
          if (
            r.state === "COMPLETED" &&
            !current.dryRun &&
            current.target === "LOCAL" &&
            current.masqueradeAfter &&
            !followUpDone.current
          ) {
            followUpDone.current = true
            try {
              await setZpodNetworkMasquerade(zpodId, network.name, true)
              toast.success(`Masquerade is on for ${network.name}`)
              onChanged()
            } catch (err) {
              toast.error("Could not turn masquerade on", {
                description: apiErrorMessage(err, `Masquerade on ${network.name} failed`),
              })
            }
          }
        }
      } catch (err) {
        if (!stop) setError(apiErrorMessage(err, "Could not read the routing run"))
      }
    }
    poll()
    const id = setInterval(() => {
      if (!stop) poll()
    }, POLL_MS)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [open, current, zpodId, network.name, fetchZpodNetworkRoutingRun, setZpodNetworkMasquerade, onChanged])

  // `asDryRun` overrides the checkbox: "Advertise for real" after a passed dry run launches
  // the real flow straight away instead of going back to the confirmation step.
  const start = async (asDryRun: boolean = advertise && dryRun) => {
    setStarting(true)
    setError(null)
    try {
      const res = await setZpodNetworkRouting(zpodId, network.name, target, asDryRun)
      onChanged()
      if (!res.flow_run_id) {
        toast.info(`${network.name} is already ${target}`, { description: "Nothing to do." })
        onOpenChange(false)
        return
      }
      const started: RoutingRun = {
        flowRunId: res.flow_run_id,
        target,
        dryRun: asDryRun,
        masqueradeAfter: !advertise && masqueradeSupported && masqueradeAfter,
      }
      onRunStarted(network.name, started)
      setState(null)
      setSeen([])
      setCurrent(started)
    } catch (err) {
      setError(apiErrorMessage(err, `Could not change the routing of ${network.name}`))
    } finally {
      setStarting(false)
    }
  }

  const finished = state && FINAL_STATES.includes(state.state)
  const failed = finished && state.state !== "COMPLETED"
  const verb = (current?.target ?? target) === "GLOBAL" ? "Advertising" : "Withdrawing"

  return (
    <Dialog open={open} onOpenChange={(o) => !starting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[500px]">
        {!current ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {advertise ? `Advertise ${network.name} to the fabric?` : `Withdraw ${network.name} from the fabric?`}
              </DialogTitle>
              <DialogDescription>
                {advertise
                  ? `${network.cidr} becomes reachable from everything the NSX T0 routes.`
                  : `Deletes the T1 static route ${zpodName}-${network.name}. ${network.cidr} is then routed inside the zPod only.`}
              </DialogDescription>
            </DialogHeader>
            {advertise ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  Checks first: the VLAN is up on zcore, and the subnet overlaps nothing the fabric routes (the T0
                  routing table, every T1 static route, every segment, every other user network).
                </li>
                <li>
                  Writes the T1 static route <span className="font-mono">{zpodName}-{network.name}</span> → zcore.
                </li>
                {network.masquerade && <li className="text-[#fab387]">Turns masquerade off on this network.</li>}
              </ul>
            ) : (
              <p className="rounded-md border border-[#f9e2af]/30 bg-[#f9e2af]/10 px-3 py-2 text-sm text-[#f9e2af]">
                Once local, {network.name} has no egress until masquerade is turned on.
              </p>
            )}
            {advertise ? (
              <CheckRow
                id="routing-dry-run"
                checked={dryRun}
                onChange={setDryRun}
                label="Run the checks only (dry run)"
                hint={`Nothing changes; ${network.name} stays ${network.routing}.`}
              />
            ) : (
              masqueradeSupported && (
                <CheckRow
                  id="routing-masq-after"
                  checked={masqueradeAfter}
                  onChange={setMasqueradeAfter}
                  label="Turn masquerade on when the withdrawal completes"
                  hint={`Same as zcli zpod network masquerade on ${zpodName} ${network.name}`}
                />
              )
            )}
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={starting}>
                Cancel
              </Button>
              <Button onClick={() => start()} disabled={starting}>
                {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {advertise ? (dryRun ? "Run checks" : "Advertise") : "Withdraw"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {verb} {network.name}
                {current.dryRun && " (dry run)"}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {state?.name ?? "starting"} · {current.flowRunId.slice(0, 8)}…
              </DialogDescription>
            </DialogHeader>
            <ol className="divide-y rounded-md border bg-muted/30 text-sm">
              {[...STEPS, finished ? state.state : "COMPLETED"].map((step, i) => {
                const reached = seen.includes(step) || (finished && i < STEPS.length)
                const active = !finished && state?.state === step
                const isFinal = i === STEPS.length
                return (
                  <li key={step} className="flex items-center gap-3 px-3 py-1.5">
                    {active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#89b4fa]" />
                    ) : (
                      <span
                        className={cn(
                          "mx-[3px] h-2 w-2 rounded-full",
                          isFinal && finished
                            ? failed
                              ? "bg-[#f38ba8]"
                              : "bg-[#a6e3a1]"
                            : reached
                              ? "bg-[#a6e3a1]"
                              : "bg-muted-foreground/40"
                        )}
                      />
                    )}
                    <span className={cn(!reached && !active && "text-muted-foreground", isFinal && failed && "text-[#f38ba8]")}>
                      {step.charAt(0) + step.slice(1).toLowerCase()}
                    </span>
                  </li>
                )
              })}
            </ol>
            {!finished && (
              <p className="text-xs text-muted-foreground">
                {current.target === "GLOBAL" ? "Checking the fabric." : "Removing the route."} The row shows PENDING
                until the run ends. You can close this; the run keeps going.
              </p>
            )}
            {finished && !failed && (
              <div className="rounded-md border border-[#a6e3a1]/35 bg-[#a6e3a1]/10 px-3 py-2 text-sm text-[#a6e3a1]">
                {current.dryRun
                  ? `All checks passed. Dry run, nothing changed: ${network.name} stays ${state.network.routing}.`
                  : current.target === "GLOBAL"
                    ? `${network.name} is now GLOBAL. ${state.network.cidr} is routed to zcore by the T1 static route ${zpodName}-${network.name}. Masquerade is off.`
                    : `${network.name} is now LOCAL; the T1 static route is gone.`}
              </div>
            )}
            {failed && (
              <div className="grid gap-1.5">
                <pre className="whitespace-pre-wrap break-words rounded-md border border-[#f38ba8]/40 bg-[#f38ba8]/10 px-3 py-2 font-mono text-xs text-[#f38ba8]">
                  {state.message || `The run ended ${state.state}.`}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Nothing changed on the fabric. {network.name} is back to {state.network.routing}.
                </p>
              </div>
            )}
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              {finished && !failed && current.dryRun ? (
                <>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                  <Button disabled={starting} onClick={() => start(false)}>
                    {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Advertise for real
                  </Button>
                </>
              ) : (
                <Button variant={finished && !failed ? "default" : "outline"} onClick={() => onOpenChange(false)}>
                  {finished && !failed ? "Done" : "Close"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CheckRow({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}
