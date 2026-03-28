import { prisma } from '../db.js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface MuscleGroupSeed {
  name: string
  mev: number
  mav: number
  mrv: number
  defaultFrequency: number
  priorityTier: string
}

const DEFAULT_SETTINGS = [
  { key: 'units', value: 'lb' },
  { key: 'theme', value: 'dark' },
  { key: 'restTimerCompound', value: '120' },
  { key: 'restTimerIsolation', value: '90' },
  { key: 'incrementBarbell', value: '5' },
  { key: 'incrementDumbbell', value: '2.5' },
  { key: 'incrementCable', value: '5' },
]

/**
 * Called on first login — provisions default muscle groups and settings for a new user.
 * Safe to call multiple times (uses upsert).
 */
export async function ensureUserSetup(userId: string) {
  // Check if user already has muscle groups
  const existing = await prisma.muscleGroup.count({ where: { userId } })
  if (existing > 0) return // Already set up

  const muscleGroupsRaw = readFileSync(
    resolve(__dirname, '../../server/seed-data/muscle-groups.json'),
    'utf-8'
  )
  const muscleGroups: MuscleGroupSeed[] = JSON.parse(muscleGroupsRaw)

  // Seed muscle groups for this user
  for (const mg of muscleGroups) {
    await prisma.muscleGroup.upsert({
      where: { userId_name: { userId, name: mg.name } },
      update: {},
      create: {
        userId,
        name: mg.name,
        mev: mg.mev,
        mav: mg.mav,
        mrv: mg.mrv,
        defaultFrequency: mg.defaultFrequency,
        priorityTier: mg.priorityTier,
      },
    })
  }

  // Seed default settings for this user
  for (const s of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { userId_key: { userId, key: s.key } },
      update: {},
      create: { userId, key: s.key, value: s.value },
    })
  }
}
