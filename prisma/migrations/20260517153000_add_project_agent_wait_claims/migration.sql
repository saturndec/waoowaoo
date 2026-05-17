ALTER TABLE `project_agent_waits`
  ADD COLUMN `claimId` VARCHAR(191) NULL,
  ADD COLUMN `claimedAt` DATETIME(3) NULL,
  ADD COLUMN `claimExpiresAt` DATETIME(3) NULL;

CREATE INDEX `project_agent_waits_claimId_idx`
  ON `project_agent_waits`(`claimId`);
