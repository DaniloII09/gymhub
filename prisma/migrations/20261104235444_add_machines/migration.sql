-- CreateEnum
CREATE TYPE "MachineArea" AS ENUM ('CARDIO', 'STRENGTH', 'FREE_WEIGHTS', 'FUNCTIONAL');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('OPERATIONAL', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateTable
CREATE TABLE "machines" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "area" "MachineArea" NOT NULL,
    "status" "MachineStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_status_changes" (
    "id" SERIAL NOT NULL,
    "machine_id" INTEGER NOT NULL,
    "from_status" "MachineStatus" NOT NULL,
    "to_status" "MachineStatus" NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machines_code_key" ON "machines"("code");

-- CreateIndex
CREATE INDEX "machines_area_name_idx" ON "machines"("area", "name");

-- CreateIndex
CREATE INDEX "machine_status_changes_machine_id_changed_at_idx" ON "machine_status_changes"("machine_id", "changed_at");

-- AddForeignKey
ALTER TABLE "machine_status_changes" ADD CONSTRAINT "machine_status_changes_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_status_changes" ADD CONSTRAINT "machine_status_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
