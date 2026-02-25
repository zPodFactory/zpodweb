import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Copy text to clipboard with fallback for non-secure (HTTP) contexts */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try the modern API first (works on HTTPS / localhost)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy approach
    }
  }
  // Legacy fallback for plain HTTP
  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/** Parse an API date string (naive UTC) into a proper Date.
 *  The API returns ISO timestamps without a timezone suffix,
 *  so we append "Z" to ensure correct UTC interpretation. */
function ensureUtc(date: string): Date {
  const s = date.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(date) ? date : date + "Z"
  return new Date(s)
}

/** Format an API datetime to the user's local date + time. */
export function formatDateTime(date: string): string {
  return ensureUtc(date).toLocaleString(undefined, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  })
}

/** Format an API datetime to the user's local date only. */
export function formatDate(date: string): string {
  return ensureUtc(date).toLocaleDateString(undefined, {
    day: "2-digit", month: "2-digit", year: "numeric",
  })
}

/** Format the elapsed time since a given UTC date string as "Xh Ym Zs" */
export function formatElapsed(dateStr: string): string {
  const utcStr = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z"
  const diff = Math.floor((Date.now() - new Date(utcStr).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for non-secure contexts (HTTP)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
