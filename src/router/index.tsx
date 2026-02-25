import { createBrowserRouter, Navigate } from "react-router"
import { RootLayout } from "@/components/layout/root-layout"
import { LoginPage } from "@/pages/login"
import { DashboardPage } from "@/pages/dashboard"
import { ZpodsPage } from "@/pages/zpods"
import { ComponentsPage } from "@/pages/components"
import { LibrariesPage } from "@/pages/libraries"
import { ProfilesPage } from "@/pages/profiles"
import { EndpointsPage } from "@/pages/endpoints"
import { FactoryPage } from "@/pages/factory"
import { ZpodDetailPage } from "@/pages/zpod-detail"
import { SettingsPage } from "@/pages/settings"
import { AboutPage } from "@/pages/about"
import { AuthGuard } from "@/components/auth-guard"

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: (
      <AuthGuard>
        <RootLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "zpods", element: <ZpodsPage /> },
      { path: "zpods/:id", element: <ZpodDetailPage /> },
      { path: "components", element: <ComponentsPage /> },
      { path: "libraries", element: <LibrariesPage /> },
      { path: "profiles", element: <ProfilesPage /> },
      { path: "endpoints", element: <EndpointsPage /> },
      { path: "factory", element: <FactoryPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "about", element: <AboutPage /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
])
