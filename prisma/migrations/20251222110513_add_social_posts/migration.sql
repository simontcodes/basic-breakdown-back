-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('X');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "issueId" TEXT,
    "url" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "tweetCount" INTEGER NOT NULL DEFAULT 0,
    "rootPostId" TEXT,
    "lastPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostTweet" (
    "id" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "xPostId" TEXT,

    CONSTRAINT "SocialPostTweet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPost_platform_status_idx" ON "SocialPost"("platform", "status");

-- CreateIndex
CREATE INDEX "SocialPost_issueId_idx" ON "SocialPost"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostTweet_socialPostId_order_key" ON "SocialPostTweet"("socialPostId", "order");

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostTweet" ADD CONSTRAINT "SocialPostTweet_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
