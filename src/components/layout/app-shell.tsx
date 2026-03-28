import { Outlet } from 'react-router-dom'
import { Sidebar, MobileTabBar } from './sidebar'
import { CommandMenu } from './command-menu'

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
      <MobileTabBar />
      <CommandMenu />
    </div>
  )
}
