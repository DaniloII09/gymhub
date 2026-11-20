-- Reversión de 20261120191355_add_reviews (DB-22.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261120191355_add_reviews/down.sql

-- DropTable (arrastra sus índices, llaves foráneas y CHECK)
DROP TABLE "reviews";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261120191355_add_reviews';
