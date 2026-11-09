-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isPT" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Exercise_createdBy_idx" ON "Exercise"("createdBy");
