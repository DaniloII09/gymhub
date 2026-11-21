-- Reversión de 20261119225836_add_check_ins (DB-13.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261119225836_add_check_ins/down.sql

-- DropTable (arrastra sus índices, llaves foráneas y CHECK)
DROP TABLE "check_ins";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261119225836_add_check_ins';
