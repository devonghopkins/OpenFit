import { useState } from 'react'
import { useExercises, useUpdateExercise } from '@/hooks/use-exercises'
import { ExerciseFilters } from '@/components/exercises/exercise-filters'
import { ExerciseCard } from '@/components/exercises/exercise-card'
import { ExerciseForm } from '@/components/exercises/exercise-form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import type { Exercise } from '@/hooks/use-exercises'

export default function ExercisesPage() {
  const [filters, setFilters] = useState({
    search: '',
    muscle: '',
    equipment: '',
    favorites: false,
  })
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: exercises, isLoading } = useExercises({
    search: filters.search || undefined,
    muscle: filters.muscle || undefined,
    equipment: filters.equipment || undefined,
    favorites: filters.favorites || undefined,
  })

  const updateExercise = useUpdateExercise()

  const handleToggleFavorite = (exercise: Exercise) => {
    updateExercise.mutate({ id: exercise.id, isFavorite: !exercise.isFavorite })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Exercises</h1>
          <p className="text-sm text-muted-foreground">
            {exercises?.length ?? 0} exercises
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

      <ExerciseFilters filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading exercises...</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exercises?.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              onEdit={() => setEditingExercise(exercise)}
              onToggleFavorite={() => handleToggleFavorite(exercise)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!editingExercise} onOpenChange={() => setEditingExercise(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Exercise</DialogTitle>
            <DialogDescription className="sr-only">Modify exercise details</DialogDescription>
          </DialogHeader>
          {editingExercise && (
            <ExerciseForm
              exercise={editingExercise}
              onClose={() => setEditingExercise(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Exercise</DialogTitle>
            <DialogDescription className="sr-only">Add a new exercise to the library</DialogDescription>
          </DialogHeader>
          <ExerciseForm onClose={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
