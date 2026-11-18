CREATE TYPE "ReservationOrigin" AS ENUM ('MEMBERSHIP', 'DROP_IN');

ALTER TABLE "class_reservations"
ADD COLUMN "origin" "ReservationOrigin" NOT NULL DEFAULT 'MEMBERSHIP';
