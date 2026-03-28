import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  LayoutDashboard,
  Dumbbell,
  Target,
  Calendar,
  ClipboardList,
  BarChart3,
  Settings,
} from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'

const pages = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Exercises', icon: Dumbbell, path: '/exercises' },
  { name: 'Muscle Groups', icon: Target, path: '/muscle-groups' },
  { name: 'Programs', icon: Calendar, path: '/mesocycles' },
  { name: 'History', icon: ClipboardList, path: '/history' },
  { name: 'Analytics', icon: BarChart3, path: '/analytics' },
  { name: 'Settings', icon: Settings, path: '/settings' },
]

export function CommandMenu() {
  const { commandMenuOpen, setCommandMenuOpen } = useUIStore()
  const navigate = useNavigate()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandMenuOpen(!commandMenuOpen)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [commandMenuOpen, setCommandMenuOpen])

  if (!commandMenuOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setCommandMenuOpen(false)}
      />
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2">
        <Command className="rounded-xl border bg-background shadow-2xl">
          <Command.Input
            placeholder="Search pages, exercises..."
            className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>
            <Command.Group heading="Pages" className="text-xs text-muted-foreground px-2 py-1.5">
              {pages.map((page) => (
                <Command.Item
                  key={page.path}
                  value={page.name}
                  onSelect={() => {
                    navigate(page.path)
                    setCommandMenuOpen(false)
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent aria-selected:bg-accent"
                >
                  <page.icon className="h-4 w-4 text-muted-foreground" />
                  {page.name}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
