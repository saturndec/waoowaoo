-- Destructive by product decision: old fixed workflow run history is not retained.

DROP TABLE IF EXISTS `graph_artifacts`;
DROP TABLE IF EXISTS `graph_checkpoints`;
DROP TABLE IF EXISTS `graph_events`;
DROP TABLE IF EXISTS `graph_step_attempts`;
DROP TABLE IF EXISTS `graph_steps`;
DROP TABLE IF EXISTS `graph_runs`;

ALTER TABLE `execution_plans`
  DROP COLUMN `linkedRunId`;

CREATE TABLE `plan_runs` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `episodeId` VARCHAR(191) NULL,
  `commandId` VARCHAR(191) NULL,
  `planId` VARCHAR(191) NULL,
  `goal` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `currentStepKey` VARCHAR(191) NULL,
  `errorCode` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `cancelRequestedAt` DATETIME(3) NULL,
  `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `lastSeq` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plan_step_runs` (
  `id` VARCHAR(191) NOT NULL,
  `planRunId` VARCHAR(191) NOT NULL,
  `stepKey` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NULL,
  `operationId` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `stepIndex` INTEGER NOT NULL,
  `stepTotal` INTEGER NOT NULL,
  `inputArtifactsJson` JSON NULL,
  `outputArtifactsJson` JSON NULL,
  `inputJson` JSON NULL,
  `outputJson` JSON NULL,
  `errorCode` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plan_run_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `planRunId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `seq` INTEGER NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `stepKey` VARCHAR(191) NULL,
  `payload` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plan_artifacts` (
  `id` VARCHAR(191) NOT NULL,
  `planRunId` VARCHAR(191) NOT NULL,
  `stepKey` VARCHAR(191) NULL,
  `artifactType` VARCHAR(191) NOT NULL,
  `refId` VARCHAR(191) NOT NULL,
  `payload` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `plan_runs_projectId_status_updatedAt_idx` ON `plan_runs`(`projectId`, `status`, `updatedAt`);
CREATE INDEX `plan_runs_userId_createdAt_idx` ON `plan_runs`(`userId`, `createdAt`);
CREATE INDEX `plan_runs_commandId_idx` ON `plan_runs`(`commandId`);
CREATE INDEX `plan_runs_planId_idx` ON `plan_runs`(`planId`);
CREATE INDEX `plan_runs_episodeId_status_updatedAt_idx` ON `plan_runs`(`episodeId`, `status`, `updatedAt`);

CREATE UNIQUE INDEX `plan_step_runs_planRunId_stepKey_key` ON `plan_step_runs`(`planRunId`, `stepKey`);
CREATE INDEX `plan_step_runs_planRunId_status_idx` ON `plan_step_runs`(`planRunId`, `status`);
CREATE INDEX `plan_step_runs_planRunId_stepIndex_idx` ON `plan_step_runs`(`planRunId`, `stepIndex`);
CREATE INDEX `plan_step_runs_taskId_idx` ON `plan_step_runs`(`taskId`);
CREATE INDEX `plan_step_runs_operationId_status_idx` ON `plan_step_runs`(`operationId`, `status`);

CREATE UNIQUE INDEX `plan_run_events_planRunId_seq_key` ON `plan_run_events`(`planRunId`, `seq`);
CREATE INDEX `plan_run_events_projectId_id_idx` ON `plan_run_events`(`projectId`, `id`);
CREATE INDEX `plan_run_events_planRunId_id_idx` ON `plan_run_events`(`planRunId`, `id`);
CREATE INDEX `plan_run_events_userId_id_idx` ON `plan_run_events`(`userId`, `id`);

CREATE UNIQUE INDEX `plan_artifacts_planRunId_stepKey_artifactType_refId_key`
  ON `plan_artifacts`(`planRunId`, `stepKey`, `artifactType`, `refId`);
CREATE INDEX `plan_artifacts_planRunId_idx` ON `plan_artifacts`(`planRunId`);
CREATE INDEX `plan_artifacts_planRunId_stepKey_idx` ON `plan_artifacts`(`planRunId`, `stepKey`);
CREATE INDEX `plan_artifacts_artifactType_refId_idx` ON `plan_artifacts`(`artifactType`, `refId`);

ALTER TABLE `plan_runs`
  ADD CONSTRAINT `plan_runs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `plan_runs_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `plan_runs_commandId_fkey` FOREIGN KEY (`commandId`) REFERENCES `project_commands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `plan_runs_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `execution_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `plan_step_runs`
  ADD CONSTRAINT `plan_step_runs_planRunId_fkey` FOREIGN KEY (`planRunId`) REFERENCES `plan_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `plan_run_events`
  ADD CONSTRAINT `plan_run_events_planRunId_fkey` FOREIGN KEY (`planRunId`) REFERENCES `plan_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `plan_run_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `plan_artifacts`
  ADD CONSTRAINT `plan_artifacts_planRunId_fkey` FOREIGN KEY (`planRunId`) REFERENCES `plan_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
