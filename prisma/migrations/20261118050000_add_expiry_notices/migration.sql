-- CreateEnum
CREATE TYPE "ExpiryNoticeKind" AS ENUM ('D5', 'D1');

-- CreateTable
CREATE TABLE "expiry_notices" (
    "id" SERIAL NOT NULL,
    "membership_id" INTEGER NOT NULL,
    "member_id" UUID NOT NULL,
    "kind" "ExpiryNoticeKind" NOT NULL,
    "end_date" DATE NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expiry_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expiry_notices_membership_id_kind_key" ON "expiry_notices"("membership_id", "kind");

-- AddForeignKey
ALTER TABLE "expiry_notices" ADD CONSTRAINT "expiry_notices_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
