-- CreateTable
CREATE TABLE "email_template_variables" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "email_template_variables_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "email_template_variables_templateId_name_key" ON "email_template_variables"("templateId", "name");
