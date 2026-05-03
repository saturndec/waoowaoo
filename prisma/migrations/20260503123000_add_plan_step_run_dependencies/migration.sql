ALTER TABLE `plan_step_runs`
  ADD COLUMN `dependsOnJson` JSON NULL;

ALTER TABLE `plan_artifacts`
  MODIFY `stepKey` VARCHAR(191) NOT NULL DEFAULT '';
