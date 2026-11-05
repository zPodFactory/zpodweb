import { Fragment } from "react"
import { Link } from "react-router"
import { cn } from "@/lib/utils"
import { getOwnerUsers } from "@/lib/zpod-utils"
import type { Endpoint, Zpod } from "@/types"

// relative z-10: above a row's stretched link, so the click goes here
const LINK = "relative z-10 hover:text-[#89b4fa] hover:underline underline-offset-2"

/** An endpoint's name, opening the Endpoints page on it (scrolled to and outlined) */
export function EndpointLink({ endpoint, className }: { endpoint: Endpoint | null; className?: string }) {
  if (!endpoint) return <span className={className}>—</span>
  return (
    <Link
      to={`/endpoints?endpoint=${endpoint.id}`}
      className={cn(LINK, className)}
      title={`Show ${endpoint.name} on the Endpoints page`}
      onClick={(e) => e.stopPropagation()}
    >
      {endpoint.name}
    </Link>
  )
}

/** A profile's name, opening the Profiles page on it (expanded, scrolled to and outlined) */
export function ProfileLink({ name, className }: { name: string; className?: string }) {
  return (
    <Link
      to={`/profiles?profile=${encodeURIComponent(name)}`}
      className={cn(LINK, className)}
      title={`Show ${name} on the Profiles page`}
      onClick={(e) => e.stopPropagation()}
    >
      {name}
    </Link>
  )
}

/** A zPod's owners, each opening the Users page on that user (scrolled to and outlined) */
export function OwnerLinks({ zpod, className }: { zpod: Zpod; className?: string }) {
  const owners = getOwnerUsers(zpod)
  if (!owners.length) return <span className={className}>—</span>
  return (
    <span className={className}>
      {owners.map((u, i) => (
        <Fragment key={u.id}>
          {i > 0 && ", "}
          <Link
            to={`/users?user=${u.id}`}
            className={LINK}
            title={`Show ${u.username} on the Users page`}
            onClick={(e) => e.stopPropagation()}
          >
            {u.username}
          </Link>
        </Fragment>
      ))}
    </span>
  )
}
