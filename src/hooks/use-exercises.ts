import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Exercise {
  id: number
  name: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string
  movementPattern: string
  jointStress: Record<string, string>
  defaultRepRange: string
  sfrRating: number
  notes: string | null
  isFavorite: boolean
  isExcluded: boolean
  substitutions: string[]
}

interface ExerciseFilters {
  search?: string
  muscle?: string
  equipment?: string
  movement?: string
  favorites?: boolean
}

function buildQuery(filters: ExerciseFilters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.muscle) params.set('muscle', filters.muscle)
  if (filters.equipment) params.set('equipment', filters.equipment)
  if (filters.movement) params.set('movement', filters.movement)
  if (filters.favorites) params.set('favorites', 'true')
  const q = params.toString()
  return q ? `?${q}` : ''
}

export function useExercises(filters: ExerciseFilters = {}) {
  return useQuery({
    queryKey: ['exercises', filters],
    queryFn: () => api<Exercise[]>(`/exercises${buildQuery(filters)}`),
  })
}

export function useExercise(id: number) {
  return useQuery({
    queryKey: ['exercises', id],
    queryFn: () => api<Exercise>(`/exercises/${id}`),
    enabled: id > 0,
  })
}

export function useCreateExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Exercise>) =>
      api<Exercise>('/exercises', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  })
}

export function useUpdateExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Exercise> & { id: number }) =>
      api<Exercise>(`/exercises/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  })
}

export function useDeleteExercise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api<void>(`/exercises/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  })
}
