-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "gym_classes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "trainer_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "ClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gym_classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gym_classes_trainer_id_starts_at_idx" ON "gym_classes"("trainer_id", "starts_at");

-- CreateIndex
CREATE INDEX "gym_classes_starts_at_idx" ON "gym_classes"("starts_at");

-- AddForeignKey
ALTER TABLE "gym_classes" ADD CONSTRAINT "gym_classes_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agregado a mano (DB-6.1): Prisma no representa CHECK en el schema.
-- El cupo máximo debe estar entre 1 y 50, y la hora de fin debe ser posterior a la de inicio.
ALTER TABLE "gym_classes" ADD CONSTRAINT "gym_classes_capacity_range" CHECK ("capacity" >= 1 AND "capacity" <= 50);
ALTER TABLE "gym_classes" ADD CONSTRAINT "gym_classes_ends_after_starts" CHECK ("ends_at" > "starts_at");

