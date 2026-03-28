import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface MuscleGroup {
  id: number
  name: string
  mev: number
  mav: number
  mrv: number
  defaultFrequency: number
  priorityTier: string
  injured: boolean
}

export function useMuscleGroups() {
  return useQuery({
    queryKey: ['muscle-groups'],
    queryFn: () => api<MuscleGroup[]>('/muscle-groups'),
  })
}

export function useUpdateMuscleGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<MuscleGroup> & { id: number }) =>
      api<MuscleGroup>(`/muscle-groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['muscle-groups'] }),
  })
}
