/*
  Warnings:

  - A unique constraint covering the columns `[slug,locale]` on the table `legal_pages` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "legal_pages_slug_key";

-- AlterTable
ALTER TABLE "legal_pages" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'es';

-- CreateIndex
CREATE UNIQUE INDEX "legal_pages_slug_locale_key" ON "legal_pages"("slug", "locale");
