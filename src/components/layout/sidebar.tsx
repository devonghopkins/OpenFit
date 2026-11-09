import { NavLink, useLocation } from 'react-router-dom'
import {
  Dumbbell,
  Target,
  Calendar,
  ClipboardList,
  BarChart3,
  Settings,
  Menu,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'

export const navItems = [
  { to: '/mesocycles', icon: Calendar, label: 'Programs' },
  { to: '/history', icon: ClipboardList, label: 'History' },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises' },
  { to: '/muscle-groups', icon: Target, label: 'Muscles' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

// Bottom tab bar on phones (max 5). Analytics and Settings live under More.
export const mobileTabItems = [
  { to: '/mesocycles', icon: Calendar, label: 'Programs', also: ['/session'] },
  { to: '/history', icon: ClipboardList, label: 'History', also: [] },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises', also: [] },
  { to: '/muscle-groups', icon: Target, label: 'Muscles', also: [] },
  { to: '/settings', icon: Menu, label: 'More', also: ['/analytics'] },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r bg-background transition-all duration-200',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      <div className="flex h-14 items-center border-b px-4">
        {!sidebarCollapsed && (
          <span className="text-lg font-bold tracking-tight">OpenFit</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={cn('ml-auto', sidebarCollapsed && 'mx-auto')}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground',
                sidebarCollapsed && 'justify-center px-2'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export function MobileTabBar() {
  const { pathname } = useLocation()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-[#111113]/95 backdrop-blur-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch px-1">
        {mobileTabItems.map((item) => {
          const active =
            pathname.startsWith(item.to) || item.also.some((p) => pathname.startsWith(p))
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
              <span className={cn(active && 'font-medium')}>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
