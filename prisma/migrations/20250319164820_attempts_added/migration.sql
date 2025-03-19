/*
  Warnings:

  - You are about to drop the column `quistion` on the `Question` table. All the data in the column will be lost.
  - Added the required column `question` to the `Question` table without a default value. This is not possible if the table is not empty.
  - Added the required column `attempts_log` to the `Quiz` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('OTP', 'QUESTIONS', 'BOTH');

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "quistion",
ADD COLUMN     "question" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "OTPmethod" TEXT,
ADD COLUMN     "attempts_log" JSONB NOT NULL,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "vertificationMethods" "VerificationMethod"[];

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
