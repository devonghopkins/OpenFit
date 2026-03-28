import { useState } from 'react'
import { useUpdateMuscleGroup, type MuscleGroup } from '@/hooks/use-muscle-groups'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pencil, Check, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MuscleGroupCardProps {
  group: MuscleGroup
}

export function MuscleGroupCard({ group }: MuscleGroupCardProps) {
  const [editing, setEditing] = useState(false)
  const [mev, setMev] = useState(group.mev)
  const [mav, setMav] = useState(group.mav)
  const [mrv, setMrv] = useState(group.mrv)
  const [frequency, setFrequency] = useState(group.defaultFrequency)
  const [priority, setPriority] = useState(group.priorityTier)

  const updateGroup = useUpdateMuscleGroup()

  const handleSave = () => {
    updateGroup.mutate(
      {
        id: group.id,
        mev,
        mav,
        mrv,
        defaultFrequency: frequency,
        priorityTier: priority as 'High' | 'Medium' | 'Low',
      },
      { onSuccess: () => setEditing(false) }
    )
  }

  const handleCancel = () => {
    setMev(group.mev)
    setMav(group.mav)
    setMrv(group.mrv)
    setFrequency(group.defaultFrequency)
    setPriority(group.priorityTier)
    setEditing(false)
  }

  const handleToggleInjured = () => {
    updateGroup.mutate({ id: group.id, injured: !group.injured })
  }

  const priorityColor = {
    High: 'danger',
    Medium: 'warning',
    Low: 'info',
  } as const

  // Volume bar visualization: show MEV-MAV-MRV as colored segments
  const maxScale = Math.max(mrv + 4, 30)
  const mevPct = (mev / maxScale) * 100
  const mavPct = ((mav - mev) / maxScale) * 100
  const mrvPct = ((mrv - mav) / maxScale) * 100

  return (
    <Card className={cn('transition-colors', group.injured && 'border-volume-danger/50 opacity-75')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{group.name}</CardTitle>
            {group.injured && (
              <AlertTriangle className="h-4 w-4 text-volume-danger" />
            )}
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={priorityColor[group.priorityTier as keyof typeof priorityColor] ?? 'secondary'}>
              {group.priorityTier}
            </Badge>
            {!editing ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-volume-safe" onClick={handleSave}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Volume bar */}
        <div className="space-y-1">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="bg-volume-danger/60"
              style={{ width: `${mevPct}%` }}
              title={`Below MEV: 0-${mev}`}
            />
            <div
              className="bg-volume-warning"
              style={{ width: `${mavPct}%` }}
              title={`MEV-MAV: ${mev}-${mav}`}
            />
            <div
              className="bg-volume-safe"
              style={{ width: `${mrvPct}%` }}
              title={`MAV-MRV: ${mav}-${mrv}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span>MEV {mev}</span>
            <span>MAV {mav}</span>
            <span>MRV {mrv}</span>
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">MEV</label>
                <Input
                  type="number"
                  min={0}
                  value={mev}
                  onChange={(e) => setMev(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">MAV</label>
                <Input
                  type="number"
                  min={0}
                  value={mav}
                  onChange={(e) => setMav(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">MRV</label>
                <Input
                  type="number"
                  min={0}
                  value={mrv}
                  onChange={(e) => setMrv(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Frequency</label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={frequency}
                  onChange={(e) => setFrequency(Number(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{group.defaultFrequency}x/week</span>
            <button
              onClick={handleToggleInjured}
              className={cn(
                'rounded-md border px-2 py-0.5 transition-colors',
                group.injured
                  ? 'border-volume-danger/50 bg-volume-danger/10 text-volume-danger'
                  : 'border-input hover:bg-accent'
              )}
            >
              {group.injured ? 'Injured' : 'Mark Injured'}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
