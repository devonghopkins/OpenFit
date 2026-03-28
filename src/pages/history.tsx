import { useNavigate } from 'react-router-dom'
import { useSessions } from '@/hooks/use-sessions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClipboardList, Plus } from 'lucide-react'
import { useCreateSession } from '@/hooks/use-sessions'

export default function HistoryPage() {
  const navigate = useNavigate()
  const { data: sessions, isLoading } = useSessions()
  const createSession = useCreateSession()

  const handleFreeformSession = async () => {
    const session = await createSession.mutateAsync({})
    navigate(`/session/${session.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <Button variant="outline" onClick={handleFreeformSession}>
          <Plus className="mr-2 h-4 w-4" /> Freeform Session
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : sessions?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No sessions logged yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions?.map((session) => {
            const totalSets = session.loggedSets.filter(s => !s.isWarmup).length
            const exercises = [...new Set(session.loggedSets.map(s => s.exercise.name))]
            const totalVolume = session.loggedSets
              .filter(s => !s.isWarmup)
              .reduce((sum, s) => sum + s.weight * s.reps, 0)

            return (
              <Card
                key={session.id}
                className="cursor-pointer transition-colors hover:border-muted-foreground/50"
                onClick={() => navigate(`/session/${session.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {session.workoutPlan?.label || 'Freeform'}
                        </span>
                        {session.completed && <Badge variant="safe" className="text-[10px]">Done</Badge>}
                        {session.fatigueScore && (
                          <Badge
                            variant={session.fatigueScore >= 4 ? 'safe' : session.fatigueScore >= 3 ? 'info' : 'warning'}
                            className="text-[10px]"
                          >
                            Fatigue: {session.fatigueScore}/5
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(session.date).toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })}
                        {session.durationMinutes && <> &middot; {session.durationMinutes} min</>}
                        {totalSets > 0 && <> &middot; {totalSets} sets</>}
                        {totalVolume > 0 && <> &middot; {Math.round(totalVolume).toLocaleString()} lb</>}
                      </p>
                      {exercises.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1 truncate max-w-xs">
                          {exercises.slice(0, 4).join(', ')}{exercises.length > 4 && ` +${exercises.length - 4} more`}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
