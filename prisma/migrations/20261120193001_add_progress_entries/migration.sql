-- CreateTable
CREATE TABLE "progress_entries" (
    "id" SERIAL NOT NULL,
    "member_id" UUID NOT NULL,
    "recorded_at" DATE NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "chest_cm" DECIMAL(5,2) NOT NULL,
    "waist_cm" DECIMAL(5,2) NOT NULL,
    "arm_cm" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "progress_entries_member_id_recorded_at_idx" ON "progress_entries"("member_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "progress_entries_member_id_recorded_at_key" ON "progress_entries"("member_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agregado a mano (DB-19.1): Prisma no representa CHECK en el schema.
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_weight_range"
  CHECK ("weight_kg" >= 20 AND "weight_kg" <= 300);

ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_chest_range"
  CHECK ("chest_cm" >= 10 AND "chest_cm" <= 250);

ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_waist_range"
  CHECK ("waist_cm" >= 10 AND "waist_cm" <= 250);

ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_arm_range"
  CHECK ("arm_cm" >= 10 AND "arm_cm" <= 250);
