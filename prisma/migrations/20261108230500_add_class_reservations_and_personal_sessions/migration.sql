-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PersonalSessionStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "class_reservations" (
    "id" SERIAL NOT NULL,
    "class_id" INTEGER NOT NULL,
    "member_id" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_sessions" (
    "id" SERIAL NOT NULL,
    "trainer_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "availability_block_id" UUID,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "PersonalSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_reservations_class_id_member_id_key" ON "class_reservations"("class_id", "member_id");

-- CreateIndex
CREATE INDEX "class_reservations_class_id_status_idx" ON "class_reservations"("class_id", "status");

-- CreateIndex
CREATE INDEX "class_reservations_member_id_status_idx" ON "class_reservations"("member_id", "status");

-- CreateIndex
CREATE INDEX "personal_sessions_trainer_id_starts_at_idx" ON "personal_sessions"("trainer_id", "starts_at");

-- CreateIndex
CREATE INDEX "personal_sessions_member_id_starts_at_idx" ON "personal_sessions"("member_id", "starts_at");

-- AddForeignKey
ALTER TABLE "class_reservations" ADD CONSTRAINT "class_reservations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "gym_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_reservations" ADD CONSTRAINT "class_reservations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_sessions" ADD CONSTRAINT "personal_sessions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_sessions" ADD CONSTRAINT "personal_sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_sessions" ADD CONSTRAINT "personal_sessions_availability_block_id_fkey" FOREIGN KEY ("availability_block_id") REFERENCES "availability_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Agregado a mano (DB-11.1): la hora de fin de la sesión personal debe ser posterior a la de inicio.
ALTER TABLE "personal_sessions" ADD CONSTRAINT "personal_sessions_ends_after_starts" CHECK ("ends_at" > "starts_at");

