import { Router } from 'express'
import exercisesRouter from './routes/exercises.js'
import muscleGroupsRouter from './routes/muscle-groups.js'
import mesocyclesRouter from './routes/mesocycles.js'
import sessionsRouter from './routes/sessions.js'
import analyticsRouter from './routes/analytics.js'
import settingsRouter from './routes/settings.js'

export const router = Router()

router.use('/exercises', exercisesRouter)
router.use('/muscle-groups', muscleGroupsRouter)
router.use('/mesocycles', mesocyclesRouter)
router.use('/sessions', sessionsRouter)
router.use('/analytics', analyticsRouter)
router.use('/settings', settingsRouter)
