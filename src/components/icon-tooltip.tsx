import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

interface IconTooltipProps {
  label: string
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
}

export function IconTooltip({ label, children, side = "top" }: IconTooltipProps) {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        className="w-auto px-3 py-1.5 bg-[#181825] border-[#313244]"
      >
        <p className="text-xs text-zinc-300 whitespace-nowrap">{label}</p>
      </HoverCardContent>
    </HoverCard>
  )
}
