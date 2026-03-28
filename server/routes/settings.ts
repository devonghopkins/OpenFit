import { Router } from 'express'
import { prisma } from '../db.js'
import type { AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /api/settings
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest
  const settings = await prisma.setting.findMany({ where: { userId } })
  const map: Record<string, string> = {}
  for (const s of settings) {
    map[s.key] = s.value
  }
  res.json(map)
})

// PUT /api/settings
router.put('/', async (req, res) => {
  const { userId } = req as AuthRequest
  const updates = req.body as Record<string, string>
  for (const [key, value] of Object.entries(updates)) {
    await prisma.setting.upsert({
      where: { userId_key: { userId, key } },
      update: { value: String(value) },
      create: { userId, key, value: String(value) },
    })
  }
  const settings = await prisma.setting.findMany({ where: { userId } })
  const map: Record<string, string> = {}
  for (const s of settings) {
    map[s.key] = s.value
  }
  res.json(map)
})

// GET /api/export — full data export as JSON
router.get('/export', async (req, res) => {
  const { userId } = req as AuthRequest
  const [muscleGroups, exercises, mesocycles, sessions, bodyMetrics, settings] = await Promise.all([
    prisma.muscleGroup.findMany({ where: { userId } }),
    prisma.exercise.findMany(),
    prisma.mesocycle.findMany({ where: { userId }, include: { mesocycleWeeks: { include: { workoutPlans: { include: { plannedExercises: true } } } } } }),
    prisma.session.findMany({ where: { userId }, include: { loggedSets: true } }),
    prisma.bodyMetric.findMany({ where: { userId } }),
    prisma.setting.findMany({ where: { userId } }),
  ])

  res.json({
    exportedAt: new Date().toISOString(),
    muscleGroups,
    exercises,
    mesocycles,
    sessions,
    bodyMetrics,
    settings,
  })
})

// POST /api/body-metrics
router.post('/body-metrics', async (req, res) => {
  const { userId } = req as AuthRequest
  const metric = await prisma.bodyMetric.create({
    data: {
      userId,
      bodyweight: req.body.bodyweight || null,
      measurements: JSON.stringify(req.body.measurements || {}),
      notes: req.body.notes || null,
      date: req.body.date ? new Date(req.body.date) : new Date(),
    },
  })
  res.status(201).json(metric)
})

// GET /api/body-metrics
router.get('/body-metrics', async (req, res) => {
  const { userId } = req as AuthRequest
  const metrics = await prisma.bodyMetric.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    take: 100,
  })
  res.json(metrics.map(m => ({
    ...m,
    measurements: JSON.parse(m.measurements || '{}'),
  })))
})

// POST /api/backup — create a database backup
router.post('/backup', async (_req, res) => {
  const fs = await import('fs')
  const path = await import('path')
  const dbPath = path.resolve(process.cwd(), 'prisma/dev.db')
  const backupDir = path.resolve(process.cwd(), 'backups')

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.resolve(backupDir, `backup-${timestamp}.db`)

  fs.copyFileSync(dbPath, backupPath)
  res.json({ message: 'Backup created', path: backupPath })
})

export default router
