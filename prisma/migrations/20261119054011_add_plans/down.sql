-- Reversión de 20261119054011_add_plans (DB-3.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261119054011_add_plans/down.sql

-- DropTable (arrastra sus índices y restricciones CHECK)
DROP TABLE "plans";

-- DropEnum
DROP TYPE "PlanType";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261119054011_add_plans';
