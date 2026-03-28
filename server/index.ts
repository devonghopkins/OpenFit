import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { router } from './router.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api', router)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Only listen when running directly (not as Vercel serverless)
if (process.env.NODE_ENV !== 'production' || process.env.START_LOCAL) {
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

export default app
