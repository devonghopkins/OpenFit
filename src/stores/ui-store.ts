import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  commandMenuOpen: boolean
  toggleSidebar: () => void
  setCommandMenuOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  commandMenuOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandMenuOpen: (open) => set({ commandMenuOpen: open }),
}))
