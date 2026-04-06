import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface LoggedSet {
  id: number
  sessionId: number
  exerciseId: number
  setNumber: number
  weight: number
  reps: number
  rirAchieved: number | null
  tempo: string | null
  isWarmup: boolean
  notes: string | null
  exercise: {
    id: number
    name: string
    primaryMuscles: string[]
    equipment: string
  }
}

export interface Session {
  id: number
  date: string
  workoutPlanId: number | null
  durationMinutes: number | null
  fatigueScore: number | null
  notes: string | null
  completed: boolean
  loggedSets: LoggedSet[]
  workoutPlan: {
    id: number
    label: string | null
    muscleGroups: string[]
    plannedExercises?: Array<{
      id: number
      exerciseId: number
      plannedSets: number
      repRange: string
      targetRir: number
      suggestedLoad: number | null
      sortOrder: number
      exercise: { id: number; name: string; primaryMuscles: string[]; secondaryMuscles: string[]; equipment: string }
    }>
    mesocycleWeek?: {
      weekNumber: number
      mesocycle: { id: number; name: string }
    }
  } | null
}

export function useSessions(limit = 50) {
  return useQuery({
    queryKey: ['sessions-list', limit],
    queryFn: () => api<Session[]>(`/sessions?limit=${limit}`),
  })
}

export function useSession(id: number) {
  return useQuery({
    queryKey: ['sessions', id],
    queryFn: () => api<Session>(`/sessions/${id}`),
    enabled: id > 0,
    staleTime: 0,
  })
}

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { workoutPlanId?: number; notes?: string }) =>
      api<Session>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useUpdateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; fatigueScore?: number; durationMinutes?: number; notes?: string; completed?: boolean }) =>
      api<Session>(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['sessions', vars.id] })
    },
  })
}

export function useLogSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, ...data }: {
      sessionId: number
      exerciseId: number
      setNumber: number
      weight: number
      reps: number
      rirAchieved?: number
      isWarmup?: boolean
      notes?: string
    }) =>
      api<LoggedSet>(`/sessions/${sessionId}/sets`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sessions', vars.sessionId] })
    },
  })
}

export function useDeleteSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, setId }: { sessionId: number; setId: number }) =>
      api<void>(`/sessions/${sessionId}/sets/${setId}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sessions', vars.sessionId] })
    },
  })
}

export interface SetPrescription {
  setNumber: number
  suggestedWeight: number
  suggestedReps: number
  lastWeight: number
  lastReps: number
  e1rm: number
  reason: string
}

export interface ExercisePrescription {
  exerciseId: number
  targetRir: number
  plannedSets: number
  adjustedPlannedSets: number
  prescriptions: SetPrescription[]
}

export function useWorkoutPrescriptions(workoutPlanId: number | undefined) {
  return useQuery({
    queryKey: ['prescriptions', workoutPlanId],
    queryFn: () => api<ExercisePrescription[]>(`/sessions/prescriptions/${workoutPlanId}`),
    enabled: !!workoutPlanId && workoutPlanId > 0,
  })
}

export interface ExerciseHistorySet extends LoggedSet {
  session: { id: number; date: string }
}

export function useExerciseHistory(exerciseId: number) {
  return useQuery({
    queryKey: ['exercise-history', exerciseId],
    queryFn: () => api<ExerciseHistorySet[]>(`/sessions/exercise-history/${exerciseId}`),
    enabled: exerciseId > 0,
  })
}
