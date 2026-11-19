ALTER TABLE "gym_classes" ADD COLUMN "cancellation_reason" VARCHAR(200);
ALTER TABLE "class_reservations" ADD COLUMN "cancelled_by_gym" BOOLEAN NOT NULL DEFAULT false;
