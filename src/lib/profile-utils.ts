import type { ProfileItem } from "@/types"

/** Flatten a profile's step array (which may contain parallel groups) into a flat list */
export function flattenProfileItems(
  profile: (ProfileItem | ProfileItem[])[]
): ProfileItem[] {
  return profile.flatMap((item) => (Array.isArray(item) ? item : [item]))
}
