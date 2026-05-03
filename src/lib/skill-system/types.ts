import type { ComponentType } from 'react'
import type { ZodTypeAny } from 'zod'
import type { ArtifactType } from '@/lib/artifact-system/types'

export type SkillRiskLevel = 'low' | 'medium' | 'high'
export type SkillMutationKind = 'read' | 'generate' | 'update' | 'delete'
export type SkillScopeKind = 'project' | 'episode' | 'clip' | 'panel'

export type CommandSkillId =
  | 'insert_panel'
  | 'panel_variant'
  | 'regenerate_storyboard_text'
  | 'modify_shot_prompt'

export interface SkillPackageMetadata {
  id: string
  name: string
  summary: string
  description: string
  riskLevel: SkillRiskLevel
  scope: SkillScopeKind
}

export interface SkillPackageInstructions {
  documentPath: string
}

export interface SkillPackageInterface {
  inputSchema: ZodTypeAny
  outputSchema: ZodTypeAny
  inputArtifacts: ArtifactType[]
  outputArtifacts: ArtifactType[]
}

export interface SkillPackageResources {
  models: readonly string[]
  promptFiles: readonly string[]
  loaders: readonly string[]
  toolAllowlist: readonly string[]
}

export interface SkillPackageEffects {
  mutationKind: SkillMutationKind
  invalidates: ArtifactType[]
  requiresApproval: boolean
}

export interface SkillPackage {
  kind: 'skill'
  metadata: SkillPackageMetadata
  instructions: SkillPackageInstructions
  interface: SkillPackageInterface
  resources: SkillPackageResources
  effects: SkillPackageEffects
  legacyStepIds: string[]
  execute: (input: unknown) => Promise<unknown>
  render: ComponentType<{ data: unknown }>
}

export interface SkillCatalogEntry {
  id: string
  kind: 'skill'
  name: string
  summary: string
  description: string
  documentPath: string
}

export interface SkillDefinition {
  id: CommandSkillId
  name: string
  summary: string
  riskLevel: SkillRiskLevel
  requiresApproval: boolean
  inputArtifacts: ArtifactType[]
  outputArtifacts: ArtifactType[]
  invalidates: ArtifactType[]
  mutationKind: SkillMutationKind
  taskType?: string
}
