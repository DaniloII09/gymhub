-- Reversión de 20261108230500_add_class_reservations_and_personal_sessions (DB-7.1 y DB-11.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261108230500_add_class_reservations_and_personal_sessions/down.sql

-- DropForeignKey
ALTER TABLE "personal_sessions" DROP CONSTRAINT "personal_sessions_availability_block_id_fkey";
ALTER TABLE "personal_sessions" DROP CONSTRAINT "personal_sessions_member_id_fkey";
ALTER TABLE "personal_sessions" DROP CONSTRAINT "personal_sessions_trainer_id_fkey";
ALTER TABLE "class_reservations" DROP CONSTRAINT "class_reservations_member_id_fkey";
ALTER TABLE "class_reservations" DROP CONSTRAINT "class_reservations_class_id_fkey";

-- DropTable
DROP TABLE "personal_sessions";
DROP TABLE "class_reservations";

-- DropEnum
DROP TYPE "PersonalSessionStatus";
DROP TYPE "ReservationStatus";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261108230500_add_class_reservations_and_personal_sessions';

