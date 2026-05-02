ALTER TABLE `tasks`
  ADD COLUMN `operationId` VARCHAR(128) NULL,
  ADD COLUMN `operationSource` VARCHAR(64) NULL,
  ADD COLUMN `operationConfirmed` BOOLEAN NULL,
  ADD COLUMN `operationRequestId` VARCHAR(128) NULL;

CREATE INDEX `tasks_projectId_status_updatedAt_idx` ON `tasks`(`projectId`, `status`, `updatedAt`);
CREATE INDEX `tasks_projectId_operationId_updatedAt_idx` ON `tasks`(`projectId`, `operationId`, `updatedAt`);
