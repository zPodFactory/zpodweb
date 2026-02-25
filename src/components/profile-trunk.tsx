import { Cpu, HardDrive, MemoryStick, Network } from "lucide-react"
import { extractComponentType, extractComponentVersion, getComponentHex, componentStyles } from "@/lib/component-colors"
import type { ProfileItem } from "@/types"

/** Trunk-line diagram showing profile components with sizing info */
export function ProfileTrunk({ items }: { items: ProfileItem[] }) {
  return (
    <div className="py-4 px-2 overflow-x-auto">
      <div className="text-right text-xs text-zinc-400/70 tracking-wide mb-0.5 pr-1">zPod-trunk-segment</div>
      <div className="relative w-full overflow-hidden" style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)' }}>
        <div className="flex justify-center gap-5 mt-0 flex-wrap">
          {items.map((item, idx) => {
            const hex = getComponentHex(item.component_uid)
            const s = componentStyles(hex)
            const typeLabel = extractComponentType(item.component_uid)
            const version = extractComponentVersion(item.component_uid)
            const hasSpecs = item.vcpu != null || item.vmem != null || item.vnics != null || item.vdisks != null
            return (
              <div key={idx} className="flex flex-col items-center relative">
                <div className="absolute top-0 h-0.5 pointer-events-none" style={{ left: '-50vw', right: '-50vw', background: 'rgb(113 113 122 / 0.35)' }} />
                <div className="w-px h-5" style={s.line} />
                <div
                  className="rounded-lg border px-3 py-2 text-center min-w-[120px] shadow-sm"
                  style={{ ...s.border, ...s.bg }}
                >
                  <div
                    className="text-xs uppercase tracking-wider font-medium"
                    style={s.textMuted}
                  >
                    {typeLabel}
                    {version && <span className="ml-1 normal-case">{version}</span>}
                  </div>
                  <div className="text-xs font-semibold mt-0.5" style={s.text}>
                    {item.hostname ?? "—"}
                  </div>
                  {hasSpecs && (
                    <div className="mt-1.5 pt-1.5 border-t space-y-0.5 text-left" style={{ borderColor: `${hex}33` }}>
                      {item.vcpu != null && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Cpu className="h-2.5 w-2.5 shrink-0" style={s.textMuted} />
                          <span className="text-muted-foreground">vCPU</span>
                          <span className="ml-auto" style={s.text}>{item.vcpu}</span>
                        </div>
                      )}
                      {item.vmem != null && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <MemoryStick className="h-2.5 w-2.5 shrink-0" style={s.textMuted} />
                          <span className="text-muted-foreground">vMem</span>
                          <span className="ml-auto" style={s.text}>{item.vmem} GB</span>
                        </div>
                      )}
                      {item.vnics != null && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Network className="h-2.5 w-2.5 shrink-0" style={s.textMuted} />
                          <span className="text-muted-foreground">vNICs</span>
                          <span className="ml-auto" style={s.text}>{item.vnics}</span>
                        </div>
                      )}
                      {item.vdisks != null && item.vdisks.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <HardDrive className="h-2.5 w-2.5 shrink-0" style={s.textMuted} />
                          <span className="text-muted-foreground">Disks</span>
                          <span className="ml-auto" style={s.text}>
                            {item.vdisks.join("+")} GB
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
