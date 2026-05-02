import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface PlannedExercise {
  id: number
  exerciseId: number
  plannedSets: number
  repRange: string
  targetRir: number
  suggestedLoad: number | null
  sortOrder: number
  notes: string | null
  exercise: {
    id: number
    name: string
    primaryMuscles: string[]
    secondaryMuscles: string[]
    equipment: string
    defaultRepRange: string
  }
}

export interface WorkoutPlanSession {
  id: number
  completed: boolean
  date: string
}

export interface WorkoutPlan {
  id: number
  dayOfWeek: number
  muscleGroups: string[]
  label: string | null
  plannedExercises: PlannedExercise[]
  sessions?: WorkoutPlanSession[]
}

export interface MesocycleWeek {
  id: number
  weekNumber: number
  isDeload: boolean
  volumePlan: Record<string, number>
  workoutPlans: WorkoutPlan[]
}

export interface Mesocycle {
  id: number
  name: string
  startDate: string | null
  endDate: string | null
  status: string
  weeks: number
  trainingDays: number[]
  goal: string
  focusMuscles: string[]
  progression: string
  mesocycleWeeks?: MesocycleWeek[]
}

export function useMesocycles() {
  return useQuery({
    queryKey: ['mesocycles'],
    queryFn: () => api<Mesocycle[]>('/mesocycles'),
  })
}

export function useMesocycle(id: number) {
  return useQuery({
    queryKey: ['mesocycles', id],
    queryFn: () => api<Mesocycle>(`/mesocycles/${id}`),
    enabled: id > 0,
  })
}

export function useCreateMesocycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Mesocycle>) =>
      api<Mesocycle>('/mesocycles', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mesocycles'] }),
  })
}

export function useGenerateMesocycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, seedFromMesocycleId }: { id: number; seedFromMesocycleId?: number | null }) =>
      api<{ weeks: number; message: string }>(`/mesocycles/${id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ seedFromMesocycleId: seedFromMesocycleId ?? null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mesocycles'] }),
  })
}

export function useCompleteMesocycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api<{ sessionsClosed: number }>(`/mesocycles/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesocycles'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useRemovePlannedExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ plannedExerciseId, scope }: {
      plannedExerciseId: number
      scope: 'thisWeek' | 'remaining' | 'remainingAndFuture'
    }) =>
      api<{ deleted: number; scope: string }>(
        `/mesocycles/planned-exercise/${plannedExerciseId}?scope=${scope}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesocycles'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useActivateMesocycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api<Mesocycle>(`/mesocycles/${id}/activate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mesocycles'] }),
  })
}

export function useSwapExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ plannedExerciseId, exerciseId }: { plannedExerciseId: number; exerciseId: number }) =>
      api<PlannedExercise>(`/mesocycles/planned-exercise/${plannedExerciseId}/swap`, {
        method: 'PUT',
        body: JSON.stringify({ exerciseId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesocycles'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useSwapExerciseRemaining() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ plannedExerciseId, exerciseId }: { plannedExerciseId: number; exerciseId: number }) =>
      api<{ updated: number }>(`/mesocycles/planned-exercise/${plannedExerciseId}/swap-remaining`, {
        method: 'PUT',
        body: JSON.stringify({ exerciseId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesocycles'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useReorderExercises() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ workoutPlanId, exerciseOrder }: { workoutPlanId: number; exerciseOrder: number[] }) =>
      api<{ success: boolean }>(`/mesocycles/workout-plan/${workoutPlanId}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ exerciseOrder }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesocycles'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useAddExerciseToPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ workoutPlanId, exerciseId, plannedSets, repRange, targetRir }: {
      workoutPlanId: number; exerciseId: number; plannedSets?: number; repRange?: string; targetRir?: number
    }) =>
      api<PlannedExercise>(`/mesocycles/workout-plan/${workoutPlanId}/exercises`, {
        method: 'POST',
        body: JSON.stringify({ exerciseId, plannedSets, repRange, targetRir }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesocycles'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useAddExercisePropagated() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ workoutPlanId, exerciseId, plannedSets, repRange, targetRir }: {
      workoutPlanId: number; exerciseId: number; plannedSets?: number; repRange?: string; targetRir?: number
    }) =>
      api<{ added: number }>(`/mesocycles/workout-plan/${workoutPlanId}/exercises/propagate`, {
        method: 'POST',
        body: JSON.stringify({ exerciseId, plannedSets, repRange, targetRir }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesocycles'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useReorderExercisesRemaining() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ workoutPlanId, exerciseOrder }: { workoutPlanId: number; exerciseOrder: number[] }) =>
      api<{ success: boolean }>(`/mesocycles/workout-plan/${workoutPlanId}/reorder-remaining`, {
        method: 'PUT',
        body: JSON.stringify({ exerciseOrder }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesocycles'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useUpdateExerciseNotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ plannedExerciseId, notes, propagate = true }: {
      plannedExerciseId: number; notes: string; propagate?: boolean
    }) =>
      api<{ success: boolean }>(`/mesocycles/planned-exercise/${plannedExerciseId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ notes, propagate }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mesocycles'] }),
  })
}

export function useDeleteMesocycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api<void>(`/mesocycles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mesocycles'] }),
  })
}
