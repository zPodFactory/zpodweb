import { useEffect, useRef } from "react"
import { usePreferencesStore } from "@/stores/preferences-store"

/**
 * Polls a fetch function at the configured interval.
 * Only runs while the component is mounted (current page).
 * Skips polling if interval is 0 (disabled).
 */
export function usePolling(fetchFn: () => void) {
  const pollingInterval = usePreferencesStore((s) => s.pollingInterval)
  const savedFn = useRef(fetchFn)

  // Keep the ref up-to-date without re-triggering the interval
  useEffect(() => {
    savedFn.current = fetchFn
  }, [fetchFn])

  useEffect(() => {
    if (pollingInterval <= 0) return

    const id = setInterval(() => {
      savedFn.current()
    }, pollingInterval * 1000)

    return () => clearInterval(id)
  }, [pollingInterval])
}
