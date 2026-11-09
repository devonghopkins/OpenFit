import { useState } from 'react'
import { useCreateExercise, useUpdateExercise, type Exercise } from '@/hooks/use-exercises'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { EQUIPMENT_TYPES, MOVEMENT_PATTERNS, MUSCLE_GROUPS } from '@/lib/constants'

interface ExerciseFormProps {
  exercise?: Exercise
  onClose: () => void
  /** Prefill for a new exercise, e.g. what was typed into a search box */
  initialName?: string
  initialPT?: boolean
  onCreated?: (exercise: Exercise) => void
}

export function ExerciseForm({ exercise, onClose, initialName, initialPT, onCreated }: ExerciseFormProps) {
  const isEditing = !!exercise
  // Seeded library exercises only accept note changes on the server
  const lockedFields = isEditing && exercise.isSeeded

  const [name, setName] = useState(exercise?.name ?? initialName ?? '')
  const [isPT, setIsPT] = useState(exercise?.isPT ?? initialPT ?? false)
  const [primaryMuscles, setPrimaryMuscles] = useState<string[]>(exercise?.primaryMuscles ?? [])
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>(exercise?.secondaryMuscles ?? [])
  const [equipment, setEquipment] = useState(exercise?.equipment ?? (initialPT ? 'Band' : 'Barbell'))
  const [movementPattern, setMovementPattern] = useState(exercise?.movementPattern ?? (initialPT ? 'Mobility' : 'Push'))
  const [defaultRepRange, setDefaultRepRange] = useState(exercise?.defaultRepRange ?? (initialPT ? '12-15' : '8-12'))
  const [sfrRating, setSfrRating] = useState(exercise?.sfrRating ?? 3)
  const [notes, setNotes] = useState(exercise?.notes ?? '')

  const createExercise = useCreateExercise()
  const updateExercise = useUpdateExercise()
  const error = (isEditing ? updateExercise.error : createExercise.error) as Error | null
  const isPending = createExercise.isPending || updateExercise.isPending

  const togglePT = () => {
    const next = !isPT
    setIsPT(next)
    // Sensible PT defaults on a new exercise, without clobbering anything typed
    if (!isEditing && next) {
      if (movementPattern === 'Push') setMovementPattern('Mobility')
      if (equipment === 'Barbell') setEquipment('Band')
      if (defaultRepRange === '8-12') setDefaultRepRange('12-15')
    }
  }

  const toggleMuscle = (list: string[], setList: (v: string[]) => void, muscle: string) => {
    setList(list.includes(muscle) ? list.filter((m) => m !== muscle) : [...list, muscle])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      name: name.trim(),
      isPT,
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
      createExercise.mutate(data, {
        onSuccess: (created) => {
          onCreated?.(created)
          onClose()
        },
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required disabled={lockedFields} />
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isPT}
        onClick={togglePT}
        disabled={lockedFields}
        className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
          isPT ? 'border-volume-info bg-volume-info/10' : 'border-input hover:bg-accent'
        }`}
      >
        <span>
          <span className="block text-sm font-medium">PT / mobility</span>
          <span className="block text-xs text-muted-foreground">
            Logged as sets × reps (band or bodyweight). Not counted in muscle volume.
          </span>
        </span>
        <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${isPT ? 'bg-volume-info' : 'bg-muted'}`}>
          <span className={`block h-4 w-4 rounded-full bg-background transition-transform ${isPT ? 'translate-x-4' : ''}`} />
        </span>
      </button>

      <div>
        <label className="text-sm font-medium">
          Primary Muscles{isPT && <span className="font-normal text-muted-foreground"> (optional)</span>}
        </label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {MUSCLE_GROUPS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMuscle(primaryMuscles, setPrimaryMuscles, m)}
              className={`h-9 rounded-md border px-2.5 text-xs transition-colors ${
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
              className={`h-9 rounded-md border px-2.5 text-xs transition-colors ${
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
          <NativeSelect
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className="mt-1"
          >
            {EQUIPMENT_TYPES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label className="text-sm font-medium">Movement Pattern</label>
          <NativeSelect
            value={movementPattern}
            onChange={(e) => setMovementPattern(e.target.value)}
            className="mt-1"
          >
            {MOVEMENT_PATTERNS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </NativeSelect>
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
            inputMode="numeric"
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

      {error && <p className="text-sm text-volume-danger">{error.message}</p>}

      <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:justify-end">
        <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="h-11 sm:h-10"
          disabled={isPending || !name.trim() || (!isPT && primaryMuscles.length === 0)}
        >
          {isEditing ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
