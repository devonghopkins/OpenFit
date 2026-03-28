import { Router } from 'express'
import { prisma } from '../db.js'
import { z } from 'zod/v4'
import type { AuthRequest } from '../middleware/auth.js'

const router = Router()

const exerciseSchema = z.object({
  name: z.string().min(1),
  primaryMuscles: z.array(z.string()).default([]),
  secondaryMuscles: z.array(z.string()).default([]),
  equipment: z.string().default('Barbell'),
  movementPattern: z.string().default('Push'),
  jointStress: z.record(z.string(), z.string()).default({}),
  defaultRepRange: z.string().default('8-12'),
  sfrRating: z.number().min(1).max(5).default(3),
  notes: z.string().optional(),
  isFavorite: z.boolean().default(false),
  isExcluded: z.boolean().default(false),
  substitutions: z.array(z.string()).default([]),
})

function serializeExercise(data: z.infer<typeof exerciseSchema>) {
  return {
    ...data,
    primaryMuscles: JSON.stringify(data.primaryMuscles),
    secondaryMuscles: JSON.stringify(data.secondaryMuscles),
    jointStress: JSON.stringify(data.jointStress),
    substitutions: JSON.stringify(data.substitutions),
  }
}

function deserializeExercise(row: Record<string, unknown>) {
  return {
    ...row,
    primaryMuscles: JSON.parse(row.primaryMuscles as string || '[]'),
    secondaryMuscles: JSON.parse(row.secondaryMuscles as string || '[]'),
    jointStress: JSON.parse(row.jointStress as string || '{}'),
    substitutions: JSON.parse(row.substitutions as string || '[]'),
  }
}

// GET /api/exercises
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest
  const { search, muscle, equipment, movement, favorites } = req.query

  const where: Record<string, unknown> = {}

  if (search) {
    where.name = { contains: search as string }
  }
  if (equipment) {
    where.equipment = equipment as string
  }
  if (movement) {
    where.movementPattern = movement as string
  }

  // Fetch exercises and user overrides in parallel
  const [exercises, overrides] = await Promise.all([
    prisma.exercise.findMany({
      where: where as never,
      orderBy: { name: 'asc' },
    }),
    prisma.userExerciseOverride.findMany({
      where: { userId },
    }),
  ])

  const overrideMap = new Map(overrides.map(o => [o.exerciseId, o]))

  let result = exercises.map(e => {
    const override = overrideMap.get(e.id)
    return {
      ...deserializeExercise(e as unknown as Record<string, unknown>),
      isFavorite: override?.isFavorite ?? false,
      isExcluded: override?.isExcluded ?? false,
    }
  })

  // Filter favorites via override data
  if (favorites === 'true') {
    result = result.filter(e => e.isFavorite)
  }

  // Filter by muscle group in application layer (JSON field)
  if (muscle) {
    const muscleFilter = (muscle as string).toLowerCase()
    result = result.filter((e: Record<string, unknown>) => {
      const primary = e.primaryMuscles as string[]
      const secondary = e.secondaryMuscles as string[]
      return (
        primary.some((m: string) => m.toLowerCase().includes(muscleFilter)) ||
        secondary.some((m: string) => m.toLowerCase().includes(muscleFilter))
      )
    })
  }

  res.json(result)
})

// GET /api/exercises/:id
router.get('/:id', async (req, res) => {
  const exercise = await prisma.exercise.findUnique({
    where: { id: parseInt(req.params.id) },
  })
  if (!exercise) {
    res.status(404).json({ error: 'Exercise not found' })
    return
  }
  res.json(deserializeExercise(exercise as unknown as Record<string, unknown>))
})

// POST /api/exercises
router.post('/', async (req, res) => {
  const parsed = exerciseSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }
  const exercise = await prisma.exercise.create({
    data: serializeExercise(parsed.data),
  })
  res.status(201).json(deserializeExercise(exercise as unknown as Record<string, unknown>))
})

// PUT /api/exercises/:id/favorite — upsert isFavorite/isExcluded into UserExerciseOverride
router.put('/:id/favorite', async (req, res) => {
  const { userId } = req as AuthRequest
  const exerciseId = parseInt(req.params.id)
  const { isFavorite, isExcluded } = req.body as { isFavorite?: boolean; isExcluded?: boolean }

  const override = await prisma.userExerciseOverride.upsert({
    where: { userId_exerciseId: { userId, exerciseId } },
    update: {
      ...(isFavorite !== undefined ? { isFavorite } : {}),
      ...(isExcluded !== undefined ? { isExcluded } : {}),
    },
    create: {
      userId,
      exerciseId,
      isFavorite: isFavorite ?? false,
      isExcluded: isExcluded ?? false,
    },
  })
  res.json(override)
})

// PUT /api/exercises/:id
router.put('/:id', async (req, res) => {
  const parsed = exerciseSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  // isFavorite/isExcluded are per-user and live in UserExerciseOverride — strip them here
  const { isFavorite: _fav, isExcluded: _excl, ...exerciseFields } = parsed.data

  const data: Record<string, unknown> = { ...exerciseFields }
  if (exerciseFields.primaryMuscles) data.primaryMuscles = JSON.stringify(exerciseFields.primaryMuscles)
  if (exerciseFields.secondaryMuscles) data.secondaryMuscles = JSON.stringify(exerciseFields.secondaryMuscles)
  if (exerciseFields.jointStress) data.jointStress = JSON.stringify(exerciseFields.jointStress)
  if (exerciseFields.substitutions) data.substitutions = JSON.stringify(exerciseFields.substitutions)

  const exercise = await prisma.exercise.update({
    where: { id: parseInt(req.params.id) },
    data: data as never,
  })
  res.json(deserializeExercise(exercise as unknown as Record<string, unknown>))
})

// DELETE /api/exercises/:id
router.delete('/:id', async (req, res) => {
  await prisma.exercise.delete({
    where: { id: parseInt(req.params.id) },
  })
  res.status(204).send()
})

export default router
