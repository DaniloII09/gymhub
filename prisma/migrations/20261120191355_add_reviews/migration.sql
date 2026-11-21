-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "member_id" UUID NOT NULL,
    "gym_class_id" INTEGER,
    "personal_session_id" INTEGER,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "reviews"("created_at");

-- CreateIndex
CREATE INDEX "reviews_gym_class_id_idx" ON "reviews"("gym_class_id");

-- CreateIndex
CREATE INDEX "reviews_personal_session_id_idx" ON "reviews"("personal_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_member_id_gym_class_id_key" ON "reviews"("member_id", "gym_class_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_member_id_personal_session_id_key" ON "reviews"("member_id", "personal_session_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_gym_class_id_fkey" FOREIGN KEY ("gym_class_id") REFERENCES "gym_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_personal_session_id_fkey" FOREIGN KEY ("personal_session_id") REFERENCES "personal_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agregado a mano (DB-22.1): Prisma no representa CHECK en el schema.
-- Estrellas de 1 a 5.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Cada reseña pertenece exclusivamente a una clase grupal o a una sesión personal.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_single_target" CHECK (
  ("gym_class_id" IS NOT NULL AND "personal_session_id" IS NULL)
  OR ("gym_class_id" IS NULL AND "personal_session_id" IS NOT NULL)
);
