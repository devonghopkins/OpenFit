import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

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
  substitutions: string[]
}

async function main() {
  console.log('Seeding database...')

  // Seed exercises (global, no userId)
  const exercisesRaw = readFileSync(
    resolve(__dirname, '../server/seed-data/exercises.json'),
    'utf-8'
  )
  const exercises: ExerciseSeed[] = JSON.parse(exercisesRaw)

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { name: ex.name },
      update: {
        primaryMuscles: JSON.stringify(ex.primaryMuscles),
        secondaryMuscles: JSON.stringify(ex.secondaryMuscles),
        equipment: ex.equipment,
        movementPattern: ex.movementPattern,
        jointStress: JSON.stringify(ex.jointStress),
        defaultRepRange: ex.defaultRepRange,
        sfrRating: ex.sfrRating,
        notes: ex.notes ?? null,
        substitutions: JSON.stringify(ex.substitutions),
      },
      create: {
        name: ex.name,
        primaryMuscles: JSON.stringify(ex.primaryMuscles),
        secondaryMuscles: JSON.stringify(ex.secondaryMuscles),
        equipment: ex.equipment,
        movementPattern: ex.movementPattern,
        jointStress: JSON.stringify(ex.jointStress),
        defaultRepRange: ex.defaultRepRange,
        sfrRating: ex.sfrRating,
        notes: ex.notes ?? null,
        substitutions: JSON.stringify(ex.substitutions),
        isSeeded: true,
      },
    })
  }
  console.log(`✓ Seeded ${exercises.length} exercises`)

  // Note: MuscleGroups, Settings are now per-user — they get created
  // automatically via the API when a user first logs in (see server/routes/muscle-groups.ts)
  console.log('✓ Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
