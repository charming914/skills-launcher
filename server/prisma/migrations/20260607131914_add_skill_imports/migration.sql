-- CreateTable
CREATE TABLE "skill_imports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stages" TEXT NOT NULL,
    "envResult" TEXT NOT NULL,
    "permissionRequest" TEXT NOT NULL,
    "conversationRef" TEXT,
    "installed" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "skill_imports_slug_idx" ON "skill_imports"("slug");
