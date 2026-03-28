import { Router } from 'express'
import { prisma } from '../db.js'
import { z } from 'zod/v4'

const router = Router()

const updateSchema = z.object({
  mev: z.number().int().min(0).optional(),
  mav: z.number().int().min(0).optional(),
  mrv: z.number().int().min(0).optional(),
  defaultFrequency: z.number().int().min(1).max(6).optional(),
  priorityTier: z.enum(['High', 'Medium', 'Low']).optional(),
  injured: z.boolean().optional(),
})

// GET /api/muscle-groups
router.get('/', async (_req, res) => {
  const groups = await prisma.muscleGroup.findMany({
    orderBy: { name: 'asc' },
  })
  res.json(groups)
})

// GET /api/muscle-groups/:id
router.get('/:id', async (req, res) => {
  const group = await prisma.muscleGroup.findUnique({
    where: { id: parseInt(req.params.id) },
  })
  if (!group) {
    res.status(404).json({ error: 'Muscle group not found' })
    return
  }
  res.json(group)
})

// PUT /api/muscle-groups/:id
router.put('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }
  const group = await prisma.muscleGroup.update({
    where: { id: parseInt(req.params.id) },
    data: parsed.data,
  })
  res.json(group)
})

export default router
