import { prisma } from '../db.js'

export interface SetPrescription {
  setNumber: number
  suggestedWeight: number
  suggestedReps: number
  lastWeight: number
  lastReps: number
  e1rm: number
  reason: string
}

export interface ExercisePrescription {
  exerciseId: number
  targetRir: number
  plannedSets: number
  adjustedPlannedSets: number // may be higher if user did extra sets last time
  prescriptions: SetPrescription[]
}

// ─── Math utilities ──────────────────────────────────────────────────

function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

function effectiveE1RM(weight: number, reps: number, rir: number | null): number {
  const repsToFailure = reps + (rir ?? 0)
  return epley1RM(weight, repsToFailure)
}

function repsForWeight(e1rm: number, weight: number, targetRir: number): number {
  if (weight <= 0 || e1rm <= 0) return 0
  const repsAtFailure = 30 * (e1rm / weight - 1)
  return Math.max(1, Math.round(repsAtFailure - targetRir))
}

function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return Math.round(weight)
  return Math.round(weight / increment) * increment
}

function getIncrement(equipment: string, overrides?: Record<string, number>): number {
  const defaults: Record<string, number> = {
    Barbell: 5, 'Smith Machine': 5, Dumbbell: 5,
    Cable: 5, Machine: 5, Bodyweight: 0, Band: 0,
  }
  return overrides?.[equipment] ?? defaults[equipment] ?? 5
}

// ─── Core: per-set progressive overload ──────────────────────────────

function progressSet(
  lastWeight: number,
  lastReps: number,
  lastRir: number | null,
  targetRir: number,
  repFloor: number,
  repCeil: number,
  increment: number,
  crossMesocycle: boolean,
): { weight: number; reps: number; reason: string } {
  const e1rm = effectiveE1RM(lastWeight, lastReps, lastRir)

  const repsIfSameWeight = repsForWeight(e1rm, lastWeight, targetRir)
  const progressReps = Math.max(lastReps + 1, repsIfSameWeight)

  let suggestedWeight: number
  let suggestedReps: number
  let reason: string

  if (progressReps <= repCeil) {
    suggestedWeight = lastWeight
    suggestedReps = progressReps

    // Prefer weight bump if it's a smaller volume increase than +1 rep
    if (increment > 0 && increment * lastReps < lastWeight) {
      const bumpedWeight = lastWeight + increment
      const repsAtBumped = repsForWeight(e1rm, bumpedWeight, targetRir)
      if (repsAtBumped >= repFloor && repsAtBumped >= lastReps) {
        suggestedWeight = bumpedWeight
        suggestedReps = Math.max(lastReps, Math.min(repCeil, repsAtBumped))
        reason = `+${increment} lb → ${suggestedWeight} × ${suggestedReps}`
      } else {
        reason = `+1 rep → ${suggestedWeight} × ${suggestedReps}`
      }
    } else {
      reason = `+1 rep → ${suggestedWeight} × ${suggestedReps}`
    }
  } else if (crossMesocycle) {
    // Across mesocycles: reset to floor and bump weight (intentional fresh start)
    suggestedWeight = roundToIncrement(lastWeight + increment, increment)
    const repsAtNew = repsForWeight(e1rm, suggestedWeight, targetRir)
    suggestedReps = Math.max(repFloor, Math.min(repCeil, repsAtNew))
    reason = `New meso → ${suggestedWeight} × ${suggestedReps}`
  } else {
    // Within a mesocycle: keep reps high, just bump weight (no rep reset)
    suggestedWeight = roundToIncrement(lastWeight + increment, increment)
    suggestedReps = lastReps
    reason = `+${increment} lb @ ${lastReps} reps`
  }

  // Safety: never regress
  if (suggestedWeight < lastWeight) suggestedWeight = lastWeight
  if (suggestedWeight === lastWeight && suggestedReps < lastReps) suggestedReps = lastReps

  return { weight: suggestedWeight, reps: suggestedReps, reason }
}

// ─── Fetch last session's per-set data (matched by day label) ────────

interface LastSetData {
  setNumber: number
  weight: number
  reps: number
  rirAchieved: number | null
}

interface LastSessionResult {
  sets: LastSetData[]
  mesocycleId: number | null
}

async function getLastSessionSets(
  exerciseId: number,
  userId: string | undefined,
  workoutLabel: string | undefined,
): Promise<LastSessionResult> {
  const includeWithMeso = {
    session: { include: { workoutPlan: { include: { mesocycleWeek: true } } } },
  } as const

  const mapSets = (rows: Array<{
    setNumber: number; weight: number; reps: number; rirAchieved: number | null
  }>): LastSetData[] =>
    rows.sort((a, b) => a.setNumber - b.setNumber).map(s => ({
      setNumber: s.setNumber, weight: s.weight, reps: s.reps, rirAchieved: s.rirAchieved,
    }))

  // Try label-matched history first (same day slot from previous week)
  if (workoutLabel) {
    const labelSets = await prisma.loggedSet.findMany({
      where: {
        exerciseId,
        isWarmup: false,
        isSkipped: false,
        session: {
          completed: true,
          ...(userId && { userId }),
          workoutPlan: { label: workoutLabel },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: includeWithMeso,
    })

    if (labelSets.length > 0) {
      const lastSessionId = labelSets[0].sessionId
      const filtered = labelSets.filter(s => s.sessionId === lastSessionId)
      const meso = filtered[0]?.session?.workoutPlan?.mesocycleWeek?.mesocycleId ?? null
      return { sets: mapSets(filtered), mesocycleId: meso }
    }
  }

  // Fall back to any completed session with this exercise
  const allSets = await prisma.loggedSet.findMany({
    where: {
      exerciseId,
      isWarmup: false,
      isSkipped: false,
      session: {
        completed: true,
        ...(userId && { userId }),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: includeWithMeso,
  })

  if (allSets.length === 0) return { sets: [], mesocycleId: null }

  const lastSessionId = allSets[0].sessionId
  const filtered = allSets.filter(s => s.sessionId === lastSessionId)
  const meso = filtered[0]?.session?.workoutPlan?.mesocycleWeek?.mesocycleId ?? null
  return { sets: mapSets(filtered), mesocycleId: meso }
}

// ─── Multi-set prescription for one exercise ─────────────────────────

async function getMultiSetPrescription(
  exerciseId: number,
  targetRir: number,
  repRange: string,
  plannedSets: number,
  incrementOverrides: Record<string, number> | undefined,
  userId: string | undefined,
  workoutLabel: string | undefined,
  currentMesocycleId: number | null,
  seededLoad: number | null,
): Promise<{ prescriptions: SetPrescription[]; adjustedPlannedSets: number }> {
  const { sets: lastSets, mesocycleId: lastMesocycleId } = await getLastSessionSets(exerciseId, userId, workoutLabel)

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } })
  const equipment = exercise?.equipment || 'Barbell'
  const increment = getIncrement(equipment, incrementOverrides)

  const [minReps, maxReps] = repRange.split('-').map(Number)
  const repFloor = minReps || 8
  const repCeil = maxReps || 12

  // Cross-mesocycle when prior session was in a different mesocycle (or none)
  const crossMesocycle =
    currentMesocycleId !== null &&
    lastMesocycleId !== null &&
    lastMesocycleId !== currentMesocycleId

  // Seeded fresh meso: explicit deload weight overrides the cross-meso bump for week 1
  if (seededLoad && seededLoad > 0 && (lastSets.length === 0 || crossMesocycle)) {
    const prescriptions: SetPrescription[] = []
    for (let i = 0; i < plannedSets; i++) {
      prescriptions.push({
        setNumber: i + 1,
        suggestedWeight: seededLoad,
        suggestedReps: repFloor,
        lastWeight: lastSets[i]?.weight ?? 0,
        lastReps: lastSets[i]?.reps ?? 0,
        e1rm: 0,
        reason: `Deload start → ${seededLoad} × ${repFloor}`,
      })
    }
    return { prescriptions, adjustedPlannedSets: plannedSets }
  }

  if (lastSets.length === 0) return { prescriptions: [], adjustedPlannedSets: plannedSets }

  // If user did more sets than planned, adjust upward
  const adjustedPlannedSets = Math.max(plannedSets, lastSets.length)

  const prescriptions: SetPrescription[] = []

  for (let i = 0; i < adjustedPlannedSets; i++) {
    const lastSet = lastSets[i] // may be undefined for sets beyond what was logged

    if (lastSet) {
      // Progress from last session's actual per-set data
      const { weight, reps, reason } = progressSet(
        lastSet.weight, lastSet.reps, lastSet.rirAchieved,
        targetRir, repFloor, repCeil, increment, crossMesocycle,
      )

      const e1rm = effectiveE1RM(lastSet.weight, lastSet.reps, lastSet.rirAchieved)

      prescriptions.push({
        setNumber: i + 1,
        suggestedWeight: weight,
        suggestedReps: reps,
        lastWeight: lastSet.weight,
        lastReps: lastSet.reps,
        e1rm: Math.round(e1rm * 10) / 10,
        reason,
      })
    } else {
      // Extra set beyond last session — use the last known set's prescription
      const prev = prescriptions[prescriptions.length - 1]
      if (prev) {
        prescriptions.push({
          ...prev,
          setNumber: i + 1,
          lastWeight: 0,
          lastReps: 0,
          reason: `New set — match set ${i}`,
        })
      }
    }
  }

  return { prescriptions, adjustedPlannedSets }
}

// ─── Workout-level prescriptions ─────────────────────────────────────

export async function getWorkoutPrescriptions(
  workoutPlanId: number,
  userId?: string,
): Promise<ExercisePrescription[]> {
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: workoutPlanId },
    include: {
      mesocycleWeek: true,
      plannedExercises: {
        orderBy: { sortOrder: 'asc' },
        include: { exercise: true },
      },
    },
  })

  if (!plan) return []
  const currentMesocycleId = plan.mesocycleWeek?.mesocycleId ?? null

  // Load increment settings
  const settings = await prisma.setting.findMany({
    where: { ...(userId && { userId }), key: { in: ['incrementBarbell', 'incrementDumbbell', 'incrementCable'] } },
  })
  const incrementOverrides: Record<string, number> = {}
  for (const s of settings) {
    if (s.key === 'incrementBarbell') { incrementOverrides['Barbell'] = parseFloat(s.value); incrementOverrides['Smith Machine'] = parseFloat(s.value) }
    if (s.key === 'incrementDumbbell') incrementOverrides['Dumbbell'] = parseFloat(s.value)
    if (s.key === 'incrementCable') incrementOverrides['Cable'] = parseFloat(s.value)
  }

  const results: ExercisePrescription[] = []

  for (const pe of plan.plannedExercises) {
    const { prescriptions, adjustedPlannedSets } = await getMultiSetPrescription(
      pe.exerciseId,
      pe.targetRir,
      pe.repRange,
      pe.plannedSets,
      incrementOverrides,
      userId,
      plan.label ?? undefined,
      currentMesocycleId,
      pe.suggestedLoad ?? null,
    )

    results.push({
      exerciseId: pe.exerciseId,
      targetRir: pe.targetRir,
      plannedSets: pe.plannedSets,
      adjustedPlannedSets,
      prescriptions,
    })
  }

  return results
}

// ─── Legacy exports for analytics routes ─────────────────────────────

export async function getLoadRecommendation(
  exerciseId: number,
  targetRir: number = 3,
  userId?: string,
) {
  const { sets: lastSets } = await getLastSessionSets(exerciseId, userId, undefined)
  if (lastSets.length === 0) return null

  const bestSet = lastSets.reduce((best, s) =>
    s.weight * s.reps > best.weight * best.reps ? s : best
  )

  const rirSets = lastSets.filter(s => s.rirAchieved !== null)
  const lastAvgRir = rirSets.length > 0
    ? rirSets.reduce((sum, s) => sum + (s.rirAchieved || 0), 0) / rirSets.length
    : null

  const { weight, reason } = progressSet(
    bestSet.weight, bestSet.reps, bestSet.rirAchieved,
    targetRir, 8, 12, 5, true,
  )

  return {
    suggestedWeight: weight,
    reason,
    lastWeight: bestSet.weight,
    lastAvgRir: lastAvgRir ?? 0,
    targetRir,
  }
}

export async function getWeeklyVolumeAnalytics(
  fromDate?: Date,
  toDate?: Date,
  muscleGroup?: string,
  userId?: string,
) {
  const sessionFilter: Record<string, unknown> = {}
  if (userId) sessionFilter.userId = userId
  if (fromDate || toDate) {
    sessionFilter.date = {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
    }
  }
  const where: Record<string, unknown> = { isWarmup: false }
  if (Object.keys(sessionFilter).length > 0) {
    where.session = sessionFilter
  }

  const sets = await prisma.loggedSet.findMany({
    where: where as never,
    include: { exercise: true, session: true },
    orderBy: { session: { date: 'asc' } },
  })

  const weeklyVolume: Record<string, Record<string, number>> = {}
  for (const set of sets) {
    const date = new Date(set.session.date)
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - date.getDay())
    const weekKey = weekStart.toISOString().split('T')[0]
    const primaryMuscles: string[] = JSON.parse(set.exercise.primaryMuscles || '[]')
    for (const muscle of primaryMuscles) {
      if (muscleGroup && muscle !== muscleGroup) continue
      if (!weeklyVolume[weekKey]) weeklyVolume[weekKey] = {}
      weeklyVolume[weekKey][muscle] = (weeklyVolume[weekKey][muscle] || 0) + 1
    }
  }
  return weeklyVolume
}

export async function getExerciseProgress(exerciseId: number, userId?: string) {
  const sets = await prisma.loggedSet.findMany({
    where: { exerciseId, isWarmup: false, ...(userId && { session: { userId } }) },
    include: { session: true },
    orderBy: { session: { date: 'asc' } },
  })

  const sessionMap = new Map<number, typeof sets>()
  for (const set of sets) {
    const existing = sessionMap.get(set.sessionId) || []
    existing.push(set)
    sessionMap.set(set.sessionId, existing)
  }

  const progress = []
  for (const [_, sessionSets] of sessionMap) {
    const bestSet = sessionSets.reduce((best, s) =>
      s.weight * s.reps > best.weight * best.reps ? s : best
    )
    const e1rm = epley1RM(bestSet.weight, bestSet.reps)
    progress.push({
      date: sessionSets[0].session.date,
      weight: bestSet.weight,
      reps: bestSet.reps,
      e1rm: Math.round(e1rm * 10) / 10,
      totalVolume: sessionSets.reduce((sum, s) => sum + s.weight * s.reps, 0),
      sets: sessionSets.length,
    })
  }
  return progress
}
