/*
  Warnings:

  - You are about to drop the column `contentJson` on the `Issue` table. All the data in the column will be lost.
  - You are about to drop the column `html` on the `Issue` table. All the data in the column will be lost.
  - You are about to drop the column `text` on the `Issue` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Issue" DROP COLUMN "contentJson",
DROP COLUMN "html",
DROP COLUMN "text",
ADD COLUMN     "intro" TEXT,
ADD COLUMN     "readMore" TEXT,
ADD COLUMN     "whatsGoingOn" TEXT,
ADD COLUMN     "whyItMatters" TEXT;
