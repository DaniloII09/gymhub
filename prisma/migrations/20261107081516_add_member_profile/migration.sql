/*
  Warnings:

  - A unique constraint covering the columns `[memberCode]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fullName` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('M', 'F');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "enrolledAt" DATE,
ADD COLUMN     "fullName" VARCHAR(100) NOT NULL,
ADD COLUMN     "memberCode" VARCHAR(10),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sex" "Sex";

-- CreateIndex
CREATE UNIQUE INDEX "users_memberCode_key" ON "users"("memberCode");

-- Member code generator. BE-1.1 consume nextval(); el personal queda sin código.
CREATE SEQUENCE "member_code_seq" START 1;