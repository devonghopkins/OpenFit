// Hardcoded mesocycle templates. Users select one at creation time and the
// generator builds the plan from this structure instead of auto-selecting
// from split templates. Exercise names must match seeded Exercise.name
// (alternativeNames are tried in order if primary isn't found).

export interface TemplateExercise {
  exerciseName: string
  alternativeNames?: string[]
  plannedSets: number
  repRange: string
}

export interface TemplateDay {
  dayOfWeek: number // 0=Sun..6=Sat
  label: string
  muscleGroups: string[] // display-only summary
  exercises: TemplateExercise[]
}

export interface MesocycleTemplate {
  id: string
  name: string
  description: string
  days: TemplateDay[]
}

export const MESOCYCLE_TEMPLATES: MesocycleTemplate[] = [
  {
    id: 'devon-5day-split',
    name: "Devon's 5-Day Split",
    description: 'Mon Quads+Biceps · Tue Chest+Tris · Wed Back+Bis+Delts · Fri Posterior · Sat Upper+Bis',
    days: [
      {
        dayOfWeek: 1, // Mon
        label: 'Legs (Quad bias) + Biceps',
        muscleGroups: ['Quads', 'Hamstrings', 'Calves', 'Abs', 'Biceps'],
        exercises: [
          { exerciseName: 'Hack Squat', plannedSets: 3, repRange: '8-12' },
          { exerciseName: 'Leg Extension', plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Seated Leg Curl', plannedSets: 2, repRange: '10-15' },
          { exerciseName: 'Standing Calf Raise', plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Hanging Leg Raise', plannedSets: 2, repRange: '10-15' },
          { exerciseName: 'Incline Dumbbell Curl', plannedSets: 3, repRange: '10-15' },
        ],
      },
      {
        dayOfWeek: 2, // Tue
        label: 'Chest + Triceps',
        muscleGroups: ['Chest', 'Triceps'],
        exercises: [
          { exerciseName: 'Machine Incline Press', plannedSets: 3, repRange: '8-12' },
          { exerciseName: 'Machine Chest Press', alternativeNames: ['Smith Machine Incline Press', 'Dumbbell Bench Press'], plannedSets: 3, repRange: '8-12' },
          { exerciseName: 'Pec Deck Machine', alternativeNames: ['Cable Fly'], plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Cable Overhead Tricep Extension', plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Cable Pushdown', plannedSets: 2, repRange: '10-15' },
        ],
      },
      {
        dayOfWeek: 3, // Wed
        label: 'Back + Biceps + Rear/Side Delts',
        muscleGroups: ['Back', 'Biceps', 'Rear Delts', 'Side Delts'],
        exercises: [
          { exerciseName: 'Lat Pulldown', alternativeNames: ['Lat Pulldown (Normal Grip)', 'Close Grip Lat Pulldown'], plannedSets: 3, repRange: '8-12' },
          { exerciseName: 'Chest Supported Machine Row', plannedSets: 3, repRange: '8-12' },
          { exerciseName: 'Single Arm Cable Row', plannedSets: 2, repRange: '10-15' },
          { exerciseName: 'Face Pull', alternativeNames: ['Reverse Pec Deck'], plannedSets: 3, repRange: '12-15' },
          { exerciseName: 'Dumbbell Lateral Raise', plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Bayesian Cable Curl', plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Barbell Curl', alternativeNames: ['EZ Bar Curl'], plannedSets: 2, repRange: '8-12' },
        ],
      },
      {
        dayOfWeek: 5, // Fri
        label: 'Legs (Posterior chain bias)',
        muscleGroups: ['Hamstrings', 'Glutes', 'Calves', 'Abs'],
        exercises: [
          { exerciseName: 'Machine Hip Thrust', alternativeNames: ['Barbell Hip Thrust'], plannedSets: 3, repRange: '8-12' },
          { exerciseName: 'Dumbbell Romanian Deadlift', alternativeNames: ['Single Leg Romanian Deadlift'], plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Machine Hip Abduction', plannedSets: 2, repRange: '12-20' },
          { exerciseName: 'Seated Calf Raise', plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Cable Crunch', plannedSets: 2, repRange: '10-15' },
        ],
      },
      {
        dayOfWeek: 6, // Sat
        label: 'Upper Body + Biceps',
        muscleGroups: ['Front Delts', 'Side Delts', 'Rear Delts', 'Chest', 'Back', 'Biceps'],
        exercises: [
          { exerciseName: 'Machine Shoulder Press', plannedSets: 3, repRange: '8-12' },
          { exerciseName: 'Push-Up', alternativeNames: ['Dumbbell Bench Press'], plannedSets: 2, repRange: '10-15' },
          { exerciseName: 'Lat Pulldown', alternativeNames: ['Dumbbell Pullover'], plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Cable Cross Body Lateral Raise', plannedSets: 3, repRange: '10-15' },
          { exerciseName: 'Cable Reverse Fly', plannedSets: 2, repRange: '12-15' },
          { exerciseName: 'Freemotion Curl (Facing Away)', plannedSets: 3, repRange: '10-15' },
        ],
      },
    ],
  },
]

export function getTemplate(id: string): MesocycleTemplate | null {
  return MESOCYCLE_TEMPLATES.find(t => t.id === id) ?? null
}
