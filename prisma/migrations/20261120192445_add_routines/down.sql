-- Reversión de 20261120192445_add_routines (DB-18.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261120192445_add_routines/down.sql

-- DropTable (arrastra sus índices, llaves foráneas y CHECK)
DROP TABLE "routine_exercises";
DROP TABLE "routines";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261120192445_add_routines';
