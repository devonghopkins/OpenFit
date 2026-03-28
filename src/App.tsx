import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  )
}
