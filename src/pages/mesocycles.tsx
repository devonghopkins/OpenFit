import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMesocycles, useCreateMesocycle, useGenerateMesocycle, useActivateMesocycle, useDeleteMesocycle } from '@/hooks/use-mesocycles'
import { useMuscleGroups } from '@/hooks/use-muscle-groups'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Plus, Play, Trash2, Calendar, Zap } from 'lucide-react'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function MesocyclesPage() {
  const navigate = useNavigate()
  const { data: mesocycles, isLoading } = useMesocycles()
  const { data: muscleGroups } = useMuscleGroups()
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
      const meso = await createMesocycle.mutateAsync({
        name,
        weeks,
        trainingDays,
        progression,
        focusMuscles,
      })
      await generateMesocycle.mutateAsync(meso.id)
      setCreating(false)
      setName('')
      navigate(`/mesocycles/${meso.id}`)
    } catch (err) {
      console.error('Mesocycle creation failed:', err)
      alert(`Failed to create mesocycle: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const statusColors: Record<string, 'safe' | 'warning' | 'info' | 'secondary'> = {
    active: 'safe',
    planning: 'info',
    completed: 'secondary',
    archived: 'secondary',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Programs</h1>
          <p className="text-sm text-muted-foreground">Mesocycle training blocks</p>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          New
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : mesocycles?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No mesocycles yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {mesocycles?.map((meso) => (
            <Card
              key={meso.id}
              className="cursor-pointer transition-colors hover:border-muted-foreground/50"
              onClick={() => navigate(`/mesocycles/${meso.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{meso.name}</h3>
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
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {meso.status !== 'active' && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => activateMesocycle.mutate(meso.id)}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-volume-danger"
                      onClick={() => deleteMesocycle.mutate(meso.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Mesocycle</DialogTitle>
            <DialogDescription className="sr-only">Configure and generate a new mesocycle training block</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Hypertrophy Block 1" autoComplete="off" autoCorrect="off" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Working Weeks</label>
                <Input type="number" min={2} max={8} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} inputMode="numeric" autoComplete="off" />
                <p className="text-[11px] text-muted-foreground mt-1">+ 1 deload week auto-added</p>
              </div>
              <div>
                <label className="text-sm font-medium">Progression</label>
                <select
                  value={progression}
                  onChange={(e) => setProgression(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="Conservative">Conservative (+1 set/wk)</option>
                  <option value="Standard">Standard (+1-2 sets/wk)</option>
                  <option value="Aggressive">Aggressive (+2 sets/wk)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Training Days</label>
              <div className="mt-1 flex gap-1.5">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`flex-1 rounded-md border py-2 text-xs font-medium transition-colors ${
                      trainingDays.includes(i)
                        ? 'border-volume-safe bg-volume-safe/20 text-volume-safe'
                        : 'border-input text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Focus Muscles (higher starting volume)</label>
              {!muscleGroups ? (
                <p className="mt-1 text-xs text-muted-foreground">Loading muscle groups...</p>
              ) : (
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {muscleGroups.filter(mg => !mg.injured).map(mg => (
                    <button
                      key={mg.name}
                      type="button"
                      onClick={() => toggleFocus(mg.name)}
                      className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                        focusMuscles.includes(mg.name)
                          ? 'border-volume-warning bg-volume-warning/20 text-volume-warning'
                          : 'border-input text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {mg.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={!name || trainingDays.length < 3 || createMesocycle.isPending || generateMesocycle.isPending}
              >
                <Zap className="mr-2 h-4 w-4" />
                {generateMesocycle.isPending ? 'Generating...' : 'Create & Generate'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
