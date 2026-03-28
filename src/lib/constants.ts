export const EQUIPMENT_TYPES = [
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Bodyweight',
  'Band',
  'Smith Machine',
] as const

export const MOVEMENT_PATTERNS = [
  'Push',
  'Pull',
  'Hinge',
  'Squat',
  'Isolation',
  'Carry',
  'Compound',
] as const

export const PRIORITY_TIERS = ['High', 'Medium', 'Low'] as const

export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Front Delts',
  'Side Delts',
  'Rear Delts',
  'Biceps',
  'Triceps',
  'Forearms',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Abs',
  'Traps',
] as const

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number]
export type PriorityTier = (typeof PRIORITY_TIERS)[number]
export type MuscleGroupName = (typeof MUSCLE_GROUPS)[number]
