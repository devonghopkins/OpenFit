import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMesocycle, useActivateMesocycle, useSwapExercise, useSwapExerciseRemaining, type PlannedExercise, type Mesocycle } from '@/hooks/use-mesocycles'
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
import { ArrowLeft, Play, Dumbbell, ArrowLeftRight, Star, Search } from 'lucide-react'
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
}: {
  meso: Mesocycle
  onStartSession: (planId: number) => void
  onSwap: (pe: PlannedExercise) => void
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
                  <div className="flex gap-1">
                    {plan.muscleGroups.map((mg: string) => (
                      <Badge key={mg} variant="safe" className="text-[10px] px-1.5 py-0">
                        {mg}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    {plan.plannedExercises.map((pe) => (
                      <div key={pe.id} className="flex items-center gap-2 text-sm group">
                        <button
                          onClick={() => onSwap(pe)}
                          className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Swap exercise"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                        </button>
                        <span className="truncate text-foreground flex-1">{pe.exercise.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {pe.plannedSets}×{pe.repRange} @RIR {pe.targetRir}
                        </span>
                      </div>
                    ))}
                  </div>
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
  const createSession = useCreateSession()
  const swapExercise = useSwapExercise()
  const swapRemaining = useSwapExerciseRemaining()

  const [swapTarget, setSwapTarget] = useState<PlannedExercise | null>(null)
  const [swapSearch, setSwapSearch] = useState('')
  const [swapSelectedId, setSwapSelectedId] = useState<number | null>(null)
  // For active mesocycles, allow toggling between calendar and detail view
  const [showDetailView, setShowDetailView] = useState(false)

  // Fetch exercises filtered by the swap target's primary muscle
  const primaryMuscle = swapTarget?.exercise.primaryMuscles[0] || ''
  const { data: alternatives } = useExercises(
    swapTarget ? { muscle: primaryMuscle } : {}
  )

  const filteredAlternatives = alternatives
    ?.filter(ex => ex.id !== swapTarget?.exerciseId)
    .filter(ex => !swapSearch || ex.name.toLowerCase().includes(swapSearch.toLowerCase()))
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return b.sfrRating - a.sfrRating
    })

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
        {!isActive && (
          <Button size="sm" className="shrink-0" onClick={() => activateMesocycle.mutate(meso.id)}>
            <Play className="mr-1 h-3 w-3" /> Activate
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
          onSwap={(pe) => { setSwapTarget(pe); setSwapSearch('') }}
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
    </div>
  )
}
