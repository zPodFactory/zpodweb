import { useEffect, useRef, useState, type PointerEvent } from "react"
import { HOVER_CARD_DELAY } from "@/lib/hover"

/** How far left of the cursor a hover card starts, so its corner sits under the pointer */
const CARD_CURSOR_INSET = 24

/**
 * A hover card that opens under the cursor rather than at its trigger's left edge: spread
 * `onPointerMove` on the HoverCardTrigger, `onOpenChange` on the HoverCard and pass `alignOffset`
 * to a content aligned "start". The cursor is taken when the card opens (it does not follow it
 * once open). One hook can serve a whole list, as only one of its cards is open at a time.
 */
export function useCursorCard() {
  const cursorX = useRef(0)
  const [alignOffset, setAlignOffset] = useState(0)
  return {
    alignOffset,
    onOpenChange: (open: boolean) => {
      if (open) setAlignOffset(Math.max(0, cursorX.current - CARD_CURSOR_INSET))
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      cursorX.current = e.clientX - e.currentTarget.getBoundingClientRect().left
    },
  }
}


/**
 * A hover card on a whole row (a building zPod's progress in the zPods List view): it opens under
 * the cursor after the app's hover delay, and stays shut while the cursor is on a part of the row
 * matching `holdOn` that opens a card of its own (the zPod's networks). Back on the rest of the row
 * it shows after the same delay as when entering it. Read from pointermove, so leaving the row from
 * that part keeps it shut while the card's close delay runs out.
 */
export function useRowHoverCard(holdOn: string) {
  const cursor = useCursorCard()
  // The row whose card Radix would show, and whether it is held back
  const [row, setRow] = useState<number | null>(null)
  const [held, setHeld] = useState(false)
  const heldRef = useRef(false)
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(release.current), [])

  const hold = (on: boolean) => {
    if (on) {
      clearTimeout(release.current)
      release.current = undefined
      heldRef.current = true
      setHeld(true)
    } else if (heldRef.current && release.current === undefined) {
      release.current = setTimeout(() => {
        release.current = undefined
        heldRef.current = false
        setHeld(false)
      }, HOVER_CARD_DELAY)
    }
  }

  return {
    alignOffset: cursor.alignOffset,
    /** Spread on the row's HoverCard */
    root: (id: number) => ({
      open: row === id && !held,
      onOpenChange: (open: boolean) => {
        cursor.onOpenChange(open)
        setRow((r) => (open ? id : r === id ? null : r))
      },
    }),
    /** Spread on the row's HoverCardTrigger */
    trigger: () => ({
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        cursor.onPointerMove(e)
        hold(!!(e.target as Element).closest(holdOn))
      },
    }),
  }
}
