-- CreateTable
CREATE TABLE "check_ins" (
    "id" SERIAL NOT NULL,
    "member_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membership_status" VARCHAR(20) NOT NULL,
    "is_exception" BOOLEAN NOT NULL DEFAULT false,
    "exception_reason" VARCHAR(200),
    "registered_by_id" UUID NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "check_ins_member_id_checked_in_at_idx" ON "check_ins"("member_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "check_ins_checked_in_at_idx" ON "check_ins"("checked_in_at");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agregado a mano (DB-13.1): Prisma no representa CHECK en el schema.
-- La foto del estado usa los mismos valores que MEMBERSHIP_STATUS_SERVICE.
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_membership_status_valid"
  CHECK ("membership_status" IN ('ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'NONE'));

-- Una excepción (H14) siempre lleva su motivo.
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_exception_needs_reason"
  CHECK (NOT "is_exception" OR length(trim(coalesce("exception_reason", ''))) > 0);
