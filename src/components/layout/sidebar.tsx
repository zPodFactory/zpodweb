import { useLocation, Link } from "react-router"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Server,
  Box,
  Puzzle,
  BookOpen,
  Layers,
  Factory,
  Settings,
  Info,
  ShieldCheck,
  FlaskConical,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"

const mainNav = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "zPods", href: "/zpods", icon: Server },
  { label: "Profiles", href: "/profiles", icon: Layers },
]

const adminNav = [
  { label: "Libraries", href: "/libraries", icon: BookOpen },
  { label: "Components", href: "/components", icon: Puzzle },
  { label: "Endpoints", href: "/endpoints", icon: Box },
  { label: "Factory", href: "/factory", icon: Factory },
  { label: "Settings", href: "/settings", icon: Settings },
]

interface SidebarProps {
  className?: string
  onNavigate?: () => void
}

function NavLink({
  href,
  icon: Icon,
  label,
  pathname,
  onNavigate,
  className,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  pathname: string
  onNavigate?: () => void
  className?: string
}) {
  const isActive = pathname === href
  return (
    <Link
      to={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className
      )}
    >
      <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
      {label}
    </Link>
  )
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const location = useLocation()

  return (
    <aside
      className={cn(
        "flex w-48 flex-col border-r bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <Link to="/" onClick={onNavigate} className="flex h-14 items-center gap-2.5 border-b px-4 hover:opacity-80 transition-opacity">
        <img
          src="/zpodfactory-logo.png"
          alt="zPodFactory"
          className="h-7 w-7"
        />
        <span className="text-lg font-bold tracking-tight text-primary">
          zPodFactory
        </span>
      </Link>
      <Separator />
      <nav className="flex-1 space-y-1 p-2">
        <NavLink href="/" icon={LayoutDashboard} label="Dashboard" pathname={location.pathname} onNavigate={onNavigate} />
        <div className="pt-3">
          <div className="flex items-center gap-2 px-3 pb-1">
            <FlaskConical className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
              Lab Management
            </span>
          </div>
          {mainNav.filter((item) => item.href !== "/").map((item) => (
            <NavLink key={item.href} {...item} pathname={location.pathname} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>
      <div className="border-t p-2 space-y-1">
        <div className="flex items-center gap-2 px-3 pb-1">
          <ShieldCheck className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Administration
          </span>
        </div>
        {adminNav.map((item) => (
          <NavLink key={item.href} {...item} pathname={location.pathname} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="border-t p-2">
        <NavLink href="/about" icon={Info} label="About" pathname={location.pathname} onNavigate={onNavigate} />
      </div>
    </aside>
  )
}
