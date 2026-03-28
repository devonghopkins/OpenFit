import type { Exercise } from '@/hooks/use-exercises'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Star, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExerciseCardProps {
  exercise: Exercise
  onEdit: () => void
  onToggleFavorite: () => void
}

export function ExerciseCard({ exercise, onEdit, onToggleFavorite }: ExerciseCardProps) {
  return (
    <Card className="group relative transition-colors hover:border-muted-foreground/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium text-sm">{exercise.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {exercise.equipment} &middot; {exercise.movementPattern}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onToggleFavorite}
            >
              <Star
                className={cn(
                  'h-3.5 w-3.5',
                  exercise.isFavorite
                    ? 'fill-volume-warning text-volume-warning'
                    : 'text-muted-foreground'
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {exercise.primaryMuscles.map((m) => (
            <Badge key={m} variant="safe" className="text-[10px] px-1.5 py-0">
              {m}
            </Badge>
          ))}
          {exercise.secondaryMuscles.map((m) => (
            <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
              {m}
            </Badge>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>Reps: {exercise.defaultRepRange}</span>
          <span>SFR: {exercise.sfrRating}/5</span>
          {exercise.isExcluded && (
            <Badge variant="danger" className="text-[10px] px-1.5 py-0">
              Excluded
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
