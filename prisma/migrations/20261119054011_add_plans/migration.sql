-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('MONTHLY', 'QUARTERLY', 'DROP_IN');

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "type" "PlanType" NOT NULL,
    "duration_days" INTEGER,
    "price" DECIMAL(8,2) NOT NULL,
    "benefits" VARCHAR(300),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE INDEX "plans_is_active_idx" ON "plans"("is_active");

-- Agregado a mano (DB-3.1): Prisma no representa CHECK ni índices funcionales o
-- parciales en el schema.
-- El precio siempre es mayor que 0.
ALTER TABLE "plans" ADD CONSTRAINT "plans_price_positive" CHECK ("price" > 0);

-- MONTHLY y QUARTERLY duran de 1 a 365 días; DROP_IN va sin duración porque
-- incluye una sola clase que vence el mismo día.
ALTER TABLE "plans" ADD CONSTRAINT "plans_duration_by_type" CHECK (
  ("type" = 'DROP_IN' AND "duration_days" IS NULL)
  OR ("type" <> 'DROP_IN' AND "duration_days" IS NOT NULL AND "duration_days" BETWEEN 1 AND 365)
);

-- El nombre no se repite aunque cambien las mayúsculas ("Mensual" = "MENSUAL").
CREATE UNIQUE INDEX "plans_name_lower_key" ON "plans"(lower("name"));

-- Un solo plan de clase suelta activo a la vez; los desactivados quedan en el
-- historial y no cuentan.
CREATE UNIQUE INDEX "plans_single_active_drop_in_key"
  ON "plans"("type")
  WHERE "type" = 'DROP_IN' AND "is_active";
