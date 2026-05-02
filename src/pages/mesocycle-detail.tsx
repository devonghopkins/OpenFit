import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useMesocycle, useActivateMesocycle, useCompleteMesocycle, useSwapExercise, useSwapExerciseRemaining,
  useReorderExercises, useReorderExercisesRemaining,
  useAddExerciseToPlan, useAddExercisePropagated,
  useUpdateExerciseNotes,
  type PlannedExercise, type Mesocycle, type WorkoutPlan,
} from '@/hooks/use-mesocycles'
import { useExercises } from '@/hooks/use-exercises'
import { useCreateSession } from '@/hooks/use-sessions'
import { ApiError } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { ArrowLeft, Play, Dumbbell, ArrowLeftRight, Star, Search, Plus, ChevronUp, ChevronDown, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Calendar View for Active Mesocycles ──────────────────────────────

function MesocycleCalendar({ meso, onStartSession }: { meso: Mesocycle; onStartSession: (planId: number) => void }) {
  const navigate = useNavigate()

  // Build a map of workout plans by week + day
  const workoutMap = useMemo(() => {
    const map = new Map<string, {
      planId: number
      label: string | null
      muscleGroups: string[]
      weekNumber: number
      status: 'completed' | 'in-progress' | 'upcoming'
      sessionId?: number
    }>()

    for (const week of meso.mesocycleWeeks || []) {
      for (const plan of week.workoutPlans) {
        const key = `${week.weekNumber}-${plan.dayOfWeek}`
        const sessions = plan.sessions || []
        const completedSession = sessions.find(s => s.completed)
        const inProgressSession = sessions.find(s => !s.completed)

        let status: 'completed' | 'in-progress' | 'upcoming' = 'upcoming'
        let sessionId: number | undefined
        if (completedSession) {
          status = 'completed'
          sessionId = completedSession.id
        } else if (inProgressSession) {
          status = 'in-progress'
          sessionId = inProgressSession.id
        }

        map.set(key, {
          planId: plan.id,
          label: plan.label,
          muscleGroups: plan.muscleGroups,
          weekNumber: week.weekNumber,
          status,
          sessionId,
        })
      }
    }
    return map
  }, [meso])

  const totalWeeks = (meso.mesocycleWeeks?.length || 0)

  const getStatusColor = (status: 'completed' | 'in-progress' | 'upcoming') => {
    switch (status) {
      case 'completed': return 'bg-volume-safe/20 border-volume-safe/40 text-volume-safe'
      case 'in-progress': return 'bg-volume-danger/20 border-volume-danger/40 text-volume-danger'
      case 'upcoming': return 'bg-muted border-muted-foreground/20 text-muted-foreground'
    }
  }

  const getStatusDot = (status: 'completed' | 'in-progress' | 'upcoming') => {
    switch (status) {
      case 'completed': return 'bg-volume-safe'
      case 'in-progress': return 'bg-volume-danger'
      case 'upcoming': return 'bg-muted-foreground/40'
    }
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-volume-safe" /> Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-volume-danger" /> Active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" /> Upcoming
        </span>
      </div>

      {/* Week rows */}
      {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(weekNum => {
        const isDeload = meso.mesocycleWeeks?.find(w => w.weekNumber === weekNum)?.isDeload

        return (
          <div key={weekNum} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">
                Week {weekNum}
              </h3>
              {isDeload && <Badge variant="warning" className="text-[9px]">Deload</Badge>}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {DAY_LABELS.map((dayLabel, dayIndex) => {
                const workout = workoutMap.get(`${weekNum}-${dayIndex}`)

                if (!workout) {
                  return (
                    <div
                      key={dayIndex}
                      className="rounded-lg border border-transparent p-2 min-h-[60px] flex flex-col items-center justify-center"
                    >
                      <span className="text-[10px] text-muted-foreground/40">{dayLabel}</span>
                    </div>
                  )
                }

                return (
                  <button
                    key={dayIndex}
                    onClick={() => {
                      if (workout.status === 'in-progress' && workout.sessionId) {
                        navigate(`/session/${workout.sessionId}`)
                      } else if (workout.status === 'completed' && workout.sessionId) {
                        navigate(`/session/${workout.sessionId}`)
                      } else {
                        onStartSession(workout.planId)
                      }
                    }}
                    className={cn(
                      'rounded-lg border p-1.5 min-h-[60px] flex flex-col items-center justify-center gap-0.5 transition-colors hover:brightness-110',
                      getStatusColor(workout.status),
                    )}
                  >
                    <span className="text-[10px] font-medium">{dayLabel}</span>
                    <span className={cn('h-2 w-2 rounded-full', getStatusDot(workout.status))} />
                    <span className="text-[8px] leading-tight text-center truncate w-full">
                      {workout.label || workout.muscleGroups.join('/')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Planning View (existing detailed view) ───────────────────────────

function PlanningView({
  meso,
  onStartSession,
  onSwap,
  onAddExercise,
  onMoveExercise,
  onEditNotes,
}: {
  meso: Mesocycle
  onStartSession: (planId: number) => void
  onSwap: (pe: PlannedExercise) => void
  onAddExercise: (plan: WorkoutPlan) => void
  onMoveExercise: (plan: WorkoutPlan, peIndex: number, direction: 'up' | 'down') => void
  onEditNotes: (pe: PlannedExercise) => void
}) {
  const createSession = useCreateSession()

  return (
    <>
      {meso.mesocycleWeeks?.map((week) => (
        <div key={week.id} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              Week {week.weekNumber}
              {week.isDeload && (
                <Badge variant="warning" className="ml-2">Deload</Badge>
              )}
            </h2>
            <span className="text-xs text-muted-foreground">
              {Object.values(week.volumePlan).reduce((a, b) => a + b, 0)} total sets
            </span>
          </div>

          {/* Volume plan summary */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(week.volumePlan)
              .filter(([_, sets]) => sets > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([muscle, sets]) => (
                <Badge key={muscle} variant="secondary" className="text-[10px]">
                  {muscle}: {sets}
                </Badge>
              ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {week.workoutPlans.map((plan) => (
              <Card key={plan.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {DAY_LABELS[plan.dayOfWeek]} — {plan.label || 'Workout'}
                    </CardTitle>
                    <div className="flex gap-1">
                      {meso.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onStartSession(plan.id)}
                          disabled={createSession.isPending}
                        >
                          <Dumbbell className="mr-1 h-3 w-3" /> Log
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {plan.muscleGroups.map((mg: string) => (
                      <Badge key={mg} variant="safe" className="text-[10px] px-1.5 py-0">
                        {mg}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {plan.plannedExercises.map((pe, idx) => (
                      <div key={pe.id}>
                        <div className="flex items-center gap-1 text-sm group">
                          {/* Move up/down */}
                          <div className="flex flex-col shrink-0">
                            <button
                              onClick={() => onMoveExercise(plan, idx, 'up')}
                              disabled={idx === 0}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-20"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => onMoveExercise(plan, idx, 'down')}
                              disabled={idx === plan.plannedExercises.length - 1}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-20"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                          <button
                            onClick={() => onSwap(pe)}
                            className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Swap exercise"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onEditNotes(pe)}
                            className={cn(
                              'shrink-0 p-1 rounded hover:bg-muted transition-colors',
                              pe.notes ? 'text-yellow-500' : 'text-muted-foreground hover:text-foreground',
                            )}
                            title="Notes"
                          >
                            <StickyNote className="h-3.5 w-3.5" />
                          </button>
                          <span className="truncate text-foreground flex-1">{pe.exercise.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {pe.plannedSets}×{pe.repRange} @RIR {pe.targetRir}
                          </span>
                        </div>
                        {pe.notes && (
                          <p className="text-[10px] italic text-yellow-500/80 ml-[72px] -mt-0.5">{pe.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => onAddExercise(plan)}
                    className="mt-2 w-full flex items-center justify-center gap-1 p-1.5 rounded border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add Exercise
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function MesocycleDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: meso, isLoading } = useMesocycle(Number(id))
  const activateMesocycle = useActivateMesocycle()
  const completeMesocycle = useCompleteMesocycle()
  const createSession = useCreateSession()
  const swapExercise = useSwapExercise()
  const swapRemaining = useSwapExerciseRemaining()
  const reorderExercises = useReorderExercises()
  const reorderRemaining = useReorderExercisesRemaining()
  const addExercise = useAddExerciseToPlan()
  const addExercisePropagated = useAddExercisePropagated()
  const updateNotes = useUpdateExerciseNotes()

  // Swap dialog state
  const [swapTarget, setSwapTarget] = useState<PlannedExercise | null>(null)
  const [swapSearch, setSwapSearch] = useState('')
  const [swapSelectedId, setSwapSelectedId] = useState<number | null>(null)
  // View toggle
  const [showDetailView, setShowDetailView] = useState(false)
  // Add exercise dialog state
  const [addTarget, setAddTarget] = useState<WorkoutPlan | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [addSelectedId, setAddSelectedId] = useState<number | null>(null)
  // Reorder propagation dialog state
  const [reorderPending, setReorderPending] = useState<{ plan: WorkoutPlan; order: number[] } | null>(null)
  // Notes dialog state
  const [notesTarget, setNotesTarget] = useState<PlannedExercise | null>(null)
  const [notesText, setNotesText] = useState('')

  // Fetch exercises for swap dialog
  const primaryMuscle = swapTarget?.exercise.primaryMuscles[0] || ''
  const { data: alternatives } = useExercises(
    swapTarget ? { muscle: primaryMuscle } : {}
  )

  // Fetch all exercises for add dialog
  const { data: allExercises } = useExercises({})

  const filteredAlternatives = alternatives
    ?.filter(ex => ex.id !== swapTarget?.exerciseId)
    .filter(ex => !swapSearch || ex.name.toLowerCase().includes(swapSearch.toLowerCase()))
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return b.sfrRating - a.sfrRating
    })

  const filteredAddExercises = allExercises
    ?.filter(ex => !addSearch || ex.name.toLowerCase().includes(addSearch.toLowerCase()))
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return b.sfrRating - a.sfrRating
    })
    .slice(0, 50)

  const handleSwap = async (exerciseId: number, forRemaining: boolean) => {
    if (!swapTarget) return
    if (forRemaining) {
      await swapRemaining.mutateAsync({ plannedExerciseId: swapTarget.id, exerciseId })
    } else {
      await swapExercise.mutateAsync({ plannedExerciseId: swapTarget.id, exerciseId })
    }
    setSwapTarget(null)
    setSwapSearch('')
    setSwapSelectedId(null)
  }

  const handleStartSession = async (workoutPlanId: number) => {
    try {
      const session = await createSession.mutateAsync({ workoutPlanId })
      navigate(`/session/${session.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data.existingSessionId) {
        navigate(`/session/${err.data.existingSessionId}`)
      }
    }
  }

  const handleAddExercise = async (exerciseId: number, propagate: boolean) => {
    if (!addTarget) return
    if (propagate) {
      await addExercisePropagated.mutateAsync({ workoutPlanId: addTarget.id, exerciseId })
    } else {
      await addExercise.mutateAsync({ workoutPlanId: addTarget.id, exerciseId })
    }
    setAddTarget(null)
    setAddSearch('')
    setAddSelectedId(null)
  }

  const handleMoveExercise = (plan: WorkoutPlan, peIndex: number, direction: 'up' | 'down') => {
    const exercises = [...plan.plannedExercises]
    const targetIndex = direction === 'up' ? peIndex - 1 : peIndex + 1
    if (targetIndex < 0 || targetIndex >= exercises.length) return

    // Swap the two
    ;[exercises[peIndex], exercises[targetIndex]] = [exercises[targetIndex], exercises[peIndex]]
    const newOrder = exercises.map(pe => pe.id)

    // Show propagation choice
    setReorderPending({ plan, order: newOrder })
  }

  const handleReorderConfirm = async (propagate: boolean) => {
    if (!reorderPending) return
    if (propagate) {
      await reorderRemaining.mutateAsync({ workoutPlanId: reorderPending.plan.id, exerciseOrder: reorderPending.order })
    } else {
      await reorderExercises.mutateAsync({ workoutPlanId: reorderPending.plan.id, exerciseOrder: reorderPending.order })
    }
    setReorderPending(null)
  }

  const handleSaveNotes = async () => {
    if (!notesTarget) return
    await updateNotes.mutateAsync({ plannedExerciseId: notesTarget.id, notes: notesText })
    setNotesTarget(null)
    setNotesText('')
  }

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading...</div>
  }

  if (!meso) {
    return <div className="py-12 text-center text-muted-foreground">Mesocycle not found</div>
  }

  const isActive = meso.status === 'active'

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 mt-1" onClick={() => navigate('/mesocycles')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight truncate">{meso.name}</h1>
            <Badge variant={isActive ? 'safe' : 'info'} className="shrink-0">{meso.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {meso.weeks}wk + deload &middot; {meso.progression}
          </p>
        </div>
        {!isActive && meso.status !== 'completed' && (
          <Button size="sm" className="shrink-0" onClick={() => activateMesocycle.mutate(meso.id)}>
            <Play className="mr-1 h-3 w-3" /> Activate
          </Button>
        )}
        {isActive && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              if (confirm('Complete this mesocycle? Any open sessions will be auto-finished with skipped sets.')) {
                completeMesocycle.mutate(meso.id)
              }
            }}
          >
            Complete
          </Button>
        )}
      </div>

      {/* View toggle for active mesocycles */}
      {isActive && (
        <div className="flex gap-2">
          <Button
            variant={!showDetailView ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowDetailView(false)}
          >
            Calendar
          </Button>
          <Button
            variant={showDetailView ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowDetailView(true)}
          >
            Detail
          </Button>
        </div>
      )}

      {/* Show calendar for active mesocycles (default), detail/planning view otherwise */}
      {isActive && !showDetailView ? (
        <MesocycleCalendar meso={meso} onStartSession={handleStartSession} />
      ) : (
        <PlanningView
          meso={meso}
          onStartSession={handleStartSession}
          onSwap={(pe) => { setSwapTarget(pe); setSwapSearch(''); setSwapSelectedId(null) }}
          onAddExercise={(plan) => { setAddTarget(plan); setAddSearch(''); setAddSelectedId(null) }}
          onMoveExercise={handleMoveExercise}
          onEditNotes={(pe) => { setNotesTarget(pe); setNotesText(pe.notes || '') }}
        />
      )}

      {/* Swap Exercise Dialog */}
      <Dialog open={!!swapTarget} onOpenChange={(open) => { if (!open) { setSwapTarget(null); setSwapSearch(''); setSwapSelectedId(null) } }}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">Swap Exercise</DialogTitle>
            <DialogDescription>
              Replace <span className="font-medium text-foreground">{swapTarget?.exercise.name}</span> with
              another <span className="font-medium text-foreground">{primaryMuscle}</span> exercise
            </DialogDescription>
          </DialogHeader>

          {swapSelectedId ? (
            <div className="space-y-3 py-4">
              <p className="text-sm text-center">
                Replace with <span className="font-medium">{filteredAlternatives?.find(e => e.id === swapSelectedId)?.name}</span>
              </p>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" onClick={() => handleSwap(swapSelectedId, false)} disabled={swapExercise.isPending || swapRemaining.isPending}>
                  This week only
                </Button>
                <Button onClick={() => handleSwap(swapSelectedId, true)} disabled={swapExercise.isPending || swapRemaining.isPending}>
                  This week + all remaining weeks
                </Button>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setSwapSelectedId(null)}>
                Back
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search exercises..."
                  value={swapSearch}
                  onChange={(e) => setSwapSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[50vh] -mx-2 px-2">
                {filteredAlternatives?.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setSwapSelectedId(ex.id)}
                    disabled={swapExercise.isPending || swapRemaining.isPending}
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
                {filteredAlternatives?.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">
                    No matching exercises found
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Exercise Dialog */}
      <Dialog open={!!addTarget} onOpenChange={(open) => { if (!open) { setAddTarget(null); setAddSearch(''); setAddSelectedId(null) } }}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">Add Exercise</DialogTitle>
            <DialogDescription>
              Add an exercise to {addTarget?.label || 'this workout'}
            </DialogDescription>
          </DialogHeader>

          {addSelectedId ? (
            <div className="space-y-3 py-4">
              <p className="text-sm text-center">
                Add <span className="font-medium">{filteredAddExercises?.find(e => e.id === addSelectedId)?.name}</span>
              </p>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" onClick={() => handleAddExercise(addSelectedId, false)} disabled={addExercise.isPending || addExercisePropagated.isPending}>
                  This week only
                </Button>
                <Button onClick={() => handleAddExercise(addSelectedId, true)} disabled={addExercise.isPending || addExercisePropagated.isPending}>
                  This week + all remaining weeks
                </Button>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setAddSelectedId(null)}>
                Back
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search exercises..."
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[50vh] -mx-2 px-2">
                {filteredAddExercises?.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setAddSelectedId(ex.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left hover:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {ex.isFavorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                        <span className="text-sm font-medium truncate">{ex.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{ex.equipment}</span>
                        <span className="text-[10px] text-muted-foreground">{ex.primaryMuscles.join(', ')}</span>
                        <span className="text-[10px] text-muted-foreground">{ex.defaultRepRange}</span>
                      </div>
                    </div>
                  </button>
                ))}
                {filteredAddExercises?.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-6">
                    No matching exercises found
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reorder Propagation Dialog */}
      <Dialog open={!!reorderPending} onOpenChange={(open) => { if (!open) setReorderPending(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Apply Reorder</DialogTitle>
            <DialogDescription>
              Apply this exercise order change to future weeks too?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 pt-2">
            <Button variant="outline" onClick={() => handleReorderConfirm(false)} disabled={reorderExercises.isPending || reorderRemaining.isPending}>
              This week only
            </Button>
            <Button onClick={() => handleReorderConfirm(true)} disabled={reorderExercises.isPending || reorderRemaining.isPending}>
              This week + all remaining weeks
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={!!notesTarget} onOpenChange={(open) => { if (!open) { setNotesTarget(null); setNotesText('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Exercise Notes</DialogTitle>
            <DialogDescription>
              {notesTarget?.exercise.name} — notes propagate to all remaining weeks
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Use close grip, pause at bottom..."
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNotes() }}
          />
          <div className="flex gap-2 justify-end">
            {notesTarget?.notes && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!notesTarget) return
                  await updateNotes.mutateAsync({ plannedExerciseId: notesTarget.id, notes: '' })
                  setNotesTarget(null)
                  setNotesText('')
                }}
                disabled={updateNotes.isPending}
              >
                Clear
              </Button>
            )}
            <Button size="sm" onClick={handleSaveNotes} disabled={updateNotes.isPending}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
