-- CreateTable
CREATE TABLE "Exercise" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "primaryMuscles" TEXT NOT NULL DEFAULT '[]',
    "secondaryMuscles" TEXT NOT NULL DEFAULT '[]',
    "equipment" TEXT NOT NULL DEFAULT 'Barbell',
    "movementPattern" TEXT NOT NULL DEFAULT 'Push',
    "jointStress" TEXT NOT NULL DEFAULT '{}',
    "defaultRepRange" TEXT NOT NULL DEFAULT '8-12',
    "sfrRating" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "notes" TEXT,
    "substitutions" TEXT NOT NULL DEFAULT '[]',
    "isSeeded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserExerciseOverride" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserExerciseOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuscleGroup" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mev" INTEGER NOT NULL DEFAULT 8,
    "mav" INTEGER NOT NULL DEFAULT 14,
    "mrv" INTEGER NOT NULL DEFAULT 20,
    "defaultFrequency" INTEGER NOT NULL DEFAULT 2,
    "priorityTier" TEXT NOT NULL DEFAULT 'Medium',
    "injured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MuscleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesocycle" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planning',
    "weeks" INTEGER NOT NULL DEFAULT 4,
    "trainingDays" TEXT NOT NULL DEFAULT '[]',
    "goal" TEXT NOT NULL DEFAULT 'Pure Hypertrophy',
    "focusMuscles" TEXT NOT NULL DEFAULT '[]',
    "progression" TEXT NOT NULL DEFAULT 'Standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mesocycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MesocycleWeek" (
    "id" SERIAL NOT NULL,
    "mesocycleId" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "isDeload" BOOLEAN NOT NULL DEFAULT false,
    "volumePlan" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MesocycleWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutPlan" (
    "id" SERIAL NOT NULL,
    "mesocycleWeekId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "muscleGroups" TEXT NOT NULL DEFAULT '[]',
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedExercise" (
    "id" SERIAL NOT NULL,
    "workoutPlanId" INTEGER NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "plannedSets" INTEGER NOT NULL DEFAULT 3,
    "repRange" TEXT NOT NULL DEFAULT '8-12',
    "targetRir" INTEGER NOT NULL DEFAULT 3,
    "suggestedLoad" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workoutPlanId" INTEGER,
    "durationMinutes" INTEGER,
    "fatigueScore" INTEGER,
    "notes" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoggedSet" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "rirAchieved" INTEGER,
    "tempo" TEXT,
    "isWarmup" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoggedSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyMetric" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bodyweight" DOUBLE PRECISION,
    "measurements" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise"("name");

-- CreateIndex
CREATE INDEX "UserExerciseOverride_userId_idx" ON "UserExerciseOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserExerciseOverride_userId_exerciseId_key" ON "UserExerciseOverride"("userId", "exerciseId");

-- CreateIndex
CREATE INDEX "MuscleGroup_userId_idx" ON "MuscleGroup"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MuscleGroup_userId_name_key" ON "MuscleGroup"("userId", "name");

-- CreateIndex
CREATE INDEX "Mesocycle_userId_idx" ON "Mesocycle"("userId");

-- CreateIndex
CREATE INDEX "MesocycleWeek_mesocycleId_idx" ON "MesocycleWeek"("mesocycleId");

-- CreateIndex
CREATE UNIQUE INDEX "MesocycleWeek_mesocycleId_weekNumber_key" ON "MesocycleWeek"("mesocycleId", "weekNumber");

-- CreateIndex
CREATE INDEX "WorkoutPlan_mesocycleWeekId_idx" ON "WorkoutPlan"("mesocycleWeekId");

-- CreateIndex
CREATE INDEX "PlannedExercise_workoutPlanId_idx" ON "PlannedExercise"("workoutPlanId");

-- CreateIndex
CREATE INDEX "PlannedExercise_exerciseId_idx" ON "PlannedExercise"("exerciseId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_workoutPlanId_idx" ON "Session"("workoutPlanId");

-- CreateIndex
CREATE INDEX "LoggedSet_sessionId_idx" ON "LoggedSet"("sessionId");

-- CreateIndex
CREATE INDEX "LoggedSet_exerciseId_idx" ON "LoggedSet"("exerciseId");

-- CreateIndex
CREATE INDEX "BodyMetric_userId_idx" ON "BodyMetric"("userId");

-- CreateIndex
CREATE INDEX "Setting_userId_idx" ON "Setting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_userId_key_key" ON "Setting"("userId", "key");

-- AddForeignKey
ALTER TABLE "UserExerciseOverride" ADD CONSTRAINT "UserExerciseOverride_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MesocycleWeek" ADD CONSTRAINT "MesocycleWeek_mesocycleId_fkey" FOREIGN KEY ("mesocycleId") REFERENCES "Mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_mesocycleWeekId_fkey" FOREIGN KEY ("mesocycleWeekId") REFERENCES "MesocycleWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedExercise" ADD CONSTRAINT "PlannedExercise_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedExercise" ADD CONSTRAINT "PlannedExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "WorkoutPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggedSet" ADD CONSTRAINT "LoggedSet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggedSet" ADD CONSTRAINT "LoggedSet_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
