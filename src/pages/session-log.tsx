import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useSession, useLogSet, useUpdateSession, useDeleteSet,
  useExerciseHistory, useWorkoutPrescriptions,
  type ExercisePrescription,
} from '@/hooks/use-sessions'
import { useSwapExercise, useSwapExerciseRemaining, useReorderExercises, useRemovePlannedExercise } from '@/hooks/use-mesocycles'
import { useExercises } from '@/hooks/use-exercises'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Check, Timer, Trash2, Plus, History, ChevronUp, ChevronDown,
  ArrowLeftRight, Search, Star, MoreVertical, SkipForward, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function RestTimer({ defaultSeconds = 120 }: { defaultSeconds?: number }) {
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          setRunning(false)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [running])

  const start = useCallback(() => {
    setSeconds(defaultSeconds)
    setRunning(true)
  }, [defaultSeconds])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={running ? 'destructive' : 'outline'}
        size="sm"
        onClick={() => running ? setRunning(false) : start()}
      >
        <Timer className="mr-1 h-3 w-3" />
        {running ? `${mins}:${secs.toString().padStart(2, '0')}` : 'Rest'}
      </Button>
    </div>
  )
}

interface SetFormData {
  weight: string
  reps: string
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
      <DialogContent className="max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Exercise History</DialogTitle>
          <DialogDescription>{exerciseName}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 max-h-[50vh]">
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
      <DialogContent className="max-h-[80vh] flex flex-col">
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
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[50vh] -mx-2 px-2">
              {filtered?.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => handlePick(ex.id)}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left hover:bg-muted transition-colors disabled:opacity-50"
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
    <div className="relative">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(!open)}>
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-44 rounded-lg border bg-background shadow-lg py-1">
            <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => { onHistory(); setOpen(false) }}>
              <History className="h-3.5 w-3.5" /> View History
            </button>
            {isPlanned && (
              <>
                {!isFirst && (
                  <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => { onMoveUp(); setOpen(false) }}>
                    <ChevronUp className="h-3.5 w-3.5" /> Move Up
                  </button>
                )}
                {!isLast && (
                  <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => { onMoveDown(); setOpen(false) }}>
                    <ChevronDown className="h-3.5 w-3.5" /> Move Down
                  </button>
                )}
                <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors" onClick={() => { onReplace(); setOpen(false) }}>
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Replace Exercise
                </button>
                <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-volume-danger" onClick={() => { onRemove(); setOpen(false) }}>
                  <X className="h-3.5 w-3.5" /> Remove Exercise
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
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
  const [startTime] = useState(Date.now())

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

  const getForm = (exerciseId: number): SetFormData => {
    if (setForms[exerciseId]) return setForms[exerciseId]

    // Auto-fill from the NEXT set's prescription (based on how many sets already logged)
    if (!initializedExercises.has(exerciseId)) {
      const rx = prescriptionMap.get(exerciseId)
      if (rx?.prescriptions && rx.prescriptions.length > 0) {
        const logged = setsByExercise.get(exerciseId) || []
        const nextSetIndex = logged.filter(s => !s.isWarmup).length
        const setRx = rx.prescriptions[nextSetIndex] || rx.prescriptions[rx.prescriptions.length - 1]
        if (setRx) {
          const form = {
            weight: String(setRx.suggestedWeight),
            reps: String(setRx.suggestedReps),
          }
          setTimeout(() => {
            setSetForms(prev => ({ ...prev, [exerciseId]: form }))
            setInitializedExercises(prev => new Set(prev).add(exerciseId))
          }, 0)
          return form
        }
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
        // Advance to next set's prescription
        const rx = prescriptionMap.get(exerciseId)
        const nextIndex = setNumber // setNumber was 1-based, so this is the next 0-based index
        const nextRx = rx?.prescriptions[nextIndex] || rx?.prescriptions[rx.prescriptions.length - 1]
        if (nextRx) {
          setSetForms(prev => ({
            ...prev,
            [exerciseId]: {
              weight: String(nextRx.suggestedWeight),
              reps: String(nextRx.suggestedReps),
            },
          }))
        }
      },
    })
  }

  const handleFinish = () => {
    const durationMinutes = Math.round((Date.now() - startTime) / 60000)
    updateSession.mutate({ id: sessionId, completed: true, durationMinutes })
    navigate('/history')
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

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading session...</div>
  }

  if (!session) {
    return <div className="py-12 text-center text-muted-foreground">Session not found</div>
  }

  const plannedEntries = exerciseOrder.filter(e => e.plannedExerciseId)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {(session.workoutPlan as { label?: string })?.label || 'Workout'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {new Date(session.date).toLocaleDateString()}
            {(session.workoutPlan as { muscleGroups?: string[] })?.muscleGroups && (
              <> &middot; {(session.workoutPlan as { muscleGroups: string[] }).muscleGroups.join(', ')}</>
            )}
          </p>
        </div>
        <RestTimer />
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
          <Card key={entry.exerciseId}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">{entry.exerciseName}</CardTitle>
                    {targetSets > 0 && (
                      <Badge
                        variant={resolvedCount >= targetSets ? 'safe' : 'secondary'}
                        className="text-[10px]"
                      >
                        {resolvedCount}/{targetSets} sets
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{entry.equipment}</span>
                    {entry.repRange && (
                      <span className="text-[11px] text-muted-foreground">{entry.repRange} reps</span>
                    )}
                    {entry.targetRir !== undefined && (
                      <span className="text-[11px] text-muted-foreground">Target RIR {entry.targetRir}</span>
                    )}
                  </div>
                  {/* Exercise notes */}
                  {entry.notes && (
                    <p className="text-[10px] text-volume-warning mt-0.5 italic">{entry.notes}</p>
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
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
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
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => deleteSet.mutate({ sessionId, setId: set.id })}
                  >
                    <Trash2 className="h-3 w-3" />
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
                  className="h-10 flex-1 text-center text-sm"
                />
                <span className="text-xs text-muted-foreground shrink-0">×</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Reps"
                  value={form.reps}
                  onChange={(e) => updateForm(entry.exerciseId, 'reps', e.target.value)}
                  className="h-10 w-20 text-center text-sm shrink-0"
                />
                <Button
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => handleLogSet(entry.exerciseId)}
                  disabled={!form.weight || !form.reps}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {ghostSets.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 text-muted-foreground"
                    onClick={() => handleSkipSet(entry.exerciseId)}
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

      {/* Session completion */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium">How do you feel?</p>
          <div className="flex gap-2">
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
                  'flex-1 rounded-md py-2 text-xs font-medium transition-colors',
                  session.fatigueScore === score
                    ? `${color} text-black`
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button className="w-full" onClick={handleFinish}>
            <Check className="mr-2 h-4 w-4" /> Finish Workout
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
