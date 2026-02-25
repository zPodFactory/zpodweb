import { Outlet } from "react-router"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { MobileNav } from "./mobile-nav"

export function RootLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar className="hidden lg:flex" />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-4 md:p-6 scrollbar-hide min-w-0">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
