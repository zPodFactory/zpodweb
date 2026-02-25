/** Catppuccin Mocha palette for dynamic component colors */
const CATPPUCCIN = [
  "#f5e0dc", // rosewater
  "#f2cdcd", // flamingo
  "#f5c2e7", // pink
  "#cba6f7", // mauve
  "#f38ba8", // red
  "#eba0ac", // maroon
  "#fab387", // peach
  "#f9e2af", // yellow
  "#a6e3a1", // green
  "#94e2d5", // teal
  "#89dceb", // sky
  "#74c7ec", // sapphire
  "#89b4fa", // blue
  "#b4befe", // lavender
]

/** Extract base component type from uid.
 *  Takes all dash-separated parts before the first segment starting with a digit.
 *  Everything from the first digit onward is version/build info.
 *  e.g. "proxmox-bs-13" → "proxmox-bs", "esxi-8.0u3g" → "esxi",
 *       "esxi-7.0u3v-dev" → "esxi", "hcx-cloud-4.11.3-dev" → "hcx-cloud" */
export function extractComponentType(uid: string): string {
  const parts = uid.toLowerCase().split("-")
  const typeParts: string[] = []
  for (const p of parts) {
    if (/^\d/.test(p)) break
    typeParts.push(p)
  }
  return typeParts.join("-") || uid.toLowerCase()
}

/** Extract version string from uid by stripping the type prefix.
 *  e.g. "esxi-8.0u3g" → "8.0u3g", "proxmox-bs-4.1.2" → "4.1.2",
 *       "zbox-12.11-dev" → "12.11-dev" */
export function extractComponentVersion(uid: string): string {
  const type = extractComponentType(uid)
  return uid.slice(type.length).replace(/^-/, "") || ""
}

/** Simple string hash → palette index (deterministic per type) */
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Map of component type → assigned palette hex (stable across renders) */
const typeColorCache = new Map<string, string>()

/** Fixed color overrides for specific component types */
const FIXED_COLORS: Record<string, string> = {
  zbox: "#f59e0b", // amber-500 — matches zpod-detail topology
}

export function getComponentHex(uid: string): string {
  const ctype = extractComponentType(uid)
  if (FIXED_COLORS[ctype]) return FIXED_COLORS[ctype]
  if (typeColorCache.has(ctype)) return typeColorCache.get(ctype)!
  const idx = hashString(ctype) % CATPPUCCIN.length
  const hex = CATPPUCCIN[idx]
  typeColorCache.set(ctype, hex)
  return hex
}

/** Inline styles for a component box given its hex color */
export function componentStyles(hex: string) {
  return {
    border: { borderColor: `${hex}80` },
    bg: { backgroundColor: `${hex}1a` },
    text: { color: hex },
    line: { backgroundColor: `${hex}66` },
    textMuted: { color: `${hex}b3` },
  }
}
