CREATE TABLE `project_video_groups` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `episodeId` VARCHAR(191) NOT NULL,
  `gridMode` VARCHAR(191) NOT NULL,
  `shotNumbers` JSON NOT NULL,
  `durationSec` INTEGER NOT NULL,
  `prompt` LONGTEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `taskId` VARCHAR(191) NULL,
  `errorCode` VARCHAR(191) NULL,
  `errorMessage` LONGTEXT NULL,
  `referenceImageUrl` TEXT NULL,
  `referenceImageMediaId` VARCHAR(191) NULL,
  `videoUrl` TEXT NULL,
  `videoMediaId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `project_video_groups_projectId_idx` ON `project_video_groups`(`projectId`);
CREATE INDEX `project_video_groups_episodeId_idx` ON `project_video_groups`(`episodeId`);
CREATE INDEX `project_video_groups_referenceImageMediaId_idx` ON `project_video_groups`(`referenceImageMediaId`);
CREATE INDEX `project_video_groups_videoMediaId_idx` ON `project_video_groups`(`videoMediaId`);
CREATE INDEX `project_video_groups_taskId_idx` ON `project_video_groups`(`taskId`);

ALTER TABLE `project_video_groups`
  ADD CONSTRAINT `project_video_groups_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_video_groups`
  ADD CONSTRAINT `project_video_groups_episodeId_fkey`
  FOREIGN KEY (`episodeId`) REFERENCES `project_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_video_groups`
  ADD CONSTRAINT `project_video_groups_referenceImageMediaId_fkey`
  FOREIGN KEY (`referenceImageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `project_video_groups`
  ADD CONSTRAINT `project_video_groups_videoMediaId_fkey`
  FOREIGN KEY (`videoMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
