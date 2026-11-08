-- Reversión de 20261108205048_add_gym_classes (DB-6.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261108205048_add_gym_classes/down.sql
-- Al final borra el registro de la migración, así `prisma migrate dev` la
-- vuelve a aplicar si hace falta.

-- DropForeignKey
ALTER TABLE "gym_classes" DROP CONSTRAINT "gym_classes_trainer_id_fkey";

-- DropTable
DROP TABLE "gym_classes";

-- DropEnum
DROP TYPE "ClassStatus";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261108205048_add_gym_classes';
