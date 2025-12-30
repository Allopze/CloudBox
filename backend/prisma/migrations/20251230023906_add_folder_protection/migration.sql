-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "isProtected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "protectionHash" TEXT;
