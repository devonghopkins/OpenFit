import { useState, useEffect } from 'react'
import { useExercises } from '@/hooks/use-exercises'
import { useMuscleGroups } from '@/hooks/use-muscle-groups'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

interface ExerciseProgress {
  date: string
  weight: number
  reps: number
  e1rm: number
  totalVolume: number
  sets: number
}

export default function AnalyticsPage() {
  const { data: exercises } = useExercises()
  const { data: muscleGroups } = useMuscleGroups()
  const [selectedExercise, setSelectedExercise] = useState<number>(0)
  const [progress, setProgress] = useState<ExerciseProgress[]>([])
  const [weeklyVolume, setWeeklyVolume] = useState<Record<string, Record<string, number>>>({})

  useEffect(() => {
    api<Record<string, Record<string, number>>>('/analytics/volume').then(setWeeklyVolume).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedExercise > 0) {
      api<ExerciseProgress[]>(`/analytics/progress/${selectedExercise}`)
        .then(setProgress)
        .catch(() => setProgress([]))
    }
  }, [selectedExercise])

  // Volume overview: current week per muscle vs landmarks
  const volumeOverview = muscleGroups?.map(mg => {
    // Get most recent week's volume
    const weeks = Object.keys(weeklyVolume).sort()
    const lastWeek = weeks[weeks.length - 1]
    const sets = lastWeek ? (weeklyVolume[lastWeek]?.[mg.name] || 0) : 0
    return { name: mg.name, sets, mev: mg.mev, mav: mg.mav, mrv: mg.mrv }
  }) || []

  const getZoneColor = (sets: number, mev: number, mav: number, mrv: number) => {
    if (sets === 0) return '#27272a'
    if (sets < mev) return '#ef4444'
    if (sets <= mav) return '#eab308'
    if (sets <= mrv) return '#22c55e'
    return '#ef4444'
  }

  const getZoneLabel = (sets: number, mev: number, mav: number, mrv: number) => {
    if (sets === 0) return 'No data'
    if (sets < mev) return 'Below MEV'
    if (sets <= mav) return 'MEV–MAV'
    if (sets <= mrv) return 'MAV–MRV (optimal)'
    return 'Above MRV'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>

      {/* Muscle Group Volume Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Volume Status by Muscle Group</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {volumeOverview.map(mg => (
              <div key={mg.name} className="flex items-center gap-2">
                <span className="w-20 text-xs truncate shrink-0">{mg.name}</span>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden relative">
                  {/* MEV marker */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-volume-warning/50"
                    style={{ left: `${(mg.mev / Math.max(mg.mrv + 4, 30)) * 100}%` }}
                  />
                  {/* MAV marker */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-volume-safe/50"
                    style={{ left: `${(mg.mav / Math.max(mg.mrv + 4, 30)) * 100}%` }}
                  />
                  {/* MRV marker */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-volume-danger/50"
                    style={{ left: `${(mg.mrv / Math.max(mg.mrv + 4, 30)) * 100}%` }}
                  />
                  {/* Current volume bar */}
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min((mg.sets / Math.max(mg.mrv + 4, 30)) * 100, 100)}%`,
                      backgroundColor: getZoneColor(mg.sets, mg.mev, mg.mav, mg.mrv),
                    }}
                  />
                </div>
                <span className="w-6 text-xs text-right shrink-0">{mg.sets}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exercise Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Exercise Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(Number(e.target.value))}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={0}>Select an exercise...</option>
            {exercises?.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>

          {progress.length > 0 ? (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progress.map(p => ({ ...p, date: new Date(p.date).toLocaleDateString() }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="e1rm" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Est. 1RM" />
                    <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Weight" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* PR cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Best Weight</p>
                  <p className="text-lg font-bold">{Math.max(...progress.map(p => p.weight))}</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Est. 1RM</p>
                  <p className="text-lg font-bold">{Math.max(...progress.map(p => p.e1rm))}</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Best Volume</p>
                  <p className="text-lg font-bold">{Math.max(...progress.map(p => p.totalVolume)).toLocaleString()}</p>
                </div>
              </div>
            </>
          ) : selectedExercise > 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No data yet for this exercise.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
