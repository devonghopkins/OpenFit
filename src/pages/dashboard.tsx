import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMuscleGroups } from '@/hooks/use-muscle-groups'
import { api } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import { Dumbbell, Calendar, BarChart3, Activity } from 'lucide-react'

interface DashboardSummary {
  activeMesocycle: { id: number; name: string; currentWeek: number; totalWeeks: number } | null
  sessionsThisWeek: number
  totalSessions: number
  totalExercises: number
  weeklyVolume: Record<string, number>
  avgRir: number | null
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const { data: muscleGroups } = useMuscleGroups()

  useEffect(() => {
    api<DashboardSummary>('/analytics/summary').then(setSummary).catch(() => {})
  }, [])

  // Build volume chart data
  const volumeData = muscleGroups?.map(mg => ({
    name: mg.name.length > 8 ? mg.name.slice(0, 7) + '…' : mg.name,
    fullName: mg.name,
    sets: summary?.weeklyVolume[mg.name] || 0,
    mev: mg.mev,
    mav: mg.mav,
    mrv: mg.mrv,
  })) || []

  const getBarColor = (sets: number, mev: number, mav: number, mrv: number) => {
    if (sets === 0) return '#27272a'
    if (sets < mev) return '#ef4444' // below MEV — red
    if (sets <= mav) return '#eab308' // MEV-MAV — yellow
    if (sets <= mrv) return '#22c55e' // MAV-MRV — green (optimal)
    return '#ef4444' // above MRV — red
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:border-muted-foreground/50" onClick={() => summary?.activeMesocycle && navigate(`/mesocycles/${summary.activeMesocycle.id}`)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Active Program
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.activeMesocycle ? (
              <>
                <p className="text-lg font-bold truncate">{summary.activeMesocycle.name}</p>
                <p className="text-xs text-muted-foreground">
                  Week {summary.activeMesocycle.currentWeek} of {summary.activeMesocycle.totalWeeks}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold">None</p>
                <p className="text-xs text-muted-foreground">Create a program</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Dumbbell className="h-3 w-3" /> This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary?.sessionsThisWeek ?? 0}</p>
            <p className="text-xs text-muted-foreground">sessions completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" /> Avg RIR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary?.avgRir ?? '—'}</p>
            <p className="text-xs text-muted-foreground">this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <BarChart3 className="h-3 w-3" /> Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary?.totalSessions ?? 0}</p>
            <p className="text-xs text-muted-foreground">sessions all time</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Volume Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Weekly Volume by Muscle Group</CardTitle>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-volume-danger inline-block" /> Below MEV</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-volume-warning inline-block" /> MEV–MAV</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-volume-safe inline-block" /> MAV–MRV</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#fafafa' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: ValueType | undefined, _name: NameType | undefined, props: { payload: { fullName: string; mev: number; mav: number; mrv: number } }) => {
                    const { mev, mav, mrv } = props.payload
                    return [`${value as number} sets (MEV: ${mev}, MAV: ${mav}, MRV: ${mrv})`, props.payload.fullName]
                  }) as never}
                />
                <Bar dataKey="sets" radius={[4, 4, 0, 0]}>
                  {volumeData.map((entry, index) => (
                    <Cell key={index} fill={getBarColor(entry.sets, entry.mev, entry.mav, entry.mrv)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => navigate('/exercises')}>
          Exercise Library
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => navigate('/mesocycles')}>
          Programs
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => navigate('/history')}>
          History
        </Button>
      </div>
    </div>
  )
}
