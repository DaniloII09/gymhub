-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('MEMBERSHIP', 'PERSONAL_SESSION', 'DROP_IN');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentResult" AS ENUM ('APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "charges" (
    "id" SERIAL NOT NULL,
    "member_id" UUID NOT NULL,
    "type" "ChargeType" NOT NULL,
    "concept" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(8,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "membership_id" INTEGER,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "charge_id" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "result" "PaymentResult" NOT NULL,
    "decline_reason" VARCHAR(120),
    "card_last4" CHAR(4),
    "idempotency_key" UUID NOT NULL,
    "registered_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(10) NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "charge_id" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charges_membership_id_key" ON "charges"("membership_id");

-- CreateIndex
CREATE INDEX "charges_member_id_status_idx" ON "charges"("member_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_charge_id_idx" ON "payments"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_charge_id_key" ON "receipts"("charge_id");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Agregado a mano (DB-15.1): Prisma no representa CHECK en el schema.
-- El monto de un cobro siempre es mayor que 0.
ALTER TABLE "charges" ADD CONSTRAINT "charges_amount_positive" CHECK ("amount" > 0);