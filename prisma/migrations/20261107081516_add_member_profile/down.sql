-- reversión manual (Prisma no la corre)
ALTER TABLE "users"
  DROP COLUMN "fullName", DROP COLUMN "sex", DROP COLUMN "birthDate",
  DROP COLUMN "enrolledAt", DROP COLUMN "memberCode",
  DROP COLUMN "mustChangePassword", DROP COLUMN "createdById";
DROP SEQUENCE "member_code_seq";
DROP TYPE "Sex";