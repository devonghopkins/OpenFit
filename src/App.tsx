import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { AppShell } from '@/components/layout/app-shell'
import DashboardPage from '@/pages/dashboard'
import ExercisesPage from '@/pages/exercises'
import MuscleGroupsPage from '@/pages/muscle-groups'
import MesocyclesPage from '@/pages/mesocycles'
import MesocycleDetailPage from '@/pages/mesocycle-detail'
import SessionLogPage from '@/pages/session-log'
import HistoryPage from '@/pages/history'
import AnalyticsPage from '@/pages/analytics'
import SettingsPage from '@/pages/settings'
import LoginPage from '@/pages/login'
import { Dumbbell } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary animate-pulse">
            <Dumbbell className="h-6 w-6 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/muscle-groups" element={<MuscleGroupsPage />} />
          <Route path="/mesocycles" element={<MesocyclesPage />} />
          <Route path="/mesocycles/:id" element={<MesocycleDetailPage />} />
          <Route path="/session/:id" element={<SessionLogPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  )
}
