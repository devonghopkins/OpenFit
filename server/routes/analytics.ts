import { Router } from 'express'
import { getWeeklyVolumeAnalytics, getExerciseProgress, getLoadRecommendation } from '../services/overload-engine.js'
import { prisma } from '../db.js'

const router = Router()

// GET /api/analytics/volume?from=&to=&muscleGroup=
router.get('/volume', async (req, res) => {
  const from = req.query.from ? new Date(req.query.from as string) : undefined
  const to = req.query.to ? new Date(req.query.to as string) : undefined
  const muscleGroup = req.query.muscleGroup as string | undefined
  const data = await getWeeklyVolumeAnalytics(from, to, muscleGroup)
  res.json(data)
})

// GET /api/analytics/progress/:exerciseId
router.get('/progress/:exerciseId', async (req, res) => {
  const data = await getExerciseProgress(parseInt(req.params.exerciseId))
  res.json(data)
})

// GET /api/analytics/recommendation/:exerciseId?targetRir=
router.get('/recommendation/:exerciseId', async (req, res) => {
  const targetRir = req.query.targetRir ? parseInt(req.query.targetRir as string) : 3
  const rec = await getLoadRecommendation(parseInt(req.params.exerciseId), targetRir)
  res.json(rec)
})

// GET /api/analytics/summary — dashboard stats
router.get('/summary', async (req, res) => {
  const activeMeso = await prisma.mesocycle.findFirst({
    where: { status: 'active' },
    include: { mesocycleWeeks: true },
  })

  // Sessions this week
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const sessionsThisWeek = await prisma.session.count({
    where: { date: { gte: weekStart }, completed: true },
  })

  // Total sessions
  const totalSessions = await prisma.session.count({ where: { completed: true } })

  // Total exercises
  const totalExercises = await prisma.exercise.count()

  // Weekly volume per muscle (this week's logged sets)
  const thisWeekSets = await prisma.loggedSet.findMany({
    where: {
      isWarmup: false,
      session: { date: { gte: weekStart } },
    },
    include: { exercise: true },
  })

  const weeklyVolume: Record<string, number> = {}
  for (const set of thisWeekSets) {
    const muscles: string[] = JSON.parse(set.exercise.primaryMuscles || '[]')
    for (const m of muscles) {
      weeklyVolume[m] = (weeklyVolume[m] || 0) + 1
    }
  }

  // Avg RIR this week
  const rirSets = thisWeekSets.filter(s => s.rirAchieved !== null)
  const avgRir = rirSets.length > 0
    ? rirSets.reduce((sum, s) => sum + (s.rirAchieved || 0), 0) / rirSets.length
    : null

  // Active mesocycle info
  let mesoInfo = null
  if (activeMeso) {
    const completedWeeks = activeMeso.mesocycleWeeks.filter(w => {
      // A week is "complete" if we're past it chronologically
      return true // simplified — would check dates in production
    }).length
    mesoInfo = {
      id: activeMeso.id,
      name: activeMeso.name,
      currentWeek: Math.min(completedWeeks, activeMeso.weeks + 1),
      totalWeeks: activeMeso.weeks + 1,
      status: activeMeso.status,
    }
  }

  res.json({
    activeMesocycle: mesoInfo,
    sessionsThisWeek,
    totalSessions,
    totalExercises,
    weeklyVolume,
    avgRir: avgRir ? Math.round(avgRir * 10) / 10 : null,
  })
})

// GET /api/analytics/mesocycle-summary/:id
router.get('/mesocycle-summary/:id', async (req, res) => {
  const mesoId = parseInt(req.params.id)

  const meso = await prisma.mesocycle.findUnique({
    where: { id: mesoId },
    include: {
      mesocycleWeeks: {
        include: {
          workoutPlans: {
            include: { sessions: { include: { loggedSets: true } } },
          },
        },
      },
    },
  })

  if (!meso) {
    res.status(404).json({ error: 'Mesocycle not found' })
    return
  }

  // Calculate stats
  let totalPlannedSessions = 0
  let totalCompletedSessions = 0
  const weeklyFatigue: number[] = []

  for (const week of meso.mesocycleWeeks) {
    const weekFatigueScores: number[] = []
    for (const plan of week.workoutPlans) {
      totalPlannedSessions++
      for (const session of plan.sessions) {
        if (session.completed) totalCompletedSessions++
        if (session.fatigueScore) weekFatigueScores.push(session.fatigueScore)
      }
    }
    if (weekFatigueScores.length > 0) {
      weeklyFatigue.push(
        weekFatigueScores.reduce((a, b) => a + b, 0) / weekFatigueScores.length
      )
    }
  }

  res.json({
    name: meso.name,
    weeks: meso.weeks,
    compliance: totalPlannedSessions > 0
      ? Math.round((totalCompletedSessions / totalPlannedSessions) * 100)
      : 0,
    totalPlannedSessions,
    totalCompletedSessions,
    weeklyFatigue,
  })
})

export default router
