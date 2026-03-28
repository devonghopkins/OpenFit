import { Router } from 'express'
import { prisma } from '../db.js'
import { z } from 'zod/v4'
import type { AuthRequest } from '../middleware/auth.js'

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
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest
  const groups = await prisma.muscleGroup.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  })
  res.json(groups)
})

// GET /api/muscle-groups/:id
router.get('/:id', async (req, res) => {
  const { userId } = req as AuthRequest
  const group = await prisma.muscleGroup.findUnique({
    where: { id: parseInt(req.params.id), userId },
  })
  if (!group) {
    res.status(404).json({ error: 'Muscle group not found' })
    return
  }
  res.json(group)
})

// PUT /api/muscle-groups/:id
router.put('/:id', async (req, res) => {
  const { userId } = req as AuthRequest
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }
  const group = await prisma.muscleGroup.update({
    where: { id: parseInt(req.params.id), userId },
    data: parsed.data,
  })
  res.json(group)
})

export default router
