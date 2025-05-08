-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT DEFAULT 'active';
