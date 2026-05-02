import { Router } from 'express'
import { prisma } from '../db.js'
import { z } from 'zod/v4'
import { getWorkoutPrescriptions } from '../services/overload-engine.js'
import type { AuthRequest } from '../middleware/auth.js'

const router = Router()

const createSessionSchema = z.object({
  workoutPlanId: z.number().int().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
})

const logSetSchema = z.object({
  exerciseId: z.number().int(),
  setNumber: z.number().int().min(1),
  weight: z.number().min(0),
  reps: z.number().int().min(0),
  rirAchieved: z.number().int().min(0).max(5).optional(),
  tempo: z.string().optional(),
  isWarmup: z.boolean().default(false),
  isSkipped: z.boolean().default(false),
  notes: z.string().optional(),
})

// GET /api/sessions
router.get('/', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const { limit, offset } = req.query
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    take: limit ? parseInt(limit as string) : 50,
    skip: offset ? parseInt(offset as string) : 0,
    include: {
      workoutPlan: {
        include: { mesocycleWeek: { include: { mesocycle: true } } },
      },
      loggedSets: {
        orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
        include: { exercise: true },
      },
    },
  })

  const result = sessions.map(s => ({
    ...s,
    loggedSets: s.loggedSets.map(ls => ({
      ...ls,
      exercise: {
        ...ls.exercise,
        primaryMuscles: JSON.parse(ls.exercise.primaryMuscles || '[]'),
        secondaryMuscles: JSON.parse(ls.exercise.secondaryMuscles || '[]'),
      },
    })),
    workoutPlan: s.workoutPlan ? {
      ...s.workoutPlan,
      muscleGroups: JSON.parse(s.workoutPlan.muscleGroups || '[]'),
    } : null,
  }))

  res.json(result)
})

// GET /api/sessions/prescriptions/:workoutPlanId — auto-calculated weight/reps for a workout
router.get('/prescriptions/:workoutPlanId', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const workoutPlanId = parseInt(req.params.workoutPlanId)

  const workoutPlan = await prisma.workoutPlan.findUnique({
    where: { id: workoutPlanId },
    include: { mesocycleWeek: { include: { mesocycle: true } } },
  })
  if (!workoutPlan || !workoutPlan.mesocycleWeek || workoutPlan.mesocycleWeek.mesocycle.userId !== userId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const prescriptions = await getWorkoutPrescriptions(workoutPlanId, userId)
  res.json(prescriptions)
})

// GET /api/sessions/exercise-history/:exerciseId — last performance for load suggestions
router.get('/exercise-history/:exerciseId', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const sets = await prisma.loggedSet.findMany({
    where: {
      exerciseId: parseInt(req.params.exerciseId),
      isWarmup: false,
      session: { userId },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { session: true },
  })
  res.json(sets)
})

// GET /api/sessions/:id
router.get('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const session = await prisma.session.findUnique({
    where: { id: parseInt(req.params.id), userId },
    include: {
      workoutPlan: {
        include: {
          mesocycleWeek: { include: { mesocycle: true } },
          plannedExercises: {
            orderBy: { sortOrder: 'asc' },
            include: { exercise: true },
          },
        },
      },
      loggedSets: {
        orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
        include: { exercise: true },
      },
    },
  })

  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  res.json({
    ...session,
    loggedSets: session.loggedSets.map(ls => ({
      ...ls,
      exercise: {
        ...ls.exercise,
        primaryMuscles: JSON.parse(ls.exercise.primaryMuscles || '[]'),
        secondaryMuscles: JSON.parse(ls.exercise.secondaryMuscles || '[]'),
      },
    })),
    workoutPlan: session.workoutPlan ? {
      ...session.workoutPlan,
      muscleGroups: JSON.parse(session.workoutPlan.muscleGroups || '[]'),
      mesocycleWeek: session.workoutPlan.mesocycleWeek ? {
        ...session.workoutPlan.mesocycleWeek,
        volumePlan: JSON.parse(session.workoutPlan.mesocycleWeek.volumePlan || '{}'),
      } : null,
      plannedExercises: session.workoutPlan.plannedExercises.map(pe => ({
        ...pe,
        exercise: {
          ...pe.exercise,
          primaryMuscles: JSON.parse(pe.exercise.primaryMuscles || '[]'),
          secondaryMuscles: JSON.parse(pe.exercise.secondaryMuscles || '[]'),
        },
      })),
    } : null,
  })
})

// POST /api/sessions
router.post('/', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const parsed = createSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  // Block if there's already an in-progress session for this workout plan (scoped to user)
  if (parsed.data.workoutPlanId) {
    const inProgress = await prisma.session.findFirst({
      where: {
        userId,
        workoutPlanId: parsed.data.workoutPlanId,
        completed: false,
      },
    })
    if (inProgress) {
      res.status(409).json({
        error: 'A session is already in progress for this workout',
        existingSessionId: inProgress.id,
      })
      return
    }
  }

  const session = await prisma.session.create({
    data: {
      userId,
      workoutPlanId: parsed.data.workoutPlanId || null,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      notes: parsed.data.notes || null,
    },
  })
  res.status(201).json(session)
})

// PUT /api/sessions/:id
router.put('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const id = parseInt(req.params.id)

  const existing = await prisma.session.findUnique({ where: { id, userId } })
  if (!existing) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  const session = await prisma.session.update({
    where: { id },
    data: {
      fatigueScore: req.body.fatigueScore,
      durationMinutes: req.body.durationMinutes,
      notes: req.body.notes,
      completed: req.body.completed,
    },
  })
  res.json(session)
})

// POST /api/sessions/:id/sets — log a single set
router.post('/:id/sets', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const sessionId = parseInt(req.params.id)

  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session || session.userId !== userId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const parsed = logSetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const set = await prisma.loggedSet.create({
    data: {
      sessionId,
      ...parsed.data,
    },
    include: { exercise: true },
  })

  res.status(201).json({
    ...set,
    exercise: {
      ...set.exercise,
      primaryMuscles: JSON.parse(set.exercise.primaryMuscles || '[]'),
      secondaryMuscles: JSON.parse(set.exercise.secondaryMuscles || '[]'),
    },
  })
})

const updateSetSchema = z.object({
  weight: z.number().min(0).optional(),
  reps: z.number().int().min(0).optional(),
  rirAchieved: z.number().int().min(0).max(5).optional(),
  isWarmup: z.boolean().optional(),
  notes: z.string().optional(),
})

// PUT /api/sessions/:sessionId/sets/:setId
router.put('/:sessionId/sets/:setId', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const sessionId = parseInt(req.params.sessionId)

  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session || session.userId !== userId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const parsed = updateSetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const set = await prisma.loggedSet.update({
    where: { id: parseInt(req.params.setId) },
    data: parsed.data,
    include: { exercise: true },
  })
  res.json({
    ...set,
    exercise: {
      ...set.exercise,
      primaryMuscles: JSON.parse(set.exercise.primaryMuscles || '[]'),
      secondaryMuscles: JSON.parse(set.exercise.secondaryMuscles || '[]'),
    },
  })
})

// DELETE /api/sessions/:sessionId/sets/:setId
router.delete('/:sessionId/sets/:setId', async (req, res) => {
  const { userId } = req as unknown as AuthRequest
  const sessionId = parseInt(req.params.sessionId)

  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session || session.userId !== userId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  await prisma.loggedSet.delete({
    where: { id: parseInt(req.params.setId) },
  })
  res.status(204).send()
})

export default router
