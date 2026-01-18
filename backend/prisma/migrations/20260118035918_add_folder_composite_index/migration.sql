-- CreateIndex
CREATE INDEX "folders_userId_parentId_isTrash_idx" ON "folders"("userId", "parentId", "isTrash");
