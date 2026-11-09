import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useSession, useLogSet, useUpdateSession, useDeleteSet,
  useExerciseHistory, useWorkoutPrescriptions,
  type ExercisePrescription,
} from '@/hooks/use-sessions'
import { useSwapExercise, useSwapExerciseRemaining, useReorderExercises, useRemovePlannedExercise, useAddExerciseToPlan, useAddExercisePropagated } from '@/hooks/use-mesocycles'
import { useExercises, type Exercise } from '@/hooks/use-exercises'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ActionSheet } from '@/components/ui/action-sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Check, Trash2, Plus, History, ChevronUp, ChevronDown,
  ArrowLeftRight, Search, Star, MoreVertical, SkipForward, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SetFormData {
  weight: string
  reps: string
}

type LoggedForPrefill = { weight: number; reps: number; isWarmup: boolean; isSkipped: boolean }

/**
 * What to pre-fill next to "+": the next planned set, unless a set already
 * logged this workout beat it (heavier, or same weight for more reps). Then
 * repeat that heaviest set so a run of sets at the new load is one tap each.
 * The planned rows themselves are unchanged.
 */
function prefillFor(
  planned: { suggestedWeight: number; suggestedReps: number } | undefined,
  logged: LoggedForPrefill[],
): SetFormData | null {
  const best = logged
    .filter(s => !s.isWarmup && !s.isSkipped && s.weight > 0)
    .reduce<LoggedForPrefill | null>((top, s) =>
      !top || s.weight > top.weight || (s.weight === top.weight && s.reps > top.reps) ? s : top, null)
  if (!planned) return best ? { weight: String(best.weight), reps: String(best.reps) } : null
  const beatPlan = best && (
    best.weight > planned.suggestedWeight ||
    (best.weight === planned.suggestedWeight && best.reps > planned.suggestedReps)
  )
  return beatPlan
    ? { weight: String(best.weight), reps: String(best.reps) }
    : { weight: String(planned.suggestedWeight), reps: String(planned.suggestedReps) }
}

interface ExerciseEntry {
  exerciseId: number
  exerciseName: string
  equipment: string
  primaryMuscles: string[]
  plannedSets?: number
  repRange?: string
  targetRir?: number
  plannedExerciseId?: number
  sortOrder?: number
  notes?: string
}

// Exercise history dialog
function ExerciseHistoryDialog({
  exerciseId,
  exerciseName,
  open,
  onClose,
}: {
  exerciseId: number
  exerciseName: string
  open: boolean
  onClose: () => void
}) {
  const { data: history, isLoading } = useExerciseHistory(open ? exerciseId : 0)

  const grouped = new Map<string, Array<{ setNumber: number; weight: number; reps: number; rirAchieved: number | null }>>()
  if (history) {
    for (const set of history) {
      const dateKey = new Date(set.session.date).toLocaleDateString()
      const existing = grouped.get(dateKey) || []
      existing.push({ setNumber: set.setNumber, weight: set.weight, reps: set.reps, rirAchieved: set.rirAchieved })
      grouped.set(dateKey, existing)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">Exercise History</DialogTitle>
          <DialogDescription>{exerciseName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading && <p className="text-center text-sm text-muted-foreground py-6">Loading...</p>}
          {!isLoading && grouped.size === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">No history yet for this exercise.</p>
          )}
          {Array.from(grouped.entries()).map(([date, sets]) => (
            <div key={date}>
              <p className="text-xs font-medium text-muted-foreground mb-1">{date}</p>
              <div className="space-y-0.5">
                {sets.sort((a, b) => a.setNumber - b.setNumber).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm px-2 py-1 rounded bg-muted">
                    <span className="w-5 text-center text-xs text-muted-foreground">{s.setNumber}</span>
                    <span className="flex-1">{s.weight} lb × {s.reps}</span>
                    {s.rirAchieved !== null && (
                      <Badge variant="secondary" className="text-[10px]">RIR {s.rirAchieved}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Replace exercise dialog
function ReplaceExerciseDialog({
  target,
  hasMesocycle,
  onClose,
}: {
  target: { plannedExerciseId: number; exerciseId: number; exerciseName: string; primaryMuscle: string } | null
  hasMesocycle: boolean
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null)
  const [showScopeChoice, setShowScopeChoice] = useState(false)

  const swapSingle = useSwapExercise()
  const swapRemaining = useSwapExerciseRemaining()

  const { data: alternatives } = useExercises(target ? { muscle: target.primaryMuscle } : {})

  const filtered = alternatives
    ?.filter(ex => ex.id !== target?.exerciseId)
    .filter(ex => !search || ex.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return b.sfrRating - a.sfrRating
    })

  const handlePick = (exerciseId: number) => {
    if (hasMesocycle) {
      setSelectedExerciseId(exerciseId)
      setShowScopeChoice(true)
    } else {
      doSwap(exerciseId, false)
    }
  }

  const doSwap = async (exerciseId: number, forRemaining: boolean) => {
    if (!target) return
    if (forRemaining) {
      await swapRemaining.mutateAsync({ plannedExerciseId: target.plannedExerciseId, exerciseId })
    } else {
      await swapSingle.mutateAsync({ plannedExerciseId: target.plannedExerciseId, exerciseId })
    }
    handleClose()
  }

  const handleClose = () => {
    setSearch('')
    setSelectedExerciseId(null)
    setShowScopeChoice(false)
    onClose()
  }

  const isPending = swapSingle.isPending || swapRemaining.isPending

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="h-[92dvh] sm:h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-base">Replace Exercise</DialogTitle>
          <DialogDescription>
            Replace <span className="font-medium text-foreground">{target?.exerciseName}</span> with
            another <span className="font-medium text-foreground">{target?.primaryMuscle}</span> exercise
          </DialogDescription>
        </DialogHeader>

        {showScopeChoice && selectedExerciseId ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-center">Replace with <span className="font-medium">{filtered?.find(e => e.id === selectedExerciseId)?.name}</span></p>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" onClick={() => doSwap(selectedExerciseId, false)} disabled={isPending}>
                This week only
              </Button>
              <Button onClick={() => doSwap(selectedExerciseId, true)} disabled={isPending}>
                This week + all remaining weeks
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => { setShowScopeChoice(false); setSelectedExerciseId(null) }}>
              Back
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search exercises..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="-mx-4 flex-1 min-h-0 space-y-0.5 overflow-y-auto overscroll-contain px-2 sm:-mx-6 sm:px-4">
              {filtered?.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => handlePick(ex.id)}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 px-2 py-3 rounded-lg text-left hover:bg-muted active:bg-muted transition-colors disabled:opacity-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {ex.isFavorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                      <span className="text-sm font-medium truncate">{ex.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{ex.equipment}</span>
                      <span className="text-[10px] text-muted-foreground">SFR {ex.sfrRating}/5</span>
                      <span className="text-[10px] text-muted-foreground">{ex.defaultRepRange}</span>
                    </div>
                  </div>
                </button>
              ))}
              {filtered?.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">No matching exercises found</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Add an exercise to today's workout
function AddExerciseDialog({
  open,
  workoutPlanId,
  hasMesocycle,
  excludeIds,
  onAddedLocally,
  onAdded,
  onClose,
}: {
  open: boolean
  workoutPlanId?: number
  hasMesocycle: boolean
  excludeIds: Set<number>
  /** Freeform sessions have no plan; the exercise just appears until sets are logged */
  onAddedLocally: (exercise: Exercise) => void
  onAdded: (exerciseId: number) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Exercise | null>(null)
  const { data: allExercises } = useExercises({})
  const addToPlan = useAddExerciseToPlan()
  const addPropagated = useAddExercisePropagated()
  const isPending = addToPlan.isPending || addPropagated.isPending

  const filtered = allExercises
    ?.filter(ex => !excludeIds.has(ex.id))
    .filter(ex => !search || ex.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  const handleClose = () => {
    setSearch('')
    setSelected(null)
    onClose()
  }

  const add = async (exercise: Exercise, remainingWeeks: boolean) => {
    if (!workoutPlanId) {
      onAddedLocally(exercise)
    } else {
      const vars = { workoutPlanId, exerciseId: exercise.id, repRange: exercise.defaultRepRange }
      if (remainingWeeks) await addPropagated.mutateAsync(vars)
      else await addToPlan.mutateAsync(vars)
    }
    onAdded(exercise.id)
    handleClose()
  }

  const pick = (exercise: Exercise) => {
    // Only programmed workouts can carry the exercise into later weeks
    if (workoutPlanId && hasMesocycle) setSelected(exercise)
    else add(exercise, false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className={cn(!selected && 'h-[92dvh] sm:h-[80vh]')}>
        <DialogHeader>
          <DialogTitle className="text-base">Add Exercise</DialogTitle>
          <DialogDescription>
            {selected ? <>Add <span className="font-medium text-foreground">{selected.name}</span> to…</> : 'Add an exercise you did today'}
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="space-y-2">
            <Button className="h-12 w-full" onClick={() => add(selected, false)} disabled={isPending}>
              Just this workout
            </Button>
            <Button variant="outline" className="h-12 w-full" onClick={() => add(selected, true)} disabled={isPending}>
              This workout + remaining weeks
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setSelected(null)} disabled={isPending}>
              Back
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search exercises..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                type="search"
                enterKeyHint="search"
              />
            </div>
            <div className="-mx-4 flex-1 min-h-0 space-y-0.5 overflow-y-auto overscroll-contain px-2 sm:-mx-6 sm:px-4">
              {filtered?.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => pick(ex)}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 px-2 py-3 rounded-lg text-left hover:bg-muted active:bg-muted transition-colors disabled:opacity-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {ex.isFavorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                      <span className="text-sm font-medium truncate">{ex.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">{ex.equipment}</span>
                      <span className="text-[11px] text-muted-foreground truncate">{ex.primaryMuscles.join(', ')}</span>
                    </div>
                  </div>
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
              {filtered?.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">No matching exercises found</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Action menu
function ExerciseActions({
  entry,
  isFirst,
  isLast,
  onHistory,
  onReplace,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  entry: ExerciseEntry
  isFirst: boolean
  isLast: boolean
  onHistory: () => void
  onReplace: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [open, setOpen] = useState(false)
  const isPlanned = !!entry.plannedExerciseId

  return (
    <>
      <Button variant="ghost" size="icon" className="-mr-2 shrink-0" onClick={() => setOpen(true)} aria-label="Exercise options">
        <MoreVertical className="h-5 w-5" />
      </Button>
      <ActionSheet
        open={open}
        onOpenChange={setOpen}
        title={entry.exerciseName}
        items={[
          { label: 'View history', icon: History, onSelect: onHistory },
          { label: 'Move up', icon: ChevronUp, hidden: !isPlanned || isFirst, onSelect: onMoveUp },
          { label: 'Move down', icon: ChevronDown, hidden: !isPlanned || isLast, onSelect: onMoveDown },
          { label: 'Replace exercise', icon: ArrowLeftRight, hidden: !isPlanned, onSelect: onReplace },
          { label: 'Remove exercise', icon: X, hidden: !isPlanned, destructive: true, onSelect: onRemove },
        ]}
      />
    </>
  )
}

export default function SessionLogPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const sessionId = Number(id)
  const { data: session, isLoading } = useSession(sessionId)
  const logSet = useLogSet()
  const updateSession = useUpdateSession()
  const deleteSet = useDeleteSet()
  const reorderExercises = useReorderExercises()
  const removePlannedExercise = useRemovePlannedExercise()
  const [pageOpenedAt] = useState(() => Date.now())

  // Fetch prescriptions (auto-calculated weight/reps)
  const workoutPlanId = session?.workoutPlan?.id
  const { data: prescriptions } = useWorkoutPrescriptions(workoutPlanId)

  // Build prescription map: exerciseId → prescription
  const prescriptionMap = useMemo(() => {
    const map = new Map<number, ExercisePrescription>()
    if (prescriptions) {
      for (const p of prescriptions) {
        map.set(p.exerciseId, p)
      }
    }
    return map
  }, [prescriptions])

  // Track set input per exercise — pre-fill from prescriptions
  const [setForms, setSetForms] = useState<Record<number, SetFormData>>({})
  const [initializedExercises, setInitializedExercises] = useState<Set<number>>(new Set())

  // Dialog state
  const [historyTarget, setHistoryTarget] = useState<{ exerciseId: number; exerciseName: string } | null>(null)
  const [replaceTarget, setReplaceTarget] = useState<{
    plannedExerciseId: number; exerciseId: number; exerciseName: string; primaryMuscle: string
  } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<{
    plannedExerciseId: number; exerciseName: string
  } | null>(null)
  const [addingExercise, setAddingExercise] = useState(false)
  // Exercises added to a freeform session that have no sets logged yet
  const [extraExercises, setExtraExercises] = useState<Exercise[]>([])
  const scrollToExerciseId = useRef<number | null>(null)

  const getForm = (exerciseId: number): SetFormData => {
    if (setForms[exerciseId]) return setForms[exerciseId]

    // Auto-fill the NEXT set: its prescription, or the heaviest set already done if that's more.
    // Wait for prescriptions to load so a heavier plan isn't skipped.
    const prescriptionsReady = !workoutPlanId || prescriptions !== undefined
    if (!initializedExercises.has(exerciseId) && prescriptionsReady) {
      const rx = prescriptionMap.get(exerciseId)
      const logged = setsByExercise.get(exerciseId) || []
      const nextSetIndex = logged.filter(s => !s.isWarmup).length
      const setRx = rx?.prescriptions.length ? rx.prescriptions[nextSetIndex] || rx.prescriptions[rx.prescriptions.length - 1] : undefined
      const form = prefillFor(setRx, logged)
      if (form) {
        setTimeout(() => {
          setSetForms(prev => ({ ...prev, [exerciseId]: form }))
          setInitializedExercises(prev => new Set(prev).add(exerciseId))
        }, 0)
        return form
      }
    }

    return { weight: '', reps: '' }
  }

  const updateForm = (exerciseId: number, field: string, value: string) => {
    setSetForms(prev => ({
      ...prev,
      [exerciseId]: { ...getForm(exerciseId), [field]: value },
    }))
    setInitializedExercises(prev => new Set(prev).add(exerciseId))
  }

  // Group logged sets by exercise
  const setsByExercise = new Map<number, Array<{
    id: number; exerciseId: number; setNumber: number; weight: number; reps: number;
    rirAchieved: number | null; isWarmup: boolean; isSkipped: boolean; exercise: { name: string; equipment: string }
  }>>()
  if (session?.loggedSets) {
    for (const ls of session.loggedSets as Array<{
      id: number; exerciseId: number; setNumber: number; weight: number; reps: number;
      rirAchieved: number | null; isWarmup: boolean; isSkipped: boolean; exercise: { name: string; equipment: string }
    }>) {
      const existing = setsByExercise.get(ls.exerciseId) || []
      existing.push(ls)
      setsByExercise.set(ls.exerciseId, existing)
    }
  }

  const planned = (session?.workoutPlan?.plannedExercises || []) as Array<{
    id: number; exerciseId: number; plannedSets: number; repRange: string;
    targetRir: number; sortOrder: number;
    exercise: { id: number; name: string; equipment: string; primaryMuscles: string[]; secondaryMuscles: string[] }
  }>

  const hasMesocycle = !!(session?.workoutPlan as Record<string, unknown>)?.mesocycleWeek

  const handleSkipSet = (exerciseId: number) => {
    const existingSets = setsByExercise.get(exerciseId) || []
    const setNumber = existingSets.length + 1
    logSet.mutate({
      sessionId,
      exerciseId,
      setNumber,
      weight: 0,
      reps: 0,
      isSkipped: true,
    })
  }

  const handleLogSet = (exerciseId: number) => {
    const form = getForm(exerciseId)
    const existingSets = setsByExercise.get(exerciseId) || []
    const setNumber = existingSets.length + 1

    logSet.mutate({
      sessionId,
      exerciseId,
      setNumber,
      weight: parseFloat(form.weight) || 0,
      reps: parseInt(form.reps) || 0,
    }, {
      onSuccess: () => {
        // Advance to the next set: its prescription, or the heaviest set done so far if that's more
        const rx = prescriptionMap.get(exerciseId)
        const nextIndex = setNumber // setNumber was 1-based, so this is the next 0-based index
        const nextRx = rx?.prescriptions[nextIndex] || rx?.prescriptions[rx.prescriptions.length - 1]
        const justLogged = { weight: parseFloat(form.weight) || 0, reps: parseInt(form.reps) || 0, isWarmup: false, isSkipped: false }
        const next = prefillFor(nextRx, [...existingSets, justLogged])
        if (next) {
          setSetForms(prev => ({ ...prev, [exerciseId]: next }))
        }
      },
    })
  }

  // Duration from logged-set timestamps, so reopening the page later to press
  // Finish doesn't record 0 minutes (or the hours spent away)
  const workoutMinutes = () => {
    const times = ((session?.loggedSets || []) as Array<{ createdAt?: string }>)
      .map(s => (s.createdAt ? new Date(s.createdAt).getTime() : NaN))
      .filter(t => !Number.isNaN(t))
    if (times.length === 0) return Math.round((Date.now() - pageOpenedAt) / 60000)
    const first = Math.min(...times)
    const last = Math.max(...times)
    const end = Math.min(Date.now(), last + 5 * 60_000) // allow for the last set + rest
    return Math.max(1, Math.round((end - first) / 60000))
  }

  const handleFinish = async () => {
    try {
      // Wait for the save; navigating first hid failures (e.g. weak gym signal)
      await updateSession.mutateAsync({ id: sessionId, completed: true, durationMinutes: workoutMinutes() })
      navigate('/history')
    } catch (err) {
      alert(`Couldn't finish the workout: ${err instanceof Error ? err.message : 'network error'}. Check your connection and tap Finish again.`)
    }
  }

  const handleFatigue = (score: number) => {
    updateSession.mutate({ id: sessionId, fatigueScore: score })
  }

  // Build exercise list
  const exerciseOrder: ExerciseEntry[] = []
  const seenIds = new Set<number>()

  for (const pe of planned) {
    exerciseOrder.push({
      exerciseId: pe.exercise.id,
      exerciseName: pe.exercise.name,
      equipment: pe.exercise.equipment,
      primaryMuscles: pe.exercise.primaryMuscles,
      plannedSets: pe.plannedSets,
      repRange: pe.repRange,
      targetRir: pe.targetRir,
      plannedExerciseId: pe.id,
      sortOrder: pe.sortOrder,
      notes: (pe as { notes?: string }).notes ?? undefined,
    })
    seenIds.add(pe.exercise.id)
  }

  for (const [exId, sets] of setsByExercise) {
    if (!seenIds.has(exId) && sets.length > 0) {
      exerciseOrder.push({
        exerciseId: exId,
        exerciseName: sets[0].exercise.name,
        equipment: sets[0].exercise.equipment,
        primaryMuscles: [],
      })
    }
  }

  for (const ex of extraExercises) {
    if (!seenIds.has(ex.id) && !setsByExercise.has(ex.id)) {
      exerciseOrder.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        equipment: ex.equipment,
        primaryMuscles: ex.primaryMuscles,
        repRange: ex.defaultRepRange,
      })
    }
  }

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    const plannedEntries = exerciseOrder.filter(e => e.plannedExerciseId)
    if (plannedEntries.length < 2) return
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= plannedEntries.length) return
    const ids = plannedEntries.map(e => e.plannedExerciseId!)
    const temp = ids[index]
    ids[index] = ids[targetIdx]
    ids[targetIdx] = temp
    if (workoutPlanId) {
      reorderExercises.mutate({ workoutPlanId, exerciseOrder: ids })
    }
  }

  // After adding an exercise, scroll to its card once the refetch renders it
  useEffect(() => {
    const id = scrollToExerciseId.current
    const el = id !== null ? document.getElementById(`exercise-${id}`) : null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    scrollToExerciseId.current = null
  })

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading session...</div>
  }

  if (!session) {
    return <div className="py-12 text-center text-muted-foreground">Session not found</div>
  }

  const plannedEntries = exerciseOrder.filter(e => e.plannedExerciseId)

  return (
    <div className="space-y-4">
      {/* Sticky so back and the workout name stay in view while scrolling */}
      <div className="sticky top-0 z-30 -mx-4 -mt-4 flex items-center gap-2 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur-lg md:-mx-6 md:-mt-6 md:px-6">
        <Button variant="ghost" size="icon" className="-ml-2 shrink-0" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">
            {(session.workoutPlan as { label?: string })?.label || 'Workout'}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {new Date(session.date).toLocaleDateString()}
            {(session.workoutPlan as { muscleGroups?: string[] })?.muscleGroups && (
              <> &middot; {(session.workoutPlan as { muscleGroups: string[] }).muscleGroups.join(', ')}</>
            )}
          </p>
        </div>
      </div>

      {exerciseOrder.map((entry, idx) => {
        const logged = setsByExercise.get(entry.exerciseId) || []
        const form = getForm(entry.exerciseId)
        const rx = prescriptionMap.get(entry.exerciseId)
        const plannedIdx = entry.plannedExerciseId ? plannedEntries.findIndex(e => e.plannedExerciseId === entry.plannedExerciseId) : -1

        // Set progress: logged / target (use adjusted set count if user did extra)
        const targetSets = rx?.adjustedPlannedSets || entry.plannedSets || 0
        const resolvedCount = logged.filter(s => !s.isWarmup).length // logged + skipped both count

        // Ghost sets: prescriptions not yet resolved
        const ghostSets = rx?.prescriptions.slice(resolvedCount) || []

        return (
          <Card key={entry.exerciseId} id={`exercise-${entry.exerciseId}`} className="scroll-mt-20">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <CardTitle className="text-[15px] leading-snug">{entry.exerciseName}</CardTitle>
                    {targetSets > 0 && (
                      <Badge
                        variant={resolvedCount >= targetSets ? 'safe' : 'secondary'}
                        className="text-[10px]"
                      >
                        {resolvedCount}/{targetSets} sets
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 mt-1">
                    <span className="text-xs text-muted-foreground">{entry.equipment}</span>
                    {entry.repRange && (
                      <span className="text-xs text-muted-foreground">{entry.repRange} reps</span>
                    )}
                    {entry.targetRir !== undefined && (
                      <span className="text-xs text-muted-foreground">Target RIR {entry.targetRir}</span>
                    )}
                  </div>
                  {/* Exercise notes */}
                  {entry.notes && (
                    <p className="text-xs text-volume-warning mt-1 italic">{entry.notes}</p>
                  )}
                </div>
                <ExerciseActions
                  entry={entry}
                  isFirst={plannedIdx === 0}
                  isLast={plannedIdx === plannedEntries.length - 1}
                  onHistory={() => setHistoryTarget({ exerciseId: entry.exerciseId, exerciseName: entry.exerciseName })}
                  onReplace={() => {
                    if (entry.plannedExerciseId) {
                      setReplaceTarget({
                        plannedExerciseId: entry.plannedExerciseId,
                        exerciseId: entry.exerciseId,
                        exerciseName: entry.exerciseName,
                        primaryMuscle: entry.primaryMuscles[0] || '',
                      })
                    }
                  }}
                  onMoveUp={() => handleMoveExercise(plannedIdx, 'up')}
                  onMoveDown={() => handleMoveExercise(plannedIdx, 'down')}
                  onRemove={() => {
                    if (entry.plannedExerciseId) {
                      setRemoveTarget({
                        plannedExerciseId: entry.plannedExerciseId,
                        exerciseName: entry.exerciseName,
                      })
                    }
                  }}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Logged sets */}
              {logged.map((set) => (
                <div
                  key={set.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md pl-2 py-0.5 text-sm min-h-10',
                    set.isSkipped
                      ? 'bg-muted/30 text-muted-foreground italic'
                      : set.isWarmup ? 'bg-muted/50 text-muted-foreground' : 'bg-muted'
                  )}
                >
                  <span className="w-6 text-center text-xs text-muted-foreground">{set.setNumber}</span>
                  <span className="flex-1">
                    {set.isSkipped ? 'Skipped' : `${set.weight} lb × ${set.reps}`}
                  </span>
                  {!set.isSkipped && set.rirAchieved !== null && (
                    <Badge variant="secondary" className="text-[10px]">RIR {set.rirAchieved}</Badge>
                  )}
                  {set.isWarmup && <Badge variant="secondary" className="text-[10px]">W</Badge>}
                  {set.isSkipped && <Badge variant="secondary" className="text-[10px]">Skip</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground"
                    onClick={() => deleteSet.mutate({ sessionId, setId: set.id })}
                    aria-label={`Delete set ${set.setNumber}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {/* Ghost rows: upcoming planned sets */}
              {ghostSets.length > 0 && (
                <div className="space-y-0.5">
                  {ghostSets.map((gs) => (
                    <div
                      key={gs.setNumber}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm bg-muted/30 text-muted-foreground border border-dashed border-muted"
                    >
                      <span className="w-6 text-center text-xs">{gs.setNumber}</span>
                      <span className="flex-1">{gs.suggestedWeight} lb × {gs.suggestedReps}</span>
                      <span className="text-[10px]">planned</span>
                    </div>
                  ))}
                </div>
              )}

              {/* New set input — weight × reps, no manual RIR */}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Weight"
                  value={form.weight}
                  onChange={(e) => updateForm(entry.exerciseId, 'weight', e.target.value)}
                  className="h-11 min-w-0 flex-1 text-center"
                />
                <span className="text-xs text-muted-foreground shrink-0">×</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Reps"
                  value={form.reps}
                  onChange={(e) => updateForm(entry.exerciseId, 'reps', e.target.value)}
                  className="h-11 w-20 text-center shrink-0"
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Log set"
                  onClick={() => handleLogSet(entry.exerciseId)}
                  disabled={!form.weight || !form.reps}
                >
                  <Plus className="h-5 w-5" />
                </Button>
                {ghostSets.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-muted-foreground"
                    onClick={() => handleSkipSet(entry.exerciseId)}
                    aria-label="Skip set"
                    title="Skip set"
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      <button
        type="button"
        onClick={() => setAddingExercise(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/30 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
      >
        <Plus className="h-4 w-4" /> Add exercise
      </button>

      {/* Session completion */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium">How do you feel?</p>
          <div className="flex gap-1.5">
            {[
              { score: 5, label: 'Great', color: 'bg-volume-safe' },
              { score: 4, label: 'Good', color: 'bg-volume-safe/60' },
              { score: 3, label: 'Neutral', color: 'bg-volume-info' },
              { score: 2, label: 'Tired', color: 'bg-volume-warning' },
              { score: 1, label: 'Crushed', color: 'bg-volume-danger' },
            ].map(({ score, label, color }) => (
              <button
                key={score}
                onClick={() => handleFatigue(score)}
                className={cn(
                  'h-11 flex-1 rounded-md text-xs font-medium transition-colors',
                  session.fatigueScore === score
                    ? `${color} text-black`
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button className="h-12 w-full text-base" onClick={handleFinish} disabled={updateSession.isPending}>
            <Check className="mr-2 h-4 w-4" />
            {updateSession.isPending ? 'Saving…' : session.completed ? 'Update finished workout' : 'Finish Workout'}
          </Button>
        </CardContent>
      </Card>

      {/* History Dialog */}
      {historyTarget && (
        <ExerciseHistoryDialog
          exerciseId={historyTarget.exerciseId}
          exerciseName={historyTarget.exerciseName}
          open={!!historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      <AddExerciseDialog
        open={addingExercise}
        workoutPlanId={workoutPlanId}
        hasMesocycle={hasMesocycle}
        excludeIds={new Set(exerciseOrder.map(e => e.exerciseId))}
        onAddedLocally={(ex) => setExtraExercises(prev => [...prev, ex])}
        onAdded={(id) => { scrollToExerciseId.current = id }}
        onClose={() => setAddingExercise(false)}
      />

      {/* Replace Exercise Dialog */}
      <ReplaceExerciseDialog
        target={replaceTarget}
        hasMesocycle={hasMesocycle}
        onClose={() => setReplaceTarget(null)}
      />

      {/* Remove Exercise Dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Remove Exercise</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{removeTarget?.exerciseName}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-2">
            <Button
              variant="outline"
              onClick={() => {
                if (removeTarget) {
                  removePlannedExercise.mutate(
                    { plannedExerciseId: removeTarget.plannedExerciseId, scope: 'thisWeek' },
                    { onSuccess: () => setRemoveTarget(null) },
                  )
                }
              }}
              disabled={removePlannedExercise.isPending}
            >
              This week only
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (removeTarget) {
                  removePlannedExercise.mutate(
                    { plannedExerciseId: removeTarget.plannedExerciseId, scope: 'remaining' },
                    { onSuccess: () => setRemoveTarget(null) },
                  )
                }
              }}
              disabled={removePlannedExercise.isPending}
            >
              This week + remaining weeks
            </Button>
            <Button
              onClick={() => {
                if (removeTarget) {
                  removePlannedExercise.mutate(
                    { plannedExerciseId: removeTarget.plannedExerciseId, scope: 'remainingAndFuture' },
                    { onSuccess: () => setRemoveTarget(null) },
                  )
                }
              }}
              disabled={removePlannedExercise.isPending}
            >
              Remaining weeks + exclude from future mesocycles
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
