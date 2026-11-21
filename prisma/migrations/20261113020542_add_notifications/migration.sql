-- CreateEnum
CREATE TYPE "NotificationSource" AS ENUM ('MEMBERSHIPS', 'CHECK_INS', 'CLASSES', 'TRAINERS', 'PAYMENTS', 'ROUTINES', 'MACHINES', 'REVIEWS', 'REPORTS');

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "message" VARCHAR(300) NOT NULL,
    "source" "NotificationSource" NOT NULL,
    "reference_id" VARCHAR(40),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
