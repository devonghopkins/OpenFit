import { useState } from 'react'
import { useCreateExercise, useUpdateExercise, type Exercise } from '@/hooks/use-exercises'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EQUIPMENT_TYPES, MOVEMENT_PATTERNS, MUSCLE_GROUPS } from '@/lib/constants'

interface ExerciseFormProps {
  exercise?: Exercise
  onClose: () => void
}

export function ExerciseForm({ exercise, onClose }: ExerciseFormProps) {
  const isEditing = !!exercise

  const [name, setName] = useState(exercise?.name ?? '')
  const [primaryMuscles, setPrimaryMuscles] = useState<string[]>(exercise?.primaryMuscles ?? [])
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>(exercise?.secondaryMuscles ?? [])
  const [equipment, setEquipment] = useState(exercise?.equipment ?? 'Barbell')
  const [movementPattern, setMovementPattern] = useState(exercise?.movementPattern ?? 'Push')
  const [defaultRepRange, setDefaultRepRange] = useState(exercise?.defaultRepRange ?? '8-12')
  const [sfrRating, setSfrRating] = useState(exercise?.sfrRating ?? 3)
  const [notes, setNotes] = useState(exercise?.notes ?? '')

  const createExercise = useCreateExercise()
  const updateExercise = useUpdateExercise()

  const toggleMuscle = (list: string[], setList: (v: string[]) => void, muscle: string) => {
    setList(list.includes(muscle) ? list.filter((m) => m !== muscle) : [...list, muscle])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      name,
      primaryMuscles,
      secondaryMuscles,
      equipment,
      movementPattern,
      defaultRepRange,
      sfrRating,
      notes: notes || null,
    }

    if (isEditing) {
      updateExercise.mutate({ id: exercise.id, ...data }, { onSuccess: onClose })
    } else {
      createExercise.mutate(data, { onSuccess: onClose })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <label className="text-sm font-medium">Primary Muscles</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {MUSCLE_GROUPS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMuscle(primaryMuscles, setPrimaryMuscles, m)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                primaryMuscles.includes(m)
                  ? 'border-volume-safe bg-volume-safe/20 text-volume-safe'
                  : 'border-input text-muted-foreground hover:bg-accent'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Secondary Muscles</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {MUSCLE_GROUPS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMuscle(secondaryMuscles, setSecondaryMuscles, m)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                secondaryMuscles.includes(m)
                  ? 'border-volume-info bg-volume-info/20 text-volume-info'
                  : 'border-input text-muted-foreground hover:bg-accent'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Equipment</label>
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {EQUIPMENT_TYPES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Movement Pattern</label>
          <select
            value={movementPattern}
            onChange={(e) => setMovementPattern(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {MOVEMENT_PATTERNS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Rep Range</label>
          <Input
            value={defaultRepRange}
            onChange={(e) => setDefaultRepRange(e.target.value)}
            placeholder="8-12"
          />
        </div>
        <div>
          <label className="text-sm font-medium">SFR Rating (1-5)</label>
          <Input
            type="number"
            min={1}
            max={5}
            value={sfrRating}
            onChange={(e) => setSfrRating(Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Cues, tips, etc."
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name || primaryMuscles.length === 0}>
          {isEditing ? 'Save Changes' : 'Create Exercise'}
        </Button>
      </div>
    </form>
  )
}
