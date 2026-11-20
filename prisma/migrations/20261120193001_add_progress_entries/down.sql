-- Reversión de 20261120193001_add_progress_entries (DB-19.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261120193001_add_progress_entries/down.sql

-- DropTable (arrastra sus índices, llaves foráneas y CHECK)
DROP TABLE "progress_entries";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261120193001_add_progress_entries';
