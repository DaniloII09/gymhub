-- Reversión de 20261113020542_add_notifications (DB-24.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261113020542_add_notifications/down.sql
-- Al final borra el registro de la migración, así `prisma migrate dev` la
-- vuelve a aplicar si hace falta.

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropTable
DROP TABLE "notifications";

-- DropEnum
DROP TYPE "NotificationSource";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261113020542_add_notifications';
