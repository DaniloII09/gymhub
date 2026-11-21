-- CreateTable
CREATE TABLE "routines" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "trainer_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "days_of_week" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_exercises" (
    "id" SERIAL NOT NULL,
    "routine_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "suggested_weight_kg" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routine_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routines_trainer_id_idx" ON "routines"("trainer_id");

-- CreateIndex
CREATE INDEX "routines_member_id_idx" ON "routines"("member_id");

-- CreateIndex
CREATE INDEX "routine_exercises_routine_id_sort_order_idx" ON "routine_exercises"("routine_id", "sort_order");

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Agregado a mano (DB-18.1): Prisma no representa CHECK en el schema.
ALTER TABLE "routines" ADD CONSTRAINT "routines_name_length"
  CHECK (char_length(trim("name")) BETWEEN 3 AND 60);

ALTER TABLE "routines" ADD CONSTRAINT "routines_days_of_week_valid"
  CHECK (cardinality("days_of_week") BETWEEN 1 AND 7 AND "days_of_week" <@ ARRAY[1,2,3,4,5,6,7]::int[]);

ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_name_not_empty"
  CHECK (char_length(trim("name")) BETWEEN 1 AND 80);

ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_sets_range"
  CHECK ("sets" BETWEEN 1 AND 10);

ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_reps_range"
  CHECK ("reps" BETWEEN 1 AND 50);

ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_weight_range"
  CHECK ("suggested_weight_kg" >= 0 AND "suggested_weight_kg" <= 300);

ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_sort_order_positive"
  CHECK ("sort_order" >= 1);
