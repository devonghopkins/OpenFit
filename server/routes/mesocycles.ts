import { Router } from 'express'
import { prisma } from '../db.js'
import { z } from 'zod/v4'
import { generateMesocycle } from '../services/mesocycle-generator.js'

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
router.get('/', async (_req, res) => {
  const mesocycles = await prisma.mesocycle.findMany({
    orderBy: { createdAt: 'desc' },
  })
  res.json(mesocycles.map(m => deserialize(m as unknown as Record<string, unknown>)))
})

// GET /api/mesocycles/:id
router.get('/:id', async (req, res) => {
  const mesocycle = await prisma.mesocycle.findUnique({
    where: { id: parseInt(req.params.id) },
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
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const mesocycle = await prisma.mesocycle.create({
    data: {
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
  const mesocycle = await prisma.mesocycle.findUnique({
    where: { id: parseInt(req.params.id) },
  })

  if (!mesocycle) {
    res.status(404).json({ error: 'Mesocycle not found' })
    return
  }

  const trainingDays = JSON.parse(mesocycle.trainingDays || '[]')
  const focusMuscles = JSON.parse(mesocycle.focusMuscles || '[]')

  const result = await generateMesocycle({
    mesocycleId: mesocycle.id,
    trainingDays,
    weeks: mesocycle.weeks,
    progression: mesocycle.progression as 'Conservative' | 'Standard' | 'Aggressive',
    focusMuscles,
  })

  res.json(result)
})

// PUT /api/mesocycles/:id
router.put('/:id', async (req, res) => {
  const data: Record<string, unknown> = { ...req.body }
  if (data.trainingDays) data.trainingDays = JSON.stringify(data.trainingDays)
  if (data.focusMuscles) data.focusMuscles = JSON.stringify(data.focusMuscles)

  const mesocycle = await prisma.mesocycle.update({
    where: { id: parseInt(req.params.id) },
    data: data as never,
  })
  res.json(deserialize(mesocycle as unknown as Record<string, unknown>))
})

// POST /api/mesocycles/:id/activate
router.post('/:id/activate', async (req, res) => {
  // Deactivate all others first
  await prisma.mesocycle.updateMany({
    where: { status: 'active' },
    data: { status: 'planning' },
  })
  const mesocycle = await prisma.mesocycle.update({
    where: { id: parseInt(req.params.id) },
    data: { status: 'active' },
  })
  res.json(deserialize(mesocycle as unknown as Record<string, unknown>))
})

// PUT /api/mesocycles/planned-exercise/:id/swap — swap exercise in a planned exercise
router.put('/planned-exercise/:id/swap', async (req, res) => {
  const { exerciseId } = req.body as { exerciseId: number }
  if (!exerciseId) {
    res.status(400).json({ error: 'exerciseId is required' })
    return
  }

  const pe = await prisma.plannedExercise.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!pe) {
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
  const { exerciseId } = req.body as { exerciseId: number }
  if (!exerciseId) {
    res.status(400).json({ error: 'exerciseId is required' })
    return
  }

  const pe = await prisma.plannedExercise.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      workoutPlan: {
        include: { mesocycleWeek: true },
      },
    },
  })

  if (!pe || !pe.workoutPlan.mesocycleWeek) {
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

// PUT /api/mesocycles/workout-plan/:planId/reorder — reorder exercises in a workout plan
router.put('/workout-plan/:planId/reorder', async (req, res) => {
  const { exerciseOrder } = req.body as { exerciseOrder: number[] }
  if (!exerciseOrder || !Array.isArray(exerciseOrder)) {
    res.status(400).json({ error: 'exerciseOrder array is required' })
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

// DELETE /api/mesocycles/:id
router.delete('/:id', async (req, res) => {
  await prisma.mesocycle.delete({
    where: { id: parseInt(req.params.id) },
  })
  res.status(204).send()
})

export default router
