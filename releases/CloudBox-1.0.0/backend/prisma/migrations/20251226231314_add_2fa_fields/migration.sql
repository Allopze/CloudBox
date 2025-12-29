-- AlterTable
ALTER TABLE "users" ADD COLUMN     "recoveryCodes" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;
