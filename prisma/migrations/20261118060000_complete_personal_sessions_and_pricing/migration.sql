-- AlterTable
ALTER TABLE "personal_sessions"
ADD COLUMN "charge_id" INTEGER,
ADD COLUMN "price" DECIMAL(8,2);

-- CreateTable
CREATE TABLE "personal_session_pricing" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(8,2) NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_session_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_sessions_charge_id_key" ON "personal_sessions"("charge_id");

-- AddForeignKey
ALTER TABLE "personal_session_pricing" ADD CONSTRAINT "personal_session_pricing_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Agregado a mano (DB-11.1):
-- 1. Impide que un entrenador tenga dos sesiones SCHEDULED con el mismo starts_at.
CREATE UNIQUE INDEX "personal_sessions_trainer_scheduled_start_key"
  ON "personal_sessions"("trainer_id", "starts_at")
  WHERE "status" = 'SCHEDULED';

-- 2. El precio de sesión registrado y la configuración deben ser positivos.
ALTER TABLE "personal_sessions" ADD CONSTRAINT "personal_sessions_price_positive" CHECK ("price" IS NULL OR "price" > 0);
ALTER TABLE "personal_session_pricing" ADD CONSTRAINT "personal_session_pricing_singleton" CHECK ("id" = 1);
ALTER TABLE "personal_session_pricing" ADD CONSTRAINT "personal_session_pricing_price_positive" CHECK ("price" > 0);
