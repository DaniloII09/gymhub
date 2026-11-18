-- Reversión de 20261118060000_complete_personal_sessions_and_pricing (DB-11.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261118060000_complete_personal_sessions_and_pricing/down.sql

-- DropConstraints & ForeignKeys
ALTER TABLE "personal_session_pricing" DROP CONSTRAINT "personal_session_pricing_updated_by_id_fkey";
ALTER TABLE "personal_sessions" DROP CONSTRAINT "personal_sessions_price_positive";

-- DropTable
DROP TABLE "personal_session_pricing";

-- DropIndex
DROP INDEX "personal_sessions_trainer_scheduled_start_key";
DROP INDEX "personal_sessions_charge_id_key";

-- AlterTable
ALTER TABLE "personal_sessions"
DROP COLUMN "charge_id",
DROP COLUMN "price";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261118060000_complete_personal_sessions_and_pricing';
