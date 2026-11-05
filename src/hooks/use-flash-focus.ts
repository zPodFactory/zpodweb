import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"

/**
 * Deep-link focus for list pages: `?<param>=<id>` scrolls to the element `#<param>-<id>` once the
 * page has its data, and returns that id for a few seconds so the page can outline it. The
 * outline also goes at the first click anywhere. The param is dropped from the URL right away,
 * so a reload or a polling refresh does not flash it again.
 */
export function useFlashFocus(param: string, ready: boolean): string | null {
  const [searchParams, setSearchParams] = useSearchParams()
  const focus = searchParams.get(param)
  const [flash, setFlash] = useState<string | null>(null)
  // The id last taken from the URL, so the same link clicked again later flashes again
  const [taken, setTaken] = useState<string | null>(null)

  // State adjusted during render rather than in an effect (react-hooks/set-state-in-effect)
  if (ready && focus && focus !== taken) {
    setTaken(focus)
    setFlash(focus)
  } else if (!focus && taken) {
    setTaken(null)
  }

  useEffect(() => {
    if (!flash) return
    // A moment later: a page may switch a tab or unfold a block to show the target first
    const scroll = setTimeout(() => {
      document.getElementById(`${param}-${flash}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 50)
    setSearchParams(
      (prev) => {
        if (!prev.has(param)) return prev
        const next = new URLSearchParams(prev)
        next.delete(param)
        return next
      },
      { replace: true }
    )
    const clear = () => setFlash(null)
    const timer = setTimeout(clear, 3000)
    document.addEventListener("pointerdown", clear)
    return () => {
      clearTimeout(scroll)
      clearTimeout(timer)
      document.removeEventListener("pointerdown", clear)
    }
  }, [flash, param, setSearchParams])

  return flash
}

/** The outline a flashed card gets */
export const FLASH_CARD = "ring-2 ring-[#89b4fa]/70"
/** The same for a table row, where a ring does not render: an inset edge and a tint */
export const FLASH_ROW = "bg-[#89b4fa]/10 shadow-[inset_0_0_0_2px_rgba(137,180,250,0.7)]"
/**
 * A block of table rows outlined as one frame (a whole group of a table): the first row takes the
 * top edge, the last the bottom one, every row the sides. Thicker than FLASH_ROW, to read as a
 * section rather than a row.
 */
export const FLASH_FRAME = {
  top: "bg-[#89b4fa]/10 shadow-[inset_3px_0_0_rgba(137,180,250,0.8),inset_-3px_0_0_rgba(137,180,250,0.8),inset_0_3px_0_rgba(137,180,250,0.8)]",
  middle: "bg-[#89b4fa]/10 shadow-[inset_3px_0_0_rgba(137,180,250,0.8),inset_-3px_0_0_rgba(137,180,250,0.8)]",
  bottom: "bg-[#89b4fa]/10 shadow-[inset_3px_0_0_rgba(137,180,250,0.8),inset_-3px_0_0_rgba(137,180,250,0.8),inset_0_-3px_0_rgba(137,180,250,0.8)]",
} as const
