import { Router } from 'express'
import { prisma } from '../db.js'
import { z } from 'zod/v4'
import { generateMesocycle } from '../services/mesocycle-generator.js'
import type { AuthRequest } from '../middleware/auth.js'

const router = Router()

function deserialize(row: Record<string, unknown>) {
  const result = { ...row }
  for (const key of ['trainingDays', 'focusMuscles']) {
    if (typeof result[key] === 'string') {
      result[key] = JSON.parse(result[key] as string)
    }
  }
  return result
}

function deserializeWeek(row: Record<string, unknown>) {
  const result = { ...row }
  if (typeof result.volumePlan === 'string') {
    result.volumePlan = JSON.parse(result.volumePlan as string)
  }
  return result
}

function deserializeWorkoutPlan(row: Record<string, unknown>) {
  const result = { ...row }
  if (typeof result.muscleGroups === 'string') {
    result.muscleGroups = JSON.parse(result.muscleGroups as string)
  }
  return result
}

const createSchema = z.object({
  name: z.string().min(1),
  weeks: z.number().int().min(2).max(8).default(4),
  trainingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 4, 5]),
  goal: z.string().default('Pure Hypertrophy'),
  focusMuscles: z.array(z.string()).default([]),
  progression: z.enum(['Conservative', 'Standard', 'Aggressive']).default('Standard'),
})

// GET /api/mesocycles
router.get('/', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const mesocycles = await prisma.mesocycle.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  res.json(mesocycles.map(m => deserialize(m as unknown as Record<string, unknown>)))
})

// GET /api/mesocycles/:id
router.get('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const mesocycle = await prisma.mesocycle.findUnique({
    where: { id: parseInt(req.params.id), userId },
    include: {
      mesocycleWeeks: {
        orderBy: { weekNumber: 'asc' },
        include: {
          workoutPlans: {
            orderBy: { dayOfWeek: 'asc' },
            include: {
              plannedExercises: {
                orderBy: { sortOrder: 'asc' },
                include: { exercise: true },
              },
              sessions: {
                select: { id: true, completed: true, date: true },
              },
            },
          },
        },
      },
    },
  })

  if (!mesocycle) {
    res.status(404).json({ error: 'Mesocycle not found' })
    return
  }

  // Deserialize JSON fields
  const result = deserialize(mesocycle as unknown as Record<string, unknown>) as Record<string, unknown>
  const weeks = mesocycle.mesocycleWeeks.map(w => {
    const week = deserializeWeek(w as unknown as Record<string, unknown>) as Record<string, unknown>
    const plans = w.workoutPlans.map(wp => {
      const plan = deserializeWorkoutPlan(wp as unknown as Record<string, unknown>) as Record<string, unknown>
      const exercises = wp.plannedExercises.map(pe => ({
        ...pe,
        exercise: {
          ...pe.exercise,
          primaryMuscles: JSON.parse(pe.exercise.primaryMuscles || '[]'),
          secondaryMuscles: JSON.parse(pe.exercise.secondaryMuscles || '[]'),
        },
      }))
      return { ...plan, plannedExercises: exercises, sessions: wp.sessions }
    })
    return { ...week, workoutPlans: plans }
  })
  result.mesocycleWeeks = weeks

  res.json(result)
})

// POST /api/mesocycles
router.post('/', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const mesocycle = await prisma.mesocycle.create({
    data: {
      userId,
      name: parsed.data.name,
      weeks: parsed.data.weeks,
      trainingDays: JSON.stringify(parsed.data.trainingDays),
      goal: parsed.data.goal,
      focusMuscles: JSON.stringify(parsed.data.focusMuscles),
      progression: parsed.data.progression,
    },
  })

  res.status(201).json(deserialize(mesocycle as unknown as Record<string, unknown>))
})

// POST /api/mesocycles/:id/generate
router.post('/:id/generate', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const mesocycle = await prisma.mesocycle.findUnique({
    where: { id: parseInt(req.params.id), userId },
  })

  if (!mesocycle) {
    res.status(404).json({ error: 'Mesocycle not found' })
    return
  }

  const trainingDays = JSON.parse(mesocycle.trainingDays || '[]')
  const focusMuscles = JSON.parse(mesocycle.focusMuscles || '[]')
  const seedFromMesocycleId =
    typeof req.body?.seedFromMesocycleId === 'number' ? req.body.seedFromMesocycleId : null

  const result = await generateMesocycle({
    mesocycleId: mesocycle.id,
    userId,
    trainingDays,
    weeks: mesocycle.weeks,
    progression: mesocycle.progression as 'Conservative' | 'Standard' | 'Aggressive',
    focusMuscles,
    seedFromMesocycleId,
  })

  res.json(result)
})

// PUT /api/mesocycles/:id
router.put('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const data: Record<string, unknown> = { ...req.body }
  if (data.trainingDays) data.trainingDays = JSON.stringify(data.trainingDays)
  if (data.focusMuscles) data.focusMuscles = JSON.stringify(data.focusMuscles)

  const mesocycle = await prisma.mesocycle.update({
    where: { id: parseInt(req.params.id), userId },
    data: data as never,
  })
  res.json(deserialize(mesocycle as unknown as Record<string, unknown>))
})

// POST /api/mesocycles/:id/complete — mark meso completed and auto-skip remaining sets
router.post('/:id/complete', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const mesocycleId = parseInt(req.params.id)

  const mesocycle = await prisma.mesocycle.findUnique({ where: { id: mesocycleId, userId } })
  if (!mesocycle) {
    res.status(404).json({ error: 'Mesocycle not found' })
    return
  }

  // Find all in-progress sessions belonging to this mesocycle
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      completed: false,
      workoutPlan: { mesocycleWeek: { mesocycleId } },
    },
    include: {
      workoutPlan: {
        include: { plannedExercises: true },
      },
      loggedSets: true,
    },
  })

  // For each in-progress session, fill in skipped sets so plannedSets is satisfied
  for (const session of sessions) {
    if (!session.workoutPlan) continue
    const setsByExercise = new Map<number, number>() // exerciseId → max setNumber logged
    for (const ls of session.loggedSets) {
      const cur = setsByExercise.get(ls.exerciseId) ?? 0
      setsByExercise.set(ls.exerciseId, Math.max(cur, ls.setNumber))
    }
    for (const pe of session.workoutPlan.plannedExercises) {
      const last = setsByExercise.get(pe.exerciseId) ?? 0
      const remaining = Math.max(pe.plannedSets - last, 0)
      for (let i = 0; i < remaining; i++) {
        await prisma.loggedSet.create({
          data: {
            sessionId: session.id,
            exerciseId: pe.exerciseId,
            setNumber: last + i + 1,
            weight: 0,
            reps: 0,
            isSkipped: true,
          },
        })
      }
    }
    await prisma.session.update({
      where: { id: session.id },
      data: { completed: true },
    })
  }

  const updated = await prisma.mesocycle.update({
    where: { id: mesocycleId },
    data: { status: 'completed' },
  })

  res.json({ ...deserialize(updated as unknown as Record<string, unknown>), sessionsClosed: sessions.length })
})

// POST /api/mesocycles/:id/activate
router.post('/:id/activate', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  // Deactivate all others for this user first
  await prisma.mesocycle.updateMany({
    where: { userId, status: 'active' },
    data: { status: 'planning' },
  })
  const mesocycle = await prisma.mesocycle.update({
    where: { id: parseInt(req.params.id), userId },
    data: { status: 'active' },
  })
  res.json(deserialize(mesocycle as unknown as Record<string, unknown>))
})

// PUT /api/mesocycles/planned-exercise/:id/swap — swap exercise in a planned exercise
router.put('/planned-exercise/:id/swap', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { exerciseId } = req.body as { exerciseId: number }
  if (!exerciseId) {
    res.status(400).json({ error: 'exerciseId is required' })
    return
  }

  const pe = await prisma.plannedExercise.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      workoutPlan: {
        include: { mesocycleWeek: { include: { mesocycle: true } } },
      },
    },
  })
  if (!pe || pe.workoutPlan.mesocycleWeek?.mesocycle.userId !== userId) {
    res.status(404).json({ error: 'Planned exercise not found' })
    return
  }

  const updated = await prisma.plannedExercise.update({
    where: { id: pe.id },
    data: { exerciseId },
    include: { exercise: true },
  })

  res.json({
    ...updated,
    exercise: {
      ...updated.exercise,
      primaryMuscles: JSON.parse(updated.exercise.primaryMuscles || '[]'),
      secondaryMuscles: JSON.parse(updated.exercise.secondaryMuscles || '[]'),
    },
  })
})

// PUT /api/mesocycles/planned-exercise/:id/swap-remaining — swap exercise for remaining weeks
router.put('/planned-exercise/:id/swap-remaining', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { exerciseId } = req.body as { exerciseId: number }
  if (!exerciseId) {
    res.status(400).json({ error: 'exerciseId is required' })
    return
  }

  const pe = await prisma.plannedExercise.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      workoutPlan: {
        include: { mesocycleWeek: { include: { mesocycle: true } } },
      },
    },
  })

  if (!pe || !pe.workoutPlan.mesocycleWeek || pe.workoutPlan.mesocycleWeek.mesocycle.userId !== userId) {
    res.status(404).json({ error: 'Planned exercise not found or not part of a mesocycle' })
    return
  }

  const { mesocycleId, weekNumber } = pe.workoutPlan.mesocycleWeek
  const { dayOfWeek } = pe.workoutPlan
  const oldExerciseId = pe.exerciseId
  const { sortOrder } = pe

  // Find all matching PlannedExercise records in current + future weeks
  const matchingPEs = await prisma.plannedExercise.findMany({
    where: {
      exerciseId: oldExerciseId,
      sortOrder,
      workoutPlan: {
        dayOfWeek,
        mesocycleWeek: {
          mesocycleId,
          weekNumber: { gte: weekNumber },
        },
      },
    },
  })

  // Update them all
  await prisma.$transaction(
    matchingPEs.map(mpe =>
      prisma.plannedExercise.update({
        where: { id: mpe.id },
        data: { exerciseId },
      })
    )
  )

  res.json({ updated: matchingPEs.length })
})

// DELETE /api/mesocycles/planned-exercise/:id — remove with optional scope
// scope: 'thisWeek' | 'remaining' | 'remainingAndFuture'
router.delete('/planned-exercise/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const scope = ((req.query.scope as string) || 'thisWeek') as
    'thisWeek' | 'remaining' | 'remainingAndFuture'

  const pe = await prisma.plannedExercise.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      workoutPlan: {
        include: { mesocycleWeek: { include: { mesocycle: true } } },
      },
    },
  })
  if (!pe || pe.workoutPlan.mesocycleWeek?.mesocycle.userId !== userId) {
    res.status(404).json({ error: 'Planned exercise not found' })
    return
  }

  let deletedCount = 1
  if (scope === 'thisWeek') {
    await prisma.plannedExercise.delete({ where: { id: pe.id } })
  } else {
    // remaining + remainingAndFuture: delete this and all matching in current+future weeks
    const { mesocycleId, weekNumber } = pe.workoutPlan.mesocycleWeek!
    const matching = await prisma.plannedExercise.findMany({
      where: {
        exerciseId: pe.exerciseId,
        workoutPlan: {
          label: pe.workoutPlan.label,
          mesocycleWeek: { mesocycleId, weekNumber: { gte: weekNumber } },
        },
      },
      select: { id: true },
    })
    await prisma.plannedExercise.deleteMany({
      where: { id: { in: matching.map(m => m.id) } },
    })
    deletedCount = matching.length

    if (scope === 'remainingAndFuture') {
      // Mark the exercise as excluded for this user, so future mesocycles won't pick it
      await prisma.userExerciseOverride.upsert({
        where: { userId_exerciseId: { userId, exerciseId: pe.exerciseId } },
        update: { isExcluded: true },
        create: { userId, exerciseId: pe.exerciseId, isExcluded: true },
      })
    }
  }

  res.json({ deleted: deletedCount, scope })
})

// PUT /api/mesocycles/workout-plan/:planId/reorder — reorder exercises in a workout plan
router.put('/workout-plan/:planId/reorder', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { exerciseOrder } = req.body as { exerciseOrder: number[] }
  if (!exerciseOrder || !Array.isArray(exerciseOrder)) {
    res.status(400).json({ error: 'exerciseOrder array is required' })
    return
  }

  // Verify the workout plan belongs to a mesocycle owned by the user
  const workoutPlan = await prisma.workoutPlan.findUnique({
    where: { id: parseInt(req.params.planId) },
    include: { mesocycleWeek: { include: { mesocycle: true } } },
  })
  if (!workoutPlan || workoutPlan.mesocycleWeek?.mesocycle.userId !== userId) {
    res.status(404).json({ error: 'Workout plan not found' })
    return
  }

  await prisma.$transaction(
    exerciseOrder.map((peId, index) =>
      prisma.plannedExercise.update({
        where: { id: peId },
        data: { sortOrder: index },
      })
    )
  )

  res.json({ success: true })
})

// ─── Add exercise to a workout plan ──────────────────────────────────

// POST /api/mesocycles/workout-plan/:planId/exercises
router.post('/workout-plan/:planId/exercises', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { exerciseId, plannedSets = 3, repRange = '8-12', targetRir = 3 } = req.body as {
    exerciseId: number; plannedSets?: number; repRange?: string; targetRir?: number
  }

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: parseInt(req.params.planId) },
    include: {
      mesocycleWeek: { include: { mesocycle: true } },
      plannedExercises: { orderBy: { sortOrder: 'desc' }, take: 1 },
    },
  })
  if (!plan || plan.mesocycleWeek?.mesocycle.userId !== userId) {
    res.status(404).json({ error: 'Workout plan not found' })
    return
  }

  const maxSort = plan.plannedExercises[0]?.sortOrder ?? -1

  const pe = await prisma.plannedExercise.create({
    data: { workoutPlanId: plan.id, exerciseId, plannedSets, repRange, targetRir, sortOrder: maxSort + 1 },
    include: { exercise: true },
  })

  res.status(201).json(pe)
})

// POST /api/mesocycles/workout-plan/:planId/exercises/propagate — add to this + future weeks
router.post('/workout-plan/:planId/exercises/propagate', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { exerciseId, plannedSets = 3, repRange = '8-12', targetRir = 3 } = req.body as {
    exerciseId: number; plannedSets?: number; repRange?: string; targetRir?: number
  }

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: parseInt(req.params.planId) },
    include: {
      mesocycleWeek: { include: { mesocycle: true } },
      plannedExercises: { orderBy: { sortOrder: 'desc' }, take: 1 },
    },
  })
  if (!plan || !plan.mesocycleWeek || plan.mesocycleWeek.mesocycle.userId !== userId) {
    res.status(404).json({ error: 'Workout plan not found' })
    return
  }

  const { mesocycleId, weekNumber } = plan.mesocycleWeek

  // Find all matching workout plans (same label, current + future weeks)
  const matchingPlans = await prisma.workoutPlan.findMany({
    where: {
      label: plan.label,
      mesocycleWeek: { mesocycleId, weekNumber: { gte: weekNumber } },
    },
    include: { plannedExercises: { orderBy: { sortOrder: 'desc' }, take: 1 } },
  })

  let count = 0
  for (const mp of matchingPlans) {
    const maxSort = mp.plannedExercises[0]?.sortOrder ?? -1
    await prisma.plannedExercise.create({
      data: { workoutPlanId: mp.id, exerciseId, plannedSets, repRange, targetRir, sortOrder: maxSort + 1 },
    })
    count++
  }

  res.json({ added: count })
})

// ─── Reorder with propagation ────────────────────────────────────────

// PUT /api/mesocycles/workout-plan/:planId/reorder-remaining
router.put('/workout-plan/:planId/reorder-remaining', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { exerciseOrder } = req.body as { exerciseOrder: number[] }
  if (!exerciseOrder || !Array.isArray(exerciseOrder)) {
    res.status(400).json({ error: 'exerciseOrder array is required' })
    return
  }

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: parseInt(req.params.planId) },
    include: {
      mesocycleWeek: { include: { mesocycle: true } },
      plannedExercises: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!plan || !plan.mesocycleWeek || plan.mesocycleWeek.mesocycle.userId !== userId) {
    res.status(404).json({ error: 'Workout plan not found' })
    return
  }

  // Apply reorder to current plan
  await prisma.$transaction(
    exerciseOrder.map((peId, index) =>
      prisma.plannedExercise.update({ where: { id: peId }, data: { sortOrder: index } })
    )
  )

  // Build exerciseId → sortOrder mapping from the new order
  const currentPEs = plan.plannedExercises
  const peMap = new Map(currentPEs.map(pe => [pe.id, pe]))
  const newOrderMap = new Map<number, number>() // exerciseId → new sortOrder
  for (let i = 0; i < exerciseOrder.length; i++) {
    const pe = peMap.get(exerciseOrder[i])
    if (pe) newOrderMap.set(pe.exerciseId, i)
  }

  const { mesocycleId, weekNumber } = plan.mesocycleWeek

  // Find future matching plans and apply same exercise order
  const futurePlans = await prisma.workoutPlan.findMany({
    where: {
      label: plan.label,
      mesocycleWeek: { mesocycleId, weekNumber: { gt: weekNumber } },
    },
    include: { plannedExercises: true },
  })

  for (const fp of futurePlans) {
    const updates = fp.plannedExercises
      .filter(pe => newOrderMap.has(pe.exerciseId))
      .map(pe =>
        prisma.plannedExercise.update({
          where: { id: pe.id },
          data: { sortOrder: newOrderMap.get(pe.exerciseId)! },
        })
      )
    if (updates.length > 0) await prisma.$transaction(updates)
  }

  res.json({ success: true })
})

// ─── Exercise notes (with propagation across mesocycle) ──────────────

// PUT /api/mesocycles/planned-exercise/:id/notes
router.put('/planned-exercise/:id/notes', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { notes, propagate = true } = req.body as { notes: string; propagate?: boolean }

  const pe = await prisma.plannedExercise.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { workoutPlan: { include: { mesocycleWeek: { include: { mesocycle: true } } } } },
  })
  if (!pe || pe.workoutPlan.mesocycleWeek?.mesocycle.userId !== userId) {
    res.status(404).json({ error: 'Planned exercise not found' })
    return
  }

  // Update this exercise's notes
  await prisma.plannedExercise.update({ where: { id: pe.id }, data: { notes } })

  if (propagate && pe.workoutPlan.mesocycleWeek) {
    const { mesocycleId, weekNumber } = pe.workoutPlan.mesocycleWeek

    // Update same exercise in same day-label for future weeks
    const matchingPEs = await prisma.plannedExercise.findMany({
      where: {
        exerciseId: pe.exerciseId,
        workoutPlan: {
          label: pe.workoutPlan.label,
          mesocycleWeek: { mesocycleId, weekNumber: { gt: weekNumber } },
        },
      },
    })

    if (matchingPEs.length > 0) {
      await prisma.$transaction(
        matchingPEs.map(mpe =>
          prisma.plannedExercise.update({ where: { id: mpe.id }, data: { notes } })
        )
      )
    }
  }

  res.json({ success: true })
})

// DELETE /api/mesocycles/:id
router.delete('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  await prisma.mesocycle.delete({
    where: { id: parseInt(req.params.id), userId },
  })
  res.status(204).send()
})

export default router
