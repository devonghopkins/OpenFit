import { prisma } from '../db.js'

interface SetPrescription {
  suggestedWeight: number
  suggestedReps: number
  lastWeight: number
  lastReps: number
  lastAvgRir: number | null
  e1rm: number
  reason: string
}

export interface ExercisePrescription {
  exerciseId: number
  targetRir: number
  plannedSets: number
  prescription: SetPrescription | null
}

/**
 * Calculate E1RM using Epley formula: weight × (1 + reps/30)
 */
function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/**
 * Calculate E1RM accounting for RIR — estimates reps to failure.
 * If you did 10 reps at RIR 3, effective reps to failure ≈ 13.
 */
function effectiveE1RM(weight: number, reps: number, rir: number | null): number {
  const repsToFailure = reps + (rir ?? 0)
  return epley1RM(weight, repsToFailure)
}

/**
 * Given an E1RM, target RIR, and a weight, calculate how many reps you should get.
 * repsAtFailure = 30 × (E1RM / weight - 1)
 * targetReps = repsAtFailure - targetRIR
 */
function repsForWeight(e1rm: number, weight: number, targetRir: number): number {
  if (weight <= 0 || e1rm <= 0) return 0
  const repsAtFailure = 30 * (e1rm / weight - 1)
  return Math.max(1, Math.round(repsAtFailure - targetRir))
}

/**
 * Round weight to nearest increment for equipment type
 */
function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return Math.round(weight)
  return Math.round(weight / increment) * increment
}

/**
 * Get prescription for a single exercise based on history and target RIR.
 * Uses E1RM math to auto-calculate weight and reps.
 */
export async function getExercisePrescription(
  exerciseId: number,
  targetRir: number,
  repRange: string = '8-12',
  incrementOverrides?: Record<string, number>,
  userId?: string,
): Promise<SetPrescription | null> {
  // Get recent working sets for this exercise
  const recentSets = await prisma.loggedSet.findMany({
    where: { exerciseId, isWarmup: false, ...(userId && { session: { userId } }) },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { session: true },
  })

  if (recentSets.length === 0) return null

  // Get the most recent completed session's sets
  const completedSets = recentSets.filter(s => s.session.completed)
  if (completedSets.length === 0) return null

  const lastSessionId = completedSets[0].sessionId
  const lastSessionSets = completedSets.filter(s => s.sessionId === lastSessionId)

  // Use the best set from last session for E1RM calculation
  const bestSet = lastSessionSets.reduce((best, s) =>
    s.weight * s.reps > best.weight * best.reps ? s : best
  )

  const lastWeight = bestSet.weight
  const lastReps = bestSet.reps

  // Average RIR from last session (if recorded)
  const rirSets = lastSessionSets.filter(s => s.rirAchieved !== null)
  const lastAvgRir = rirSets.length > 0
    ? rirSets.reduce((sum, s) => sum + (s.rirAchieved || 0), 0) / rirSets.length
    : null

  // Use RIR-adjusted E1RM for accurate strength estimation
  const e1rm = effectiveE1RM(lastWeight, lastReps, lastAvgRir)

  // Get exercise equipment for increment rounding
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } })
  const equipment = exercise?.equipment || 'Barbell'

  // Default increments
  const defaultIncrements: Record<string, number> = {
    Barbell: 5, 'Smith Machine': 5, Dumbbell: 5,
    Cable: 5, Machine: 5, Bodyweight: 0, Band: 0,
  }

  // Apply overrides from settings
  const increment = incrementOverrides?.[equipment] ?? defaultIncrements[equipment] ?? 5

  // Parse rep range
  const [minReps, maxReps] = repRange.split('-').map(Number)
  const repFloor = minReps || 8
  const repCeil = maxReps || 12

  let suggestedWeight: number
  let suggestedReps: number
  let reason: string

  // Core progressive overload logic:
  // 1. Try adding 1 rep at the same weight
  // 2. If already at top of rep range, bump weight and reset to bottom of range
  // 3. If a weight bump is a smaller increase than +1 rep, prefer the weight bump
  // 4. NEVER suggest less than what was done last session

  const repsIfSameWeight = repsForWeight(e1rm, lastWeight, targetRir)
  const progressReps = Math.max(lastReps + 1, repsIfSameWeight)

  if (progressReps <= repCeil) {
    // Still room in rep range — add reps at same weight
    suggestedWeight = lastWeight
    suggestedReps = progressReps

    // Check: would a small weight bump be less total-volume increase than +1 rep?
    // Volume of +1 rep = lastWeight × 1 = lastWeight
    // Volume of +weight at same reps = increment × lastReps
    if (increment > 0 && increment * lastReps < lastWeight) {
      const bumpedWeight = lastWeight + increment
      const repsAtBumped = repsForWeight(e1rm, bumpedWeight, targetRir)
      if (repsAtBumped >= repFloor && repsAtBumped >= lastReps) {
        suggestedWeight = bumpedWeight
        suggestedReps = Math.max(lastReps, Math.min(repCeil, repsAtBumped))
        reason = `+${increment} lb (smaller jump than +1 rep) → ${suggestedWeight} × ${suggestedReps}`
      } else {
        reason = `+1 rep → ${suggestedWeight} × ${suggestedReps} @ RIR ${targetRir}`
      }
    } else {
      reason = `+1 rep → ${suggestedWeight} × ${suggestedReps} @ RIR ${targetRir}`
    }
  } else {
    // Hit top of rep range — bump weight, reset to bottom of range
    suggestedWeight = roundToIncrement(lastWeight + increment, increment)
    const repsAtNewWeight = repsForWeight(e1rm, suggestedWeight, targetRir)
    suggestedReps = Math.max(repFloor, Math.min(repCeil, repsAtNewWeight))
    reason = `Top of range — increase to ${suggestedWeight} × ${suggestedReps}`
  }

  // Safety: NEVER go below last session's performance
  if (suggestedWeight < lastWeight) suggestedWeight = lastWeight
  if (suggestedWeight === lastWeight && suggestedReps < lastReps) suggestedReps = lastReps

  return {
    suggestedWeight,
    suggestedReps,
    lastWeight,
    lastReps,
    lastAvgRir,
    e1rm: Math.round(e1rm * 10) / 10,
    reason,
  }
}

/**
 * Get prescriptions for all exercises in a workout plan.
 */
export async function getWorkoutPrescriptions(
  workoutPlanId: number,
  userId?: string,
): Promise<ExercisePrescription[]> {
  const plan = await prisma.workoutPlan.findUnique({
    where: { id: workoutPlanId },
    include: {
      plannedExercises: {
        orderBy: { sortOrder: 'asc' },
        include: { exercise: true },
      },
    },
  })

  if (!plan) return []

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

  const prescriptions: ExercisePrescription[] = []

  for (const pe of plan.plannedExercises) {
    const prescription = await getExercisePrescription(
      pe.exerciseId,
      pe.targetRir,
      pe.repRange,
      incrementOverrides,
      userId,
    )
    prescriptions.push({
      exerciseId: pe.exerciseId,
      targetRir: pe.targetRir,
      plannedSets: pe.plannedSets,
      prescription,
    })
  }

  return prescriptions
}

// ─── Legacy exports kept for analytics routes ─────────────────────────

export async function getLoadRecommendation(
  exerciseId: number,
  targetRir: number = 3,
  userId?: string,
) {
  const rx = await getExercisePrescription(exerciseId, targetRir, '8-12', undefined, userId)
  if (!rx) return null
  return {
    suggestedWeight: rx.suggestedWeight,
    reason: rx.reason,
    lastWeight: rx.lastWeight,
    lastAvgRir: rx.lastAvgRir ?? 0,
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
