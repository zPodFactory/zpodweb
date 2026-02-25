import { useEffect, useState } from "react"
import { formatElapsed } from "@/lib/utils"

/** Self-updating elapsed time that ticks every second */
export function ElapsedTime({ date }: { date: string }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{formatElapsed(date)}</>
}
