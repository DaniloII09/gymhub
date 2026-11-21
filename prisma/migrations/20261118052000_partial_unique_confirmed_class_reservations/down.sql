-- Reversión de 20261118052000_partial_unique_confirmed_class_reservations (DB-7.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261118052000_partial_unique_confirmed_class_reservations/down.sql

-- DropIndex
DROP INDEX "class_reservations_confirmed_member_class_key";
DROP INDEX "class_reservations_class_id_member_id_idx";

-- AlterTable
ALTER TABLE "class_reservations" DROP COLUMN "cancelled_at";

-- Restore original global unique index
CREATE UNIQUE INDEX "class_reservations_class_id_member_id_key" ON "class_reservations"("class_id", "member_id");

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261118052000_partial_unique_confirmed_class_reservations';
