import { Navigate, useLocation } from "react-router"
import { useAuthStore } from "@/stores/auth-store"
import { useTargetStore } from "@/stores/target-store"
import type { ReactNode } from "react"

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const { activeTargetId } = useTargetStore()
  const location = useLocation()

  if (!activeTargetId || !isAuthenticated) {
    // Preserve the intended URL so login can redirect back after connecting
    const returnTo = location.pathname + location.search
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  return <>{children}</>
}
