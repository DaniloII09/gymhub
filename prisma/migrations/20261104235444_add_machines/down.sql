-- Reversión de 20261104235444_add_machines (DB-20.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261104235444_add_machines/down.sql
-- Al final borra el registro de la migración, así `prisma migrate dev` la
-- vuelve a aplicar si hace falta.

-- DropForeignKey
ALTER TABLE "machine_status_changes" DROP CONSTRAINT "machine_status_changes_changed_by_id_fkey";

-- DropForeignKey
ALTER TABLE "machine_status_changes" DROP CONSTRAINT "machine_status_changes_machine_id_fkey";

-- DropTable
DROP TABLE "machine_status_changes";

-- DropTable
DROP TABLE "machines";

-- DropEnum
DROP TYPE "MachineStatus";

-- DropEnum
DROP TYPE "MachineArea";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261104235444_add_machines';
