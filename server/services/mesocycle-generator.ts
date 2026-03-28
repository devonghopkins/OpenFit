import { prisma } from '../db.js'

interface GenerateOptions {
  mesocycleId: number
  trainingDays: number[] // day-of-week numbers: 0=Sun..6=Sat
  weeks: number
  progression: 'Conservative' | 'Standard' | 'Aggressive'
  focusMuscles: string[]
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

export async function generateMesocycle(options: GenerateOptions) {
  const { mesocycleId, trainingDays, weeks, progression, focusMuscles } = options

  // Fetch muscle groups with their volume landmarks
  const muscleGroups = await prisma.muscleGroup.findMany()
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

  // Generate each week (working weeks + deload)
  const totalWeeks = weeks + 1 // +1 for deload
  for (let w = 1; w <= totalWeeks; w++) {
    const isDeload = w === totalWeeks

    // Calculate volume plan for this week
    const volumePlan: Record<string, number> = {}
    for (const alloc of muscleAllocations) {
      const mg = muscleMap.get(alloc.muscleGroup)
      if (!mg) continue

      if (isDeload) {
        // Deload: 50% of week 1 volume
        volumePlan[alloc.muscleGroup] = Math.max(Math.round(alloc.setsPerWeek * 0.5), 0)
      } else {
        // Progressive volume: week 1 base + increment per week
        const weeklyIncrease = Math.round((w - 1) * increment)
        const planned = alloc.setsPerWeek + weeklyIncrease
        // Cap at MRV
        volumePlan[alloc.muscleGroup] = Math.min(planned, mg.mrv)
      }
    }

    const mesocycleWeek = await prisma.mesocycleWeek.create({
      data: {
        mesocycleId,
        weekNumber: w,
        isDeload,
        volumePlan: JSON.stringify(volumePlan),
      },
    })

    // Create workout plans for each training day
    for (let d = 0; d < trainingDays.length; d++) {
      const dayOfWeek = trainingDays[d]
      const splitIndex = d % splitLabels.length
      const label = splitLabels[splitIndex]
      const dayMuscles = splitMuscles[splitIndex]

      const workoutPlan = await prisma.workoutPlan.create({
        data: {
          mesocycleWeekId: mesocycleWeek.id,
          dayOfWeek,
          muscleGroups: JSON.stringify(dayMuscles),
          label,
        },
      })

      // Select exercises for each muscle group in this day
      let sortOrder = 0
      for (const muscleName of dayMuscles) {
        const weekVolume = volumePlan[muscleName] || 0
        // Divide weekly sets across training frequency for this muscle
        const mg = muscleMap.get(muscleName)
        const freq = mg?.defaultFrequency || 2
        // How many sessions does this muscle appear in this split?
        const muscleSessionCount = splitMuscles.filter(sm => sm.includes(muscleName)).length
        const setsThisSession = Math.max(Math.round(weekVolume / Math.max(muscleSessionCount, 1)), 1)

        // Pick exercises for this muscle
        const exercises = await prisma.exercise.findMany({
          where: {
            isExcluded: false,
            primaryMuscles: { contains: muscleName },
          },
          orderBy: [
            { isFavorite: 'desc' },
            { sfrRating: 'desc' },
          ],
          take: 3,
        })

        if (exercises.length === 0) continue

        // Distribute sets across 1-2 exercises
        const exercisesToUse = setsThisSession <= 3 ? exercises.slice(0, 1) : exercises.slice(0, 2)
        const setsPerExercise = Math.max(Math.round(setsThisSession / exercisesToUse.length), 1)

        const targetRir = getRirForWeek(w, weeks)

        for (const ex of exercisesToUse) {
          await prisma.plannedExercise.create({
            data: {
              workoutPlanId: workoutPlan.id,
              exerciseId: ex.id,
              plannedSets: isDeload ? Math.max(Math.round(setsPerExercise * 0.5), 1) : setsPerExercise,
              repRange: ex.defaultRepRange,
              targetRir: isDeload ? 4 : targetRir,
              sortOrder: sortOrder++,
            },
          })
        }
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
