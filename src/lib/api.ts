import axios from "axios"
import { useTargetStore } from "@/stores/target-store"
import { useAuthStore } from "@/stores/auth-store"

export function createApiClient() {
  const instance = axios.create({
    baseURL: "/api",
  })

  instance.interceptors.request.use((config) => {
    const { targets, activeTargetId } = useTargetStore.getState()
    const target = targets.find((t) => t.id === activeTargetId)
    if (target) {
      config.headers["access_token"] = target.token
      config.headers["X-Target-Url"] = target.url
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 403) {
        useAuthStore.getState().logout()
        useTargetStore.getState().clearActiveTarget()
      }
      return Promise.reject(error)
    }
  )

  return instance
}

export const api = createApiClient()
