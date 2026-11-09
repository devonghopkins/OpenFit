import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { EQUIPMENT_TYPES, MUSCLE_GROUPS } from '@/lib/constants'
import { Search, Star, X } from 'lucide-react'

interface Filters {
  search: string
  muscle: string
  equipment: string
  favorites: boolean
}

interface ExerciseFiltersProps {
  filters: Filters
  onChange: (filters: Filters) => void
}

export function ExerciseFilters({ filters, onChange }: ExerciseFiltersProps) {
  const update = (partial: Partial<Filters>) => onChange({ ...filters, ...partial })

  const hasActiveFilters = filters.muscle || filters.equipment || filters.favorites

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search exercises..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="pl-9"
          type="search"
          enterKeyHint="search"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <NativeSelect
          value={filters.muscle}
          onChange={(e) => update({ muscle: e.target.value })}
          className="sm:w-auto"
        >
          <option value="">All Muscles</option>
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={filters.equipment}
          onChange={(e) => update({ equipment: e.target.value })}
          className="sm:w-auto"
        >
          <option value="">All Equipment</option>
          {EQUIPMENT_TYPES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </NativeSelect>
        <Button
          variant={filters.favorites ? 'default' : 'outline'}
          onClick={() => update({ favorites: !filters.favorites })}
        >
          <Star className="mr-1.5 h-4 w-4" />
          Favorites
        </Button>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            onClick={() => onChange({ search: filters.search, muscle: '', equipment: '', favorites: false })}
          >
            <X className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
