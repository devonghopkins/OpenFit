import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

interface MuscleGroupSeed {
  name: string
  mev: number
  mav: number
  mrv: number
  defaultFrequency: number
  priorityTier: string
}

interface ExerciseSeed {
  name: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string
  movementPattern: string
  jointStress: Record<string, string>
  defaultRepRange: string
  sfrRating: number
  notes: string | null
  isFavorite: boolean
  isExcluded: boolean
  substitutions: string[]
}

async function main() {
  console.log('Seeding database...')

  // Seed muscle groups
  const muscleGroupsRaw = readFileSync(
    resolve(__dirname, '../server/seed-data/muscle-groups.json'),
    'utf-8'
  )
  const muscleGroups: MuscleGroupSeed[] = JSON.parse(muscleGroupsRaw)

  for (const mg of muscleGroups) {
    await prisma.muscleGroup.upsert({
      where: { name: mg.name },
      update: {},
      create: mg,
    })
  }
  console.log(`Seeded ${muscleGroups.length} muscle groups`)

  // Seed exercises
  const exercisesRaw = readFileSync(
    resolve(__dirname, '../server/seed-data/exercises.json'),
    'utf-8'
  )
  const exercises: ExerciseSeed[] = JSON.parse(exercisesRaw)

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { name: ex.name },
      update: {},
      create: {
        name: ex.name,
        primaryMuscles: JSON.stringify(ex.primaryMuscles),
        secondaryMuscles: JSON.stringify(ex.secondaryMuscles),
        equipment: ex.equipment,
        movementPattern: ex.movementPattern,
        jointStress: JSON.stringify(ex.jointStress),
        defaultRepRange: ex.defaultRepRange,
        sfrRating: ex.sfrRating,
        notes: ex.notes,
        isFavorite: ex.isFavorite,
        isExcluded: ex.isExcluded,
        substitutions: JSON.stringify(ex.substitutions),
      },
    })
  }
  console.log(`Seeded ${exercises.length} exercises`)

  // Seed default settings
  const defaults = [
    { key: 'units', value: 'lb' },
    { key: 'theme', value: 'dark' },
    { key: 'restTimerCompound', value: '120' },
    { key: 'restTimerIsolation', value: '90' },
    { key: 'incrementBarbell', value: '5' },
    { key: 'incrementDumbbell', value: '2.5' },
    { key: 'incrementCable', value: '5' },
  ]

  for (const s of defaults) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    })
  }
  console.log(`Seeded ${defaults.length} default settings`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
