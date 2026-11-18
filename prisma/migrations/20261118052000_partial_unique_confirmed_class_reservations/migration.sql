-- AlterTable
ALTER TABLE "class_reservations" ADD COLUMN     "cancelled_at" TIMESTAMP(3);

-- DropIndex: elimina la unicidad global que impedía volver a reservar tras cancelar (DB-7.1).
DROP INDEX "class_reservations_class_id_member_id_key";

-- CreateIndex
CREATE INDEX "class_reservations_class_id_member_id_idx" ON "class_reservations"("class_id", "member_id");

-- Agregado a mano (DB-7.1): Prisma no representa índices parciales en schema.prisma.
-- Impide dos reservas CONFIRMED del mismo miembro para la misma clase,
-- permitiendo crear una nueva si la anterior quedó CANCELLED y sin perder datos.
CREATE UNIQUE INDEX "class_reservations_confirmed_member_class_key"
  ON "class_reservations"("class_id", "member_id")
  WHERE "status" = 'CONFIRMED';
