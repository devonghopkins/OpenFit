import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar, MobileTabBar } from './sidebar'
import { CommandMenu } from './command-menu'

export function AppShell() {
  const { pathname } = useLocation()
  const scrollRef = useRef<HTMLElement>(null)

  // <main> is the scroller, so the browser won't reset it between pages
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [pathname])

  return (
    // The status bar is see-through on iOS (black-translucent), so the frame starts
    // below it. Only <main> scrolls, so content never slides under the clock.
    <div className="flex h-dvh overflow-hidden bg-background pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <Sidebar />
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        <div className="mx-auto max-w-6xl px-4 pt-4 pb-4 md:p-6">
          <Outlet />
        </div>
      </main>
      <MobileTabBar />
      <CommandMenu />
    </div>
  )
}
