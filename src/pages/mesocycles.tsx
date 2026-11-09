import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMesocycles, useMesocycle, useCreateMesocycle, useGenerateMesocycle, useActivateMesocycle,
  useDeleteMesocycle, useMesocycleTemplates, type Mesocycle,
} from '@/hooks/use-mesocycles'
import { useMuscleGroups } from '@/hooks/use-muscle-groups'
import { useCreateSession } from '@/hooks/use-sessions'
import { ApiError } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Plus, Play, Trash2, Calendar, Zap, ChevronRight, Dumbbell } from 'lucide-react'
import { cn } from '@/lib/utils'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Up next: the next workout in the active program ─────────────────

function findNextWorkout(meso: Mesocycle) {
  const weeks = [...(meso.mesocycleWeeks || [])].sort((a, b) => a.weekNumber - b.weekNumber)
  let done = 0
  let total = 0
  let next: { planId: number; weekNumber: number; dayOfWeek: number; label: string | null; muscleGroups: string[]; isDeload: boolean; inProgressSessionId?: number } | null = null

  for (const week of weeks) {
    const plans = [...week.workoutPlans].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    for (const plan of plans) {
      total++
      const sessions = plan.sessions || []
      if (sessions.some(s => s.completed)) {
        done++
        continue
      }
      const open = sessions.find(s => !s.completed)
      // An unfinished session always wins; otherwise the first workout not done yet
      if (open && !next?.inProgressSessionId) {
        next = { planId: plan.id, weekNumber: week.weekNumber, dayOfWeek: plan.dayOfWeek, label: plan.label, muscleGroups: plan.muscleGroups, isDeload: week.isDeload, inProgressSessionId: open.id }
      } else if (!next) {
        next = { planId: plan.id, weekNumber: week.weekNumber, dayOfWeek: plan.dayOfWeek, label: plan.label, muscleGroups: plan.muscleGroups, isDeload: week.isDeload }
      }
    }
  }
  return { next, done, total }
}

function UpNextCard({ mesocycleId }: { mesocycleId: number }) {
  const navigate = useNavigate()
  const { data: meso } = useMesocycle(mesocycleId)
  const createSession = useCreateSession()
  const summary = useMemo(() => (meso ? findNextWorkout(meso) : null), [meso])

  if (!meso || !summary) {
    return <Card className="h-[148px] animate-pulse bg-muted/30" />
  }

  const { next, done, total } = summary
  const pct = total ? Math.round((done / total) * 100) : 0

  const start = async () => {
    if (!next) return
    if (next.inProgressSessionId) {
      navigate(`/session/${next.inProgressSessionId}`)
      return
    }
    try {
      const session = await createSession.mutateAsync({ workoutPlanId: next.planId })
      navigate(`/session/${session.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data.existingSessionId) {
        navigate(`/session/${err.data.existingSessionId}`)
      }
    }
  }

  return (
    <Card className="overflow-hidden border-volume-safe/30">
      <button
        type="button"
        onClick={() => navigate(`/mesocycles/${meso.id}`)}
        className="flex w-full items-center gap-2 px-4 pt-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-volume-safe">Active program</p>
          <p className="truncate font-semibold">{meso.name}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      <div className="px-4 pt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-volume-safe" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{done} of {total} workouts done</p>
      </div>

      <div className="p-4">
        {next ? (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                {next.inProgressSessionId ? 'In progress' : 'Up next'} · Week {next.weekNumber}
                {next.isDeload && ' (deload)'} · {DAY_LABELS[next.dayOfWeek]}
              </p>
              <p className="line-clamp-2 font-medium leading-snug">{next.label || next.muscleGroups.join(' / ') || 'Workout'}</p>
            </div>
            <Button onClick={start} disabled={createSession.isPending} className="h-11 shrink-0 px-5">
              <Dumbbell className="mr-2 h-4 w-4" />
              {next.inProgressSessionId ? 'Resume' : 'Start'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Every workout is done. Open the program to mark it complete.
          </p>
        )}
      </div>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function MesocyclesPage() {
  const navigate = useNavigate()
  const { data: mesocycles, isLoading } = useMesocycles()
  const { data: muscleGroups } = useMuscleGroups()
  const { data: templates } = useMesocycleTemplates()
  const createMesocycle = useCreateMesocycle()
  const generateMesocycle = useGenerateMesocycle()
  const activateMesocycle = useActivateMesocycle()
  const deleteMesocycle = useDeleteMesocycle()

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [weeks, setWeeks] = useState(4)
  const [trainingDays, setTrainingDays] = useState<number[]>([1, 2, 4, 5])
  const [progression, setProgression] = useState('Standard')
  const [focusMuscles, setFocusMuscles] = useState<string[]>([])
  const [seedFromMesocycleId, setSeedFromMesocycleId] = useState<number | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)

  const active = mesocycles?.find(m => m.status === 'active')

  const toggleDay = (day: number) => {
    setTrainingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  const toggleFocus = (muscle: string) => {
    setFocusMuscles(prev =>
      prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]
    )
  }

  const handleCreate = async () => {
    try {
      // If a template is picked, use its training days
      const tpl = templates?.find(t => t.id === templateId)
      const effectiveTrainingDays = tpl ? tpl.trainingDays : trainingDays
      const meso = await createMesocycle.mutateAsync({
        name,
        weeks,
        trainingDays: effectiveTrainingDays,
        progression,
        focusMuscles,
      })
      await generateMesocycle.mutateAsync({ id: meso.id, seedFromMesocycleId, templateId })
      setCreating(false)
      setName('')
      setSeedFromMesocycleId(null)
      setTemplateId(null)
      navigate(`/mesocycles/${meso.id}`)
    } catch (err) {
      console.error('Mesocycle creation failed:', err)
      alert(`Failed to create mesocycle: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDelete = (meso: Mesocycle) => {
    if (confirm(`Delete "${meso.name}"? Its planned workouts will be removed.`)) {
      deleteMesocycle.mutate(meso.id)
    }
  }

  const statusColors: Record<string, 'safe' | 'warning' | 'info' | 'secondary'> = {
    active: 'safe',
    planning: 'info',
    completed: 'secondary',
    archived: 'secondary',
  }

  // Active first, then planning, then the rest
  const order: Record<string, number> = { active: 0, planning: 1 }
  const sorted = [...(mesocycles || [])].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
          <p className="text-sm text-muted-foreground">Mesocycle training blocks</p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" />
          New
        </Button>
      </div>

      {active && <UpNextCard mesocycleId={active.id} />}

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : mesocycles?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No programs yet.</p>
            <Button className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create your first program
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {active && sorted.length > 1 && (
            <h2 className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">All programs</h2>
          )}
          {sorted.map((meso) => (
            <Card
              key={meso.id}
              className="cursor-pointer transition-colors hover:border-muted-foreground/50 active:bg-muted/30"
              onClick={() => navigate(`/mesocycles/${meso.id}`)}
            >
              <CardContent className="flex items-center gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="font-semibold leading-snug break-words">{meso.name}</h3>
                    <Badge variant={statusColors[meso.status] || 'secondary'} className="shrink-0">
                      {meso.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {meso.weeks}wk &middot; {meso.trainingDays.length}d/wk &middot; {meso.progression}
                  </p>
                  {meso.focusMuscles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {meso.focusMuscles.map(m => (
                        <Badge key={m} variant="warning" className="text-[10px]">{m}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {meso.status !== 'active' && meso.status !== 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => activateMesocycle.mutate(meso.id)}
                      disabled={activateMesocycle.isPending}
                    >
                      <Play className="mr-1 h-3.5 w-3.5" /> Activate
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-volume-danger"
                    onClick={() => handleDelete(meso)}
                    aria-label={`Delete ${meso.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Program</DialogTitle>
            <DialogDescription className="sr-only">Configure and generate a new mesocycle training block</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Hypertrophy Block 1" autoComplete="off" autoCorrect="off" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Template</label>
              <NativeSelect
                value={templateId ?? ''}
                onChange={(e) => setTemplateId(e.target.value ? e.target.value : null)}
              >
                <option value="">None — auto-generate</option>
                {templates?.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </NativeSelect>
              {templateId && (
                <p className="text-xs text-muted-foreground">
                  {templates?.find(t => t.id === templateId)?.description}. Training days and exercises are set by the template; week 1 weights seed at ~85% of your prior peak per exercise.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Working weeks</label>
                <Input type="number" min={2} max={8} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} inputMode="numeric" autoComplete="off" />
                <p className="text-xs text-muted-foreground">+ 1 deload week</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Progression</label>
                <NativeSelect value={progression} onChange={(e) => setProgression(e.target.value)}>
                  <option value="Conservative">Conservative (+1 set/wk)</option>
                  <option value="Standard">Standard (+1-2 sets/wk)</option>
                  <option value="Aggressive">Aggressive (+2 sets/wk)</option>
                </NativeSelect>
              </div>
            </div>

            {!templateId && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Training days</label>
                <div className="grid grid-cols-7 gap-1">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={cn(
                        'h-11 rounded-md border text-xs font-medium transition-colors',
                        trainingDays.includes(i)
                          ? 'border-volume-safe bg-volume-safe/20 text-volume-safe'
                          : 'border-input text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {trainingDays.length < 3 && (
                  <p className="text-xs text-volume-warning">Pick at least 3 days.</p>
                )}
              </div>
            )}

            {!templateId && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Focus muscles <span className="font-normal text-muted-foreground">(higher starting volume)</span></label>
                {!muscleGroups ? (
                  <p className="text-xs text-muted-foreground">Loading muscle groups...</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {muscleGroups.filter(mg => !mg.injured).map(mg => (
                      <button
                        key={mg.name}
                        type="button"
                        onClick={() => toggleFocus(mg.name)}
                        className={cn(
                          'h-10 rounded-md border px-1 text-xs transition-colors',
                          focusMuscles.includes(mg.name)
                            ? 'border-volume-warning bg-volume-warning/20 text-volume-warning'
                            : 'border-input text-muted-foreground hover:bg-accent'
                        )}
                      >
                        {mg.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!templateId && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Seed from previous program</label>
                <NativeSelect
                  value={seedFromMesocycleId ?? ''}
                  onChange={(e) => setSeedFromMesocycleId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">None — fresh start</option>
                  {mesocycles?.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  Reuse exercise selection and start at ~90% of last peak weight.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
              <Button variant="outline" className="h-11 sm:h-10" onClick={() => setCreating(false)}>Cancel</Button>
              <Button
                className="h-11 sm:h-10"
                onClick={handleCreate}
                disabled={
                  !name ||
                  (!templateId && trainingDays.length < 3) ||
                  createMesocycle.isPending ||
                  generateMesocycle.isPending
                }
              >
                <Zap className="mr-1.5 h-4 w-4" />
                {generateMesocycle.isPending || createMesocycle.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
