import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import type { McpRequestContext } from '@modelcontextprotocol/server'
import * as z from 'zod'
import type { McpCaller } from './auth.js'
import { MESOCYCLE_TEMPLATES } from '../services/mesocycle-templates.js'

// Tools call this app's own REST API with the caller's token, so every read and
// write goes through the same ownership checks and logic as the app itself.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Settings keys for the advisor's free-text context (also editable in the app)
export const GOALS_KEY = 'advisorGoals'
export const CONDITION_KEY = 'advisorCondition'

class ApiError extends Error {}

function makeApi(caller: McpCaller) {
  return async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await fetch(`${caller.apiBase}/api${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${caller.token}`, 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError((data as { error?: string }).error || `HTTP ${res.status}`)
    return data as T
  }
}

// Compact JSON: tool results go into Claude's context, so whitespace is wasted tokens
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })
const fail = (err: unknown) => ({
  content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
  isError: true,
})

// ─── API shapes (only the fields the tools use) ──────────────────────

interface PlannedExercise {
  id: number; exerciseId: number; plannedSets: number; repRange: string; targetRir: number
  notes: string | null; exercise: { name: string; equipment: string; primaryMuscles: string[]; isPT?: boolean }
}
interface WorkoutPlan {
  id: number; dayOfWeek: number; label: string | null; muscleGroups: string[]
  plannedExercises: PlannedExercise[]; sessions?: Array<{ id: number; completed: boolean; date: string }>
}
interface Mesocycle {
  id: number; name: string; status: string; weeks: number; progression: string; goal: string
  trainingDays: number[]; focusMuscles: string[]; startDate: string | null
  mesocycleWeeks?: Array<{ weekNumber: number; isDeload: boolean; volumePlan: Record<string, number>; workoutPlans: WorkoutPlan[] }>
}
interface LoggedSet {
  exerciseId: number; setNumber: number; weight: number; reps: number; rirAchieved: number | null
  isWarmup: boolean; isSkipped: boolean; notes: string | null; exercise: { name: string; isPT?: boolean }
}
interface Session {
  id: number; date: string; completed: boolean; durationMinutes: number | null; fatigueScore: number | null
  notes: string | null; loggedSets: LoggedSet[]
  workoutPlan: { id: number; label: string | null; mesocycleWeek?: { weekNumber: number; mesocycle?: { name: string } } } | null
}
interface MuscleGroup {
  name: string; mev: number; mav: number; mrv: number; priorityTier: string; injured: boolean; defaultFrequency: number
}
interface Exercise {
  id: number; name: string; equipment: string; movementPattern: string; primaryMuscles: string[]
  secondaryMuscles: string[]; defaultRepRange: string; sfrRating: number; isFavorite: boolean; isExcluded: boolean; notes: string | null
  isPT: boolean; isSeeded: boolean
}

const EQUIPMENT = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Band', 'Smith Machine'] as const
const MUSCLES = [
  'Chest', 'Back', 'Front Delts', 'Side Delts', 'Rear Delts', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Traps',
] as const

/** How a set reads: "185×8", PT "red band×15" / "BW×12" */
function formatSet(set: LoggedSet) {
  if (set.isSkipped) return 'skipped'
  if (set.exercise.isPT) {
    const load = set.notes || (set.weight > 0 ? String(set.weight) : 'BW')
    return `${load}×${set.reps}`
  }
  return `${set.weight}×${set.reps}${set.rirAchieved != null ? ` @RIR${set.rirAchieved}` : ''}`
}

function planStatus(plan: WorkoutPlan) {
  const sessions = plan.sessions || []
  if (sessions.some(s => s.completed)) return 'done'
  if (sessions.length) return 'in progress'
  return 'upcoming'
}

function summarizeProgram(meso: Mesocycle, onlyWeek?: number) {
  return {
    programId: meso.id,
    name: meso.name,
    status: meso.status,
    workingWeeks: meso.weeks,
    progression: meso.progression,
    trainingDays: meso.trainingDays.map(d => DAYS[d]),
    focusMuscles: meso.focusMuscles,
    weeks: (meso.mesocycleWeeks || []).filter(w => !onlyWeek || w.weekNumber === onlyWeek).map(w => ({
      week: w.weekNumber,
      deload: w.isDeload,
      plannedSetsPerMuscle: w.volumePlan,
      workouts: w.workoutPlans.map(p => ({
        workoutPlanId: p.id,
        day: DAYS[p.dayOfWeek],
        label: p.label,
        status: planStatus(p),
        exercises: p.plannedExercises.map(pe => ({
          plannedExerciseId: pe.id,
          exerciseId: pe.exerciseId,
          name: pe.exercise.name,
          plan: pe.exercise.isPT ? `${pe.plannedSets}×${pe.repRange}` : `${pe.plannedSets}×${pe.repRange} @RIR${pe.targetRir}`,
          ...(pe.exercise.isPT ? { pt: true } : {}),
          ...(pe.notes ? { note: pe.notes } : {}),
        })),
      })),
    })),
  }
}

/** One line per exercise, e.g. "Hack Squat: 250×10, 250×9, skipped" */
function summarizeSession(s: Session) {
  const byExercise = new Map<string, string[]>()
  for (const set of [...s.loggedSets].sort((a, b) => a.setNumber - b.setNumber)) {
    if (set.isWarmup) continue
    const list = byExercise.get(set.exercise.name) || []
    list.push(formatSet(set))
    byExercise.set(set.exercise.name, list)
  }
  return {
    sessionId: s.id,
    date: s.date.slice(0, 10),
    workout: s.workoutPlan?.label ?? 'Freeform',
    ...(s.workoutPlan?.mesocycleWeek ? { programWeek: s.workoutPlan.mesocycleWeek.weekNumber } : {}),
    finished: s.completed,
    ...(s.durationMinutes ? { minutes: s.durationMinutes } : {}),
    ...(s.fatigueScore ? { feeling: ['', 'crushed', 'tired', 'neutral', 'good', 'great'][s.fatigueScore] } : {}),
    ...(s.notes ? { notes: s.notes } : {}),
    sets: Object.fromEntries(byExercise),
  }
}

const scopeTwo = z.enum(['this_week', 'remaining_weeks']).default('this_week')
  .describe('this_week = only this workout; remaining_weeks = this workout and the same day in every later week of the program')

const annotationsRead = { readOnlyHint: true, openWorldHint: false }
const annotationsWrite = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

function buildServer(caller: McpCaller) {
  const api = makeApi(caller)
  const server = new McpServer(
    { name: 'openfit', version: '1.0.0' },
    {
      instructions:
        "OpenFit is the user's hypertrophy training app: mesocycle programs (blocks of weeks ending in a deload), " +
        'workouts per training day, and logged sets. Start with get_training_overview. Weights are in pounds. ' +
        'Volume landmarks per muscle: MEV (minimum effective), MAV (maximum adaptive), MRV (maximum recoverable) weekly sets. ' +
        'Exercises marked pt are physical-therapy / mobility work: logged as sets × reps (band color or bodyweight), ' +
        'kept at a fixed set count, and never counted in per-muscle volume. ' +
        'Before changing the program, explain the change and why; make changes only when the user asks or agrees.',
    },
  )

  // ── Reads ────────────────────────────────────────────────────────────

  server.registerTool('get_training_overview', {
    title: 'Training overview',
    description:
      "Start here. The user's written goals and current condition, the active program with progress and the next workout, " +
      "this week's completed sets per muscle, and a list of all programs.",
    annotations: annotationsRead,
  }, async () => {
    try {
      const [settings, programs, summary] = await Promise.all([
        api<Record<string, string>>('/settings'),
        api<Mesocycle[]>('/mesocycles'),
        api<{ sessionsThisWeek: number; totalSessions: number; weeklyVolume: Record<string, number> }>('/analytics/summary'),
      ])
      const active = programs.find(p => p.status === 'active')
      let activeProgram: unknown = null
      if (active) {
        const meso = await api<Mesocycle>(`/mesocycles/${active.id}`)
        const plans = (meso.mesocycleWeeks || []).flatMap(w => w.workoutPlans.map(p => ({ week: w.weekNumber, p })))
        const next = plans.find(x => planStatus(x.p) === 'in progress') || plans.find(x => planStatus(x.p) === 'upcoming')
        activeProgram = {
          programId: meso.id,
          name: meso.name,
          progression: meso.progression,
          workingWeeks: meso.weeks,
          workoutsDone: plans.filter(x => planStatus(x.p) === 'done').length,
          workoutsTotal: plans.length,
          nextWorkout: next ? { week: next.week, day: DAYS[next.p.dayOfWeek], label: next.p.label, workoutPlanId: next.p.id, status: planStatus(next.p) } : null,
        }
      }
      return json({
        goals: settings[GOALS_KEY] || '(none written yet — ask the user, then save with update_goals_and_condition)',
        currentCondition: settings[CONDITION_KEY] || '(none written yet)',
        units: settings.units || 'lb',
        activeProgram,
        thisWeek: { workoutsFinished: summary.sessionsThisWeek, setsPerMuscle: summary.weeklyVolume },
        allTimeWorkouts: summary.totalSessions,
        programs: programs.map(p => ({ programId: p.id, name: p.name, status: p.status, weeks: p.weeks })),
      })
    } catch (err) { return fail(err) }
  })

  server.registerTool('get_program', {
    title: 'Program details',
    description:
      'Full plan for a program: every week, workout and planned exercise (sets × reps @ target RIR), with planned sets per muscle per week ' +
      'and whether each workout is done. IDs here are what the editing tools take. Defaults to the active program.',
    inputSchema: z.object({
      program_id: z.number().int().optional().describe('From get_training_overview; omit for the active program'),
      week: z.number().int().min(1).optional().describe('Only this week (smaller result); omit for all weeks'),
    }),
    annotations: annotationsRead,
  }, async ({ program_id, week }) => {
    try {
      let id = program_id
      if (!id) {
        const programs = await api<Mesocycle[]>('/mesocycles')
        id = programs.find(p => p.status === 'active')?.id
        if (!id) return json({ message: 'No active program. Pass program_id from get_training_overview.' })
      }
      return json(summarizeProgram(await api<Mesocycle>(`/mesocycles/${id}`), week))
    } catch (err) { return fail(err) }
  })

  server.registerTool('get_recent_workouts', {
    title: 'Recent workouts',
    description: 'Logged workouts, newest first: each exercise\'s sets as weight×reps, skipped sets, duration and how the user felt.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(40).default(10) }),
    annotations: annotationsRead,
  }, async ({ limit }) => {
    try {
      const sessions = await api<Session[]>(`/sessions?limit=${limit}`)
      return json(sessions.map(summarizeSession))
    } catch (err) { return fail(err) }
  })

  server.registerTool('get_exercise_progress', {
    title: 'Exercise progress',
    description: 'Per-session best set, estimated 1RM, total volume and set count for one exercise over time. Use to spot stalls.',
    inputSchema: z.object({ exercise_id: z.number().int().describe('exerciseId from get_program or find_exercises') }),
    annotations: annotationsRead,
  }, async ({ exercise_id }) => {
    try {
      const progress = await api<Array<{ date: string; weight: number; reps: number; e1rm: number; totalVolume: number; sets: number }>>(
        `/analytics/progress/${exercise_id}`,
      )
      return json(progress.filter(p => p.e1rm > 0).map(p => ({ date: String(p.date).slice(0, 10), best: `${p.weight}×${p.reps}`, e1rm: p.e1rm, volume: p.totalVolume, sets: p.sets })))
    } catch (err) { return fail(err) }
  })

  server.registerTool('get_workout_targets', {
    title: 'Planned weights for a workout',
    description: "The app's planned weight × reps for each set of a workout, worked out from the last time the user did it.",
    inputSchema: z.object({ workout_plan_id: z.number().int() }),
    annotations: annotationsRead,
  }, async ({ workout_plan_id }) => {
    try {
      const rx = await api<Array<{ exerciseId: number; plannedSets: number; prescriptions: Array<{ setNumber: number; suggestedWeight: number; suggestedReps: number; reason: string }> }>>(
        `/sessions/prescriptions/${workout_plan_id}`,
      )
      return json(rx.map(r => ({
        exerciseId: r.exerciseId,
        sets: r.prescriptions.map(p => `${p.suggestedWeight}×${p.suggestedReps} (${p.reason})`),
      })))
    } catch (err) { return fail(err) }
  })

  server.registerTool('get_muscle_landmarks', {
    title: 'Muscle volume landmarks',
    description: 'Per muscle: MEV/MAV/MRV weekly set landmarks, priority, default weekly frequency, and whether it is marked injured.',
    annotations: annotationsRead,
  }, async () => {
    try {
      const groups = await api<MuscleGroup[]>('/muscle-groups')
      return json(groups.map(g => ({ muscle: g.name, mev: g.mev, mav: g.mav, mrv: g.mrv, priority: g.priorityTier, perWeek: g.defaultFrequency, ...(g.injured ? { injured: true } : {}) })))
    } catch (err) { return fail(err) }
  })

  server.registerTool('find_exercises', {
    title: 'Find exercises',
    description:
      "Search the user's exercise library (for swaps or additions). Returns exerciseId, equipment, muscles, stimulus-to-fatigue rating (SFR 1–5), " +
      'favorites, and pt for physical-therapy / mobility moves. If nothing fits, create it with create_exercise.',
    inputSchema: z.object({
      muscle: z.string().optional().describe('Primary or secondary muscle, e.g. "Side Delts", "Quads"'),
      equipment: z.string().optional().describe('e.g. Barbell, Dumbbell, Cable, Machine, Bodyweight, Band'),
      search: z.string().optional().describe('Part of the exercise name, any case, e.g. "curl", "leg press"'),
      pt: z.boolean().optional().describe('true = only PT / mobility exercises; false = only training exercises; omit for both'),
    }),
    annotations: annotationsRead,
  }, async ({ muscle, equipment, search, pt }) => {
    try {
      const q = new URLSearchParams()
      if (muscle) q.set('muscle', muscle)
      if (equipment) q.set('equipment', equipment)
      if (search) q.set('search', search)
      if (pt !== undefined) q.set('pt', String(pt))
      const list = await api<Exercise[]>(`/exercises?${q}`)
      return json(list
        .filter(e => !e.isExcluded)
        .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.sfrRating - a.sfrRating)
        .slice(0, 60)
        .map(e => ({
          exerciseId: e.id, name: e.name, equipment: e.equipment, primary: e.primaryMuscles, secondary: e.secondaryMuscles,
          reps: e.defaultRepRange, sfr: e.sfrRating, ...(e.isFavorite ? { favorite: true } : {}),
          ...(e.isPT ? { pt: true } : {}), ...(!e.isSeeded ? { custom: true } : {}),
        })))
    } catch (err) { return fail(err) }
  })

  // ── Writes ───────────────────────────────────────────────────────────

  server.registerTool('update_goals_and_condition', {
    title: 'Save goals and condition',
    description: "Save the user's training goals and/or current condition (sleep, soreness, injuries, schedule, equipment). Replaces the existing text for each field given.",
    inputSchema: z.object({
      goals: z.string().max(4000).optional(),
      condition: z.string().max(4000).optional(),
    }),
    annotations: { ...annotationsWrite, idempotentHint: true },
  }, async ({ goals, condition }) => {
    try {
      const body: Record<string, string> = {}
      if (goals !== undefined) body[GOALS_KEY] = goals
      if (condition !== undefined) body[CONDITION_KEY] = condition
      if (!Object.keys(body).length) return fail('Nothing to save')
      await api('/settings', { method: 'PUT', body })
      return json({ saved: Object.keys(body) })
    } catch (err) { return fail(err) }
  })

  server.registerTool('create_exercise', {
    title: 'Create an exercise',
    description:
      "Add a custom exercise to the user's library when find_exercises has nothing suitable, e.g. a PT move like " +
      '"Band External Rotation". Then add it to workouts with add_exercise. Check find_exercises first: names must be unique. ' +
      'Set pt: true for physical-therapy / mobility work so it stays out of hypertrophy volume and is never auto-progressed.',
    inputSchema: z.object({
      name: z.string().min(2).max(80),
      equipment: z.enum(EQUIPMENT).default('Bodyweight'),
      muscle: z.enum(MUSCLES).optional().describe('Main muscle worked; optional for PT moves'),
      secondary_muscles: z.array(z.enum(MUSCLES)).max(4).default([]),
      pt: z.boolean().default(false).describe('Physical-therapy / mobility exercise'),
      rep_range: z.string().regex(/^\d{1,2}-\d{1,2}$/).optional().describe('Usual reps, e.g. "12-15"; default 12-15 for PT, 8-12 otherwise'),
      notes: z.string().max(300).optional().describe('Cues shown with the exercise, e.g. "Elbow pinned to side, slow on the way back"'),
    }),
    annotations: annotationsWrite,
  }, async ({ name, equipment, muscle, secondary_muscles, pt, rep_range, notes }) => {
    try {
      const created = await api<Exercise>('/exercises', {
        method: 'POST',
        body: {
          name,
          equipment,
          primaryMuscles: muscle ? [muscle] : [],
          secondaryMuscles: secondary_muscles,
          movementPattern: pt ? 'Mobility' : 'Isolation',
          defaultRepRange: rep_range ?? (pt ? '12-15' : '8-12'),
          isPT: pt,
          ...(notes ? { notes } : {}),
        },
      })
      return json({
        created: true, exerciseId: created.id, name: created.name, equipment: created.equipment,
        primary: created.primaryMuscles, reps: created.defaultRepRange, ...(created.isPT ? { pt: true } : {}),
      })
    } catch (err) { return fail(err) }
  })

  server.registerTool('swap_exercise', {
    title: 'Swap an exercise',
    description: 'Replace a planned exercise with another from the library.',
    inputSchema: z.object({
      planned_exercise_id: z.number().int(),
      new_exercise_id: z.number().int(),
      scope: scopeTwo,
    }),
    annotations: annotationsWrite,
  }, async ({ planned_exercise_id, new_exercise_id, scope }) => {
    try {
      const path = scope === 'remaining_weeks' ? 'swap-remaining' : 'swap'
      await api(`/mesocycles/planned-exercise/${planned_exercise_id}/${path}`, { method: 'PUT', body: { exerciseId: new_exercise_id } })
      return json({ swapped: true, scope })
    } catch (err) { return fail(err) }
  })

  server.registerTool('add_exercise', {
    title: 'Add an exercise to a workout',
    description: 'Add an exercise to the end of a workout.',
    inputSchema: z.object({
      workout_plan_id: z.number().int(),
      exercise_id: z.number().int(),
      sets: z.number().int().min(1).max(10).default(3),
      rep_range: z.string().regex(/^\d+-\d+$/).optional().describe('e.g. "8-12"; defaults to the exercise\'s usual range'),
      target_rir: z.number().int().min(0).max(5).optional(),
      scope: scopeTwo,
    }),
    annotations: annotationsWrite,
  }, async ({ workout_plan_id, exercise_id, sets, rep_range, target_rir, scope }) => {
    try {
      const path = scope === 'remaining_weeks' ? 'exercises/propagate' : 'exercises'
      await api(`/mesocycles/workout-plan/${workout_plan_id}/${path}`, {
        method: 'POST',
        body: { exerciseId: exercise_id, plannedSets: sets, repRange: rep_range, targetRir: target_rir },
      })
      return json({ added: true, scope })
    } catch (err) { return fail(err) }
  })

  server.registerTool('remove_exercise', {
    title: 'Remove an exercise',
    description: 'Remove a planned exercise. remaining_and_future also excludes it from programs generated later.',
    inputSchema: z.object({
      planned_exercise_id: z.number().int(),
      scope: z.enum(['this_week', 'remaining_weeks', 'remaining_and_future']).default('this_week'),
    }),
    annotations: { ...annotationsWrite, destructiveHint: true },
  }, async ({ planned_exercise_id, scope }) => {
    try {
      const apiScope = { this_week: 'thisWeek', remaining_weeks: 'remaining', remaining_and_future: 'remainingAndFuture' }[scope]
      await api(`/mesocycles/planned-exercise/${planned_exercise_id}?scope=${apiScope}`, { method: 'DELETE' })
      return json({ removed: true, scope })
    } catch (err) { return fail(err) }
  })

  server.registerTool('set_planned_sets', {
    title: 'Change set count',
    description: 'Change how many sets are planned for an exercise.',
    inputSchema: z.object({
      planned_exercise_id: z.number().int(),
      sets: z.number().int().min(0).max(20),
      scope: scopeTwo,
    }),
    annotations: { ...annotationsWrite, idempotentHint: true },
  }, async ({ planned_exercise_id, sets, scope }) => {
    try {
      await api(`/mesocycles/planned-exercise/${planned_exercise_id}/sets`, {
        method: 'PUT',
        body: { plannedSets: sets, scope: scope === 'remaining_weeks' ? 'remaining' : 'thisWeek' },
      })
      return json({ updated: true, sets, scope })
    } catch (err) { return fail(err) }
  })

  server.registerTool('set_exercise_note', {
    title: 'Set an exercise note',
    description: 'Set the coaching note shown under an exercise during workouts (applies to this and remaining weeks). Empty string clears it.',
    inputSchema: z.object({ planned_exercise_id: z.number().int(), note: z.string().max(300) }),
    annotations: { ...annotationsWrite, idempotentHint: true },
  }, async ({ planned_exercise_id, note }) => {
    try {
      await api(`/mesocycles/planned-exercise/${planned_exercise_id}/notes`, { method: 'PUT', body: { notes: note } })
      return json({ updated: true })
    } catch (err) { return fail(err) }
  })

  server.registerTool('edit_planned_exercise', {
    title: 'Change rep range or target RIR',
    description: 'Change the rep range and/or target RIR (reps in reserve) of a planned exercise. The app plans weights from these, so they shape progression.',
    inputSchema: z.object({
      planned_exercise_id: z.number().int(),
      rep_range: z.string().regex(/^\d{1,2}-\d{1,2}$/).optional().describe('e.g. "6-10"'),
      target_rir: z.number().int().min(0).max(5).optional(),
      scope: scopeTwo,
    }),
    annotations: { ...annotationsWrite, idempotentHint: true },
  }, async ({ planned_exercise_id, rep_range, target_rir, scope }) => {
    try {
      const result = await api<{ updated: number }>(`/mesocycles/planned-exercise/${planned_exercise_id}/targets`, {
        method: 'PUT',
        body: { repRange: rep_range, targetRir: target_rir, scope: scope === 'remaining_weeks' ? 'remaining' : 'thisWeek' },
      })
      return json({ updated: result.updated, scope })
    } catch (err) { return fail(err) }
  })

  server.registerTool('reorder_exercises', {
    title: 'Reorder a workout',
    description: "Set the exercise order of a workout. List every plannedExerciseId of that workout exactly once, first exercise first (get them from get_program).",
    inputSchema: z.object({
      workout_plan_id: z.number().int(),
      planned_exercise_ids: z.array(z.number().int()).min(1),
      scope: scopeTwo,
    }),
    annotations: { ...annotationsWrite, idempotentHint: true },
  }, async ({ workout_plan_id, planned_exercise_ids, scope }) => {
    try {
      const path = scope === 'remaining_weeks' ? 'reorder-remaining' : 'reorder'
      await api(`/mesocycles/workout-plan/${workout_plan_id}/${path}`, { method: 'PUT', body: { exerciseOrder: planned_exercise_ids } })
      return json({ reordered: true, scope })
    } catch (err) { return fail(err) }
  })

  server.registerTool('create_program', {
    title: 'Create a program',
    description:
      'Create and generate a new program (mesocycle): working weeks plus an automatic deload week. The app picks exercises and starting weights ' +
      '(or uses a template / copies a past program), then you can tailor it with swap_exercise, add_exercise, remove_exercise, set_planned_sets, ' +
      'edit_planned_exercise and reorder_exercises. It is created in "planning" status and does not replace the active program; the user activates it in the app. ' +
      `Templates: ${MESOCYCLE_TEMPLATES.map(t => `"${t.id}" (${t.name}: ${t.description})`).join('; ') || 'none'}.`,
    inputSchema: z.object({
      name: z.string().min(1).max(80),
      working_weeks: z.number().int().min(2).max(8).default(4),
      training_days: z.array(z.enum(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])).min(3).optional()
        .describe('Ignored when template_id is given (the template sets the days). Default Mon, Tue, Thu, Fri.'),
      progression: z.enum(['Conservative', 'Standard', 'Aggressive']).default('Standard')
        .describe('How fast weekly sets rise: Conservative +1 set/week, Standard +1-2, Aggressive +2'),
      focus_muscles: z.array(z.string()).default([]).describe('Muscles to start at higher volume, e.g. ["Side Delts", "Chest"]'),
      copy_from_program_id: z.number().int().optional().describe('Reuse that program\'s exercise choices and start near its peak weights'),
      template_id: z.string().optional(),
    }),
    annotations: annotationsWrite,
  }, async ({ name, working_weeks, training_days, progression, focus_muscles, copy_from_program_id, template_id }) => {
    try {
      const template = template_id ? MESOCYCLE_TEMPLATES.find(t => t.id === template_id) : undefined
      if (template_id && !template) return fail(`Unknown template_id "${template_id}"`)
      const days = template
        ? Array.from(new Set(template.days.map(d => d.dayOfWeek))).sort()
        : (training_days ?? ['Mon', 'Tue', 'Thu', 'Fri']).map(d => DAYS.indexOf(d)).sort()
      const created = await api<{ id: number }>('/mesocycles', {
        method: 'POST',
        body: { name, weeks: working_weeks, trainingDays: days, progression, focusMuscles: focus_muscles },
      })
      await api(`/mesocycles/${created.id}/generate`, {
        method: 'POST',
        body: { seedFromMesocycleId: copy_from_program_id ?? null, templateId: template_id ?? null },
      })
      const meso = await api<Mesocycle>(`/mesocycles/${created.id}`)
      return json({
        created: true,
        note: 'Status is "planning". The user activates it from the Programs tab when ready. Week 1 shown; use get_program for all weeks.',
        program: summarizeProgram(meso, 1),
      })
    } catch (err) { return fail(err) }
  })

  return server
}

/** Stateless handler: a fresh server per request, bound to the signed-in caller. */
export const mcpHandler = createMcpHandler((ctx: McpRequestContext) => {
  const caller = ctx.authInfo?.extra?.caller as McpCaller | undefined
  if (!caller) throw new Error('Missing authenticated caller')
  return buildServer(caller)
})
