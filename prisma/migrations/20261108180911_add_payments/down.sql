-- Reversión de 20261108150000_add_payments (DB-15.1).
-- Prisma no ejecuta este archivo solo. Para deshacer la migración:
--   npx prisma db execute --file prisma/migrations/20261108150000_add_payments/down.sql
-- Al final borra el registro de la migración, así `prisma migrate dev` la
-- vuelve a aplicar si hace falta.

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_charge_id_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_registered_by_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_charge_id_fkey";

-- DropForeignKey
ALTER TABLE "charges" DROP CONSTRAINT "charges_member_id_fkey";

-- DropTable
DROP TABLE "receipts";

-- DropTable
DROP TABLE "payments";

-- DropTable
DROP TABLE "charges";

-- DropEnum
DROP TYPE "PaymentResult";

-- DropEnum
DROP TYPE "PaymentMethod";

-- DropEnum
DROP TYPE "ChargeStatus";

-- DropEnum
DROP TYPE "ChargeType";

-- Olvida la migración en el historial de Prisma.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261108180911_add_payments';
