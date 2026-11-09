import { useMuscleGroups } from '@/hooks/use-muscle-groups'
import { MuscleGroupCard } from '@/components/muscle-groups/muscle-group-card'

export default function MuscleGroupsPage() {
  const { data: groups, isLoading } = useMuscleGroups()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Muscle Groups</h1>
        <p className="text-sm text-muted-foreground">
          Configure volume landmarks (MEV / MAV / MRV) per muscle group
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups?.map((group) => (
            <MuscleGroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
