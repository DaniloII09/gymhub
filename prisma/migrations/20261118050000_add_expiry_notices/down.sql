-- Reversión de 20261118050000_add_expiry_notices (DB-26.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261118050000_add_expiry_notices/down.sql
-- Al final borra el registro de la migración, así `prisma migrate dev` la
-- vuelve a aplicar si hace falta.

-- DropForeignKey
ALTER TABLE "expiry_notices" DROP CONSTRAINT "expiry_notices_member_id_fkey";

-- DropTable
DROP TABLE "expiry_notices";

-- DropEnum
DROP TYPE "ExpiryNoticeKind";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261118050000_add_expiry_notices';
