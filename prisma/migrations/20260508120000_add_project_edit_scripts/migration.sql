CREATE TABLE `project_edit_scripts` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `episodeId` VARCHAR(191) NOT NULL,
  `userPrompt` LONGTEXT NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `logline` LONGTEXT NULL,
  `durationSec` INTEGER NOT NULL,
  `shotCount` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ready',
  `shotsJson` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `project_edit_scripts_episodeId_key`(`episodeId`),
  INDEX `project_edit_scripts_projectId_idx`(`projectId`),
  INDEX `project_edit_scripts_episodeId_idx`(`episodeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_edit_asset_requirements` (
  `id` VARCHAR(191) NOT NULL,
  `editScriptId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `episodeId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` LONGTEXT NOT NULL,
  `shotIndexes` JSON NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `targetId` VARCHAR(191) NULL,
  `errorMessage` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `project_edit_asset_requirements_editScriptId_kind_name_key`(`editScriptId`, `kind`, `name`),
  INDEX `project_edit_asset_requirements_projectId_idx`(`projectId`),
  INDEX `project_edit_asset_requirements_episodeId_idx`(`episodeId`),
  INDEX `project_edit_asset_requirements_targetId_idx`(`targetId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_edit_scripts`
  ADD CONSTRAINT `project_edit_scripts_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_edit_scripts`
  ADD CONSTRAINT `project_edit_scripts_episodeId_fkey`
  FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_edit_asset_requirements`
  ADD CONSTRAINT `project_edit_asset_requirements_editScriptId_fkey`
  FOREIGN KEY (`editScriptId`) REFERENCES `project_edit_scripts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_edit_asset_requirements`
  ADD CONSTRAINT `project_edit_asset_requirements_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_edit_asset_requirements`
  ADD CONSTRAINT `project_edit_asset_requirements_episodeId_fkey`
  FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
