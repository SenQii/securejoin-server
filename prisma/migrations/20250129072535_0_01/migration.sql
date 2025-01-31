/*
  Warnings:

  - You are about to drop the column `text` on the `Question` table. All the data in the column will be lost.
  - Added the required column `quistion` to the `Question` table without a default value. This is not possible if the table is not empty.
  - Added the required column `original_url` to the `Quiz` table without a default value. This is not possible if the table is not empty.
  - Added the required column `url` to the `Quiz` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Question" DROP COLUMN "text",
ADD COLUMN     "questionType" TEXT NOT NULL DEFAULT 'text',
ADD COLUMN     "quistion" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "original_url" TEXT NOT NULL,
ADD COLUMN     "url" TEXT NOT NULL;
