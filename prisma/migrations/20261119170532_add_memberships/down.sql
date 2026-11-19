-- Reversión de 20261119170532_add_memberships (DB-4.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261119170532_add_memberships/down.sql

-- DropForeignKey (el cobro apunta a la membresía; la columna de Pagos se queda)
ALTER TABLE "charges" DROP CONSTRAINT "charges_membership_id_fkey";

-- DropTable (arrastra sus índices, llaves foráneas y CHECK)
DROP TABLE "memberships";

-- DropEnum
DROP TYPE "MembershipStatus";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261119170532_add_memberships';
