import { prisma } from '../db.js'

interface GenerateOptions {
  mesocycleId: number
  userId: string
  trainingDays: number[] // day-of-week numbers: 0=Sun..6=Sat
  weeks: number
  progression: 'Conservative' | 'Standard' | 'Aggressive'
  focusMuscles: string[]
  seedFromMesocycleId?: number | null
}

// Per-exercise summary from a previous mesocycle, used to deload-seed a new meso
interface SeedData {
  exerciseId: number
  peakWeight: number
  peakReps: number
  // Best logged set we found (for downstream display)
}

// Pull each exercise's peak weight × reps from a prior mesocycle's logged sets
async function getPriorMesocycleSeed(
  prevMesocycleId: number,
  userId: string,
): Promise<Map<number, SeedData>> {
  const sets = await prisma.loggedSet.findMany({
    where: {
      isWarmup: false,
      isSkipped: false,
      session: {
        userId,
        completed: true,
        workoutPlan: { mesocycleWeek: { mesocycleId: prevMesocycleId } },
      },
    },
    select: { exerciseId: true, weight: true, reps: true },
  })
  const map = new Map<number, SeedData>()
  for (const s of sets) {
    const cur = map.get(s.exerciseId)
    const score = s.weight * s.reps
    if (!cur || score > cur.peakWeight * cur.peakReps) {
      map.set(s.exerciseId, { exerciseId: s.exerciseId, peakWeight: s.weight, peakReps: s.reps })
    }
  }
  return map
}

// Snap weight to the nearest equipment increment
function snapWeight(weight: number, equipment: string): number {
  const inc: Record<string, number> = {
    Barbell: 5, 'Smith Machine': 5, Dumbbell: 5, Cable: 5, Machine: 5, Bodyweight: 0, Band: 0,
  }
  const i = inc[equipment] ?? 5
  if (i <= 0) return Math.round(weight)
  return Math.round(weight / i) * i
}

interface MuscleAllocation {
  muscleGroup: string
  setsPerWeek: number
  frequency: number
  priority: string
}

// Default split templates
const SPLIT_TEMPLATES: Record<string, Record<string, string[]>> = {
  // 3-day: Full Body
  '3': {
    'Day 1': ['Chest', 'Back', 'Quads', 'Side Delts', 'Biceps'],
    'Day 2': ['Chest', 'Back', 'Hamstrings', 'Glutes', 'Triceps'],
    'Day 3': ['Quads', 'Back', 'Side Delts', 'Rear Delts', 'Abs'],
  },
  // 4-day: Upper/Lower
  '4': {
    'Upper A': ['Chest', 'Back', 'Side Delts', 'Biceps', 'Triceps'],
    'Lower A': ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'],
    'Upper B': ['Chest', 'Back', 'Rear Delts', 'Side Delts', 'Biceps', 'Triceps'],
    'Lower B': ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'],
  },
  // 5-day: Upper/Lower/Push/Pull/Legs
  '5': {
    'Upper': ['Chest', 'Back', 'Side Delts', 'Biceps', 'Triceps'],
    'Lower': ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
    'Push': ['Chest', 'Front Delts', 'Side Delts', 'Triceps'],
    'Pull': ['Back', 'Rear Delts', 'Biceps', 'Forearms'],
    'Legs': ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'],
  },
  // 6-day: PPL x2
  '6': {
    'Push A': ['Chest', 'Front Delts', 'Side Delts', 'Triceps'],
    'Pull A': ['Back', 'Rear Delts', 'Biceps', 'Forearms'],
    'Legs A': ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
    'Push B': ['Chest', 'Side Delts', 'Triceps', 'Abs'],
    'Pull B': ['Back', 'Rear Delts', 'Traps', 'Biceps'],
    'Legs B': ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'],
  },
}

function getProgressionIncrement(progression: string): number {
  switch (progression) {
    case 'Conservative': return 1
    case 'Aggressive': return 2
    default: return 1.5 // Standard — rounds to 1 or 2
  }
}

function getRirForWeek(weekNumber: number, totalWeeks: number): number {
  // RIR decreases from 3-4 in week 1 to 0-1 in final working week
  const rirStart = 3
  const rirEnd = 1
  const progress = (weekNumber - 1) / Math.max(totalWeeks - 1, 1)
  return Math.round(rirStart - (rirStart - rirEnd) * progress)
}

// A picked exercise selection for one (label, muscle) bucket — used as the week-1 template
interface SelectedSlot {
  workoutPlanLabel: string | null
  dayOfWeek: number
  muscleName: string
  exerciseId: number
  defaultRepRange: string
  baseSets: number // sets at week 1
  sortOrder: number
}

export async function generateMesocycle(options: GenerateOptions) {
  const { mesocycleId, userId, trainingDays, weeks, progression, focusMuscles, seedFromMesocycleId } = options
  const seedMap = seedFromMesocycleId
    ? await getPriorMesocycleSeed(seedFromMesocycleId, userId)
    : null

  // Fetch muscle groups with their volume landmarks (scoped to user)
  const muscleGroups = await prisma.muscleGroup.findMany({ where: { userId } })
  const muscleMap = new Map(muscleGroups.map(mg => [mg.name, mg]))

  // Determine split based on number of training days
  const dayCount = trainingDays.length
  const splitKey = String(Math.min(dayCount, 6))
  const splitTemplate = SPLIT_TEMPLATES[splitKey] || SPLIT_TEMPLATES['4']
  const splitLabels = Object.keys(splitTemplate)
  const splitMuscles = Object.values(splitTemplate)

  // Compute per-muscle volume allocation for week 1
  const increment = getProgressionIncrement(progression)

  const muscleAllocations: MuscleAllocation[] = muscleGroups
    .filter(mg => !mg.injured)
    .map(mg => {
      const isFocus = focusMuscles.includes(mg.name)
      const startVolume = isFocus
        ? Math.ceil(mg.mev + (mg.mav - mg.mev) * 0.3) // Start above MEV for focus
        : mg.mev
      return {
        muscleGroup: mg.name,
        setsPerWeek: Math.max(startVolume, 0),
        frequency: mg.defaultFrequency,
        priority: mg.priorityTier,
      }
    })

  // Delete existing weeks for this mesocycle (regenerate)
  await prisma.mesocycleWeek.deleteMany({ where: { mesocycleId } })

  // Pre-fetch all exercises and user overrides once
  const [allExercises, userOverrides] = await Promise.all([
    prisma.exercise.findMany({ orderBy: [{ sfrRating: 'desc' }] }),
    prisma.userExerciseOverride.findMany({ where: { userId } }),
  ])
  const overrideMap = new Map(userOverrides.map(o => [o.exerciseId, o]))

  // ─── Step 1: build the week-1 "template" of exercise selections ──────
  // This is the locked-in selection that every week of the mesocycle reuses.
  // Volume progression happens via plannedSets bumps, NOT additional exercises.
  const weekUsedExercises = new Set<number>() // dedup across days within the week
  const slots: SelectedSlot[] = []

  // If seeding from a prior mesocycle, try to inherit its week-1 exercise selection.
  // Falls through to fresh generation for any day/label that doesn't match.
  let priorSlotsByDay: Map<number, Array<{ label: string | null; pe: { exerciseId: number; plannedSets: number; repRange: string; sortOrder: number; muscleName: string } }>> | null = null
  if (seedFromMesocycleId) {
    const priorWeek1 = await prisma.mesocycleWeek.findFirst({
      where: { mesocycleId: seedFromMesocycleId, weekNumber: 1 },
      include: {
        workoutPlans: {
          include: {
            plannedExercises: {
              orderBy: { sortOrder: 'asc' },
              include: { exercise: true },
            },
          },
        },
      },
    })
    if (priorWeek1) {
      priorSlotsByDay = new Map()
      for (const wp of priorWeek1.workoutPlans) {
        const arr: Array<{ label: string | null; pe: { exerciseId: number; plannedSets: number; repRange: string; sortOrder: number; muscleName: string } }> = []
        for (const pe of wp.plannedExercises) {
          const muscles: string[] = JSON.parse(pe.exercise.primaryMuscles || '[]')
          arr.push({
            label: wp.label,
            pe: {
              exerciseId: pe.exerciseId,
              plannedSets: pe.plannedSets,
              repRange: pe.repRange,
              sortOrder: pe.sortOrder,
              muscleName: muscles[0] || '',
            },
          })
        }
        priorSlotsByDay.set(wp.dayOfWeek, arr)
      }
    }
  }

  for (let d = 0; d < trainingDays.length; d++) {
    const dayOfWeek = trainingDays[d]
    const splitIndex = d % splitLabels.length
    const label = splitLabels[splitIndex]
    const dayMuscles = splitMuscles[splitIndex]

    // If seeded and we have prior slots for this dayOfWeek, inherit them and skip selection.
    const priorForDay = priorSlotsByDay?.get(dayOfWeek)
    if (priorForDay && priorForDay.length > 0) {
      for (const { pe } of priorForDay) {
        const ex = allExercises.find(e => e.id === pe.exerciseId)
        slots.push({
          workoutPlanLabel: label,
          dayOfWeek,
          muscleName: pe.muscleName,
          exerciseId: pe.exerciseId,
          defaultRepRange: ex?.defaultRepRange ?? pe.repRange,
          baseSets: pe.plannedSets,
          sortOrder: pe.sortOrder,
        })
        weekUsedExercises.add(pe.exerciseId)
      }
      continue
    }

    let sortOrder = 0
    for (const muscleName of dayMuscles) {
      const mg = muscleMap.get(muscleName)
      const baseVolume = muscleAllocations.find(a => a.muscleGroup === muscleName)?.setsPerWeek ?? 0
      const muscleSessionCount = splitMuscles.filter(sm => sm.includes(muscleName)).length
      const setsThisSession = Math.max(Math.round(baseVolume / Math.max(muscleSessionCount, 1)), 1)

      // Candidates: exercises targeting this muscle, not user-excluded
      const candidates = allExercises.filter(e => {
        const muscles: string[] = JSON.parse(e.primaryMuscles || '[]')
        if (!muscles.includes(muscleName)) return false
        const override = overrideMap.get(e.id)
        if (override?.isExcluded) return false
        return true
      })
      if (candidates.length === 0) continue

      // Prefer unused (within this week) candidates; otherwise allow reuse but
      // pick the LEAST-used so we still spread across the week.
      const unique = candidates.filter(e => !weekUsedExercises.has(e.id))
      const pool = unique.length > 0 ? unique : candidates

      const sorted = pool.sort((a, b) => {
        const aFav = overrideMap.get(a.id)?.isFavorite ? 1 : 0
        const bFav = overrideMap.get(b.id)?.isFavorite ? 1 : 0
        if (bFav !== aFav) return bFav - aFav
        return (b.sfrRating ?? 0) - (a.sfrRating ?? 0)
      })

      // 1 exercise if low volume, 2 if higher. Pick distinct exercises.
      const exerciseCount = setsThisSession <= 3 ? 1 : 2
      const picked: typeof allExercises = []
      for (const ex of sorted) {
        if (picked.length >= exerciseCount) break
        if (picked.some(p => p.id === ex.id)) continue
        picked.push(ex)
      }
      if (picked.length === 0) continue

      const setsPerExercise = Math.max(Math.round(setsThisSession / picked.length), 1)

      for (const ex of picked) {
        weekUsedExercises.add(ex.id)
        slots.push({
          workoutPlanLabel: label,
          dayOfWeek,
          muscleName,
          exerciseId: ex.id,
          defaultRepRange: ex.defaultRepRange,
          baseSets: setsPerExercise,
          sortOrder: sortOrder++,
          // Track origin muscle for caps later if needed
          // (mg used implicitly via muscleSessionCount above)
        })
        // Touch mg to keep it referenced (for type consistency)
        void mg
      }
    }
  }

  // ─── Step 2: write each week using the locked template ───────────────
  const totalWeeks = weeks + 1 // +1 for deload

  // Sets-bump schedule per progression. Each subsequent working week bumps
  // plannedSets on the heaviest-priority slots; deload halves all sets.
  function setsForWeek(baseSets: number, weekNumber: number, isDeload: boolean): number {
    if (isDeload) return Math.max(Math.round(baseSets * 0.5), 1)
    if (weekNumber === 1) return baseSets
    // +1 set per working week, scaled by progression increment
    const bump = Math.round((weekNumber - 1) * (increment / 1.5))
    return baseSets + bump
  }

  for (let w = 1; w <= totalWeeks; w++) {
    const isDeload = w === totalWeeks
    const targetRir = isDeload ? 4 : getRirForWeek(w, weeks)

    // Compute volumePlan for the week (informational; reflects actual planned sets)
    const volumePlan: Record<string, number> = {}
    for (const slot of slots) {
      const sets = setsForWeek(slot.baseSets, w, isDeload)
      const mg = muscleMap.get(slot.muscleName)
      // Cap at MRV per muscle
      const capped = mg ? Math.min(sets, mg.mrv) : sets
      volumePlan[slot.muscleName] = (volumePlan[slot.muscleName] || 0) + capped
    }

    const mesocycleWeek = await prisma.mesocycleWeek.create({
      data: {
        mesocycleId,
        weekNumber: w,
        isDeload,
        volumePlan: JSON.stringify(volumePlan),
      },
    })

    // Group slots by (dayOfWeek, label)
    const planKey = (dayOfWeek: number, label: string | null) => `${dayOfWeek}|${label ?? ''}`
    const planMap = new Map<string, { dayOfWeek: number; label: string | null; muscles: Set<string>; slots: SelectedSlot[] }>()
    for (const slot of slots) {
      const key = planKey(slot.dayOfWeek, slot.workoutPlanLabel)
      let entry = planMap.get(key)
      if (!entry) {
        entry = { dayOfWeek: slot.dayOfWeek, label: slot.workoutPlanLabel, muscles: new Set(), slots: [] }
        planMap.set(key, entry)
      }
      entry.muscles.add(slot.muscleName)
      entry.slots.push(slot)
    }

    for (const entry of planMap.values()) {
      const workoutPlan = await prisma.workoutPlan.create({
        data: {
          mesocycleWeekId: mesocycleWeek.id,
          dayOfWeek: entry.dayOfWeek,
          muscleGroups: JSON.stringify(Array.from(entry.muscles)),
          label: entry.label,
        },
      })

      for (const slot of entry.slots) {
        const sets = setsForWeek(slot.baseSets, w, isDeload)
        // Seed: week-1 starting weight = ~90% of prior peak (deload), else null
        let suggestedLoad: number | null = null
        if (seedMap && w === 1) {
          const seed = seedMap.get(slot.exerciseId)
          if (seed) {
            const ex = allExercises.find(e => e.id === slot.exerciseId)
            suggestedLoad = snapWeight(seed.peakWeight * 0.9, ex?.equipment ?? 'Barbell')
          }
        }
        await prisma.plannedExercise.create({
          data: {
            workoutPlanId: workoutPlan.id,
            exerciseId: slot.exerciseId,
            plannedSets: sets,
            repRange: slot.defaultRepRange,
            targetRir,
            sortOrder: slot.sortOrder,
            suggestedLoad,
          },
        })
      }
    }
  }

  // Update mesocycle dates
  const now = new Date()
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() + totalWeeks * 7)

  await prisma.mesocycle.update({
    where: { id: mesocycleId },
    data: {
      startDate: now,
      endDate,
    },
  })

  return { weeks: totalWeeks, message: `Generated ${weeks} working weeks + 1 deload week` }
}
