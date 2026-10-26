import { useEffect, useState } from "react"
import { useApi } from "@/hooks/use-api"
import { apiErrorMessage } from "@/lib/network-utils"
import { FINAL_RUN_STATES } from "@/lib/storage-utils"
import type { ZpodDiskRunView } from "@/types"

const POLL_MS = 3000 // as zcli does

/** Follow a disk flow run until it reaches a final state. Polling stops on unmount. */
export function useDiskRun(
  zpodId: number,
  flowRunId: string | null,
  onFinal?: (run: ZpodDiskRunView) => void
): { run: ZpodDiskRunView | null; error: string | null } {
  const { fetchZpodDiskRun } = useApi()
  const [run, setRun] = useState<ZpodDiskRunView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRun(null)
    setError(null)
    if (!flowRunId) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const r = await fetchZpodDiskRun(zpodId, flowRunId)
        if (stop) return
        setRun(r)
        setError(null)
        if (FINAL_RUN_STATES.includes(r.state)) {
          onFinal?.(r)
          return
        }
      } catch (err) {
        if (stop) return
        setError(apiErrorMessage(err, "Could not read the disk run"))
      }
      timer = setTimeout(poll, POLL_MS)
    }
    poll()
    return () => {
      stop = true
      clearTimeout(timer)
    }
    // onFinal is read once per run on purpose: a new callback must not restart the polling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zpodId, flowRunId, fetchZpodDiskRun])

  return { run, error }
}
