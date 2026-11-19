CREATE TYPE "PersonalSessionOutcome" AS ENUM ('COMPLETED', 'NO_SHOW');

ALTER TABLE "personal_sessions"
ADD COLUMN "outcome" "PersonalSessionOutcome",
ADD COLUMN "result_recorded_at" TIMESTAMP(3);
