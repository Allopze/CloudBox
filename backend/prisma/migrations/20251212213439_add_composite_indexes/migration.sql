-- CreateIndex
CREATE INDEX "files_userId_folderId_isTrash_idx" ON "files"("userId", "folderId", "isTrash");

-- CreateIndex
CREATE INDEX "files_userId_isFavorite_isTrash_idx" ON "files"("userId", "isFavorite", "isTrash");
