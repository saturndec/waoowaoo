import fs from 'node:fs'
import path from 'node:path'
import { creativeDirectionSkill } from '@skills/agent/creative-direction/manifest'
import { screenwritingSkill } from '@skills/agent/screenwriting/manifest'
import { storyStructureSkill } from '@skills/agent/story-structure/manifest'
import { storyboardDirectionSkill } from '@skills/agent/storyboard-direction/manifest'
import { visualContinuitySkill } from '@skills/agent/visual-continuity/manifest'
import { locationSelectionSkill } from '@skills/agent/location-selection/manifest'
import { characterSelectionSkill } from '@skills/agent/character-selection/manifest'
import { audioDirectionSkill } from '@skills/agent/audio-direction/manifest'
import { mediaGenerationSkill } from '@skills/agent/media-generation/manifest'
import type {
  AgentSkillId,
  AgentSkillManifest,
  AgentSkillSearchResult,
  LoadedAgentSkill,
} from './types'

const agentSkillManifests = [
  creativeDirectionSkill,
  screenwritingSkill,
  storyStructureSkill,
  storyboardDirectionSkill,
  visualContinuitySkill,
  locationSelectionSkill,
  characterSelectionSkill,
  audioDirectionSkill,
  mediaGenerationSkill,
] satisfies AgentSkillManifest[]

const bannedFixedWorkflowIds = new Set([
  ['story', 'to', 'script'].join('-'),
  ['script', 'to', 'storyboard'].join('-'),
])

function validateManifest(manifest: AgentSkillManifest) {
  if (bannedFixedWorkflowIds.has(manifest.id)) {
    throw new Error(`AGENT_SKILL_FIXED_WORKFLOW_ID_FORBIDDEN:${manifest.id}`)
  }
  if (manifest.allowedOperationIds.some((operationId) => bannedFixedWorkflowIds.has(operationId))) {
    throw new Error(`AGENT_SKILL_FIXED_WORKFLOW_OPERATION_FORBIDDEN:${manifest.id}`)
  }
}

for (const manifest of agentSkillManifests) {
  validateManifest(manifest)
}

function toSearchResult(manifest: AgentSkillManifest): AgentSkillSearchResult {
  return {
    id: manifest.id,
    name: manifest.name,
    summary: manifest.summary,
    description: manifest.description,
    triggers: manifest.triggers,
    riskLevel: manifest.riskLevel,
    requiresApproval: manifest.requiresApproval,
  }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
}

function scoreManifest(manifest: AgentSkillManifest, tokens: string[]): number {
  if (tokens.length === 0) return 1
  const haystack = [
    manifest.id,
    manifest.name,
    manifest.summary,
    manifest.description,
    ...manifest.triggers,
  ].join(' ').toLowerCase()
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

export function listAgentSkillManifests(): AgentSkillManifest[] {
  return [...agentSkillManifests]
}

export function getAgentSkillManifest(skillId: string): AgentSkillManifest | null {
  return agentSkillManifests.find((manifest) => manifest.id === skillId) ?? null
}

export function isAgentSkillId(value: string): value is AgentSkillId {
  return getAgentSkillManifest(value) !== null
}

export function searchAgentSkills(params: {
  query?: string | null
  limit?: number
}): AgentSkillSearchResult[] {
  const tokens = tokenize(params.query ?? '')
  const limit = Math.min(Math.max(Math.floor(params.limit ?? 8), 1), 20)
  return agentSkillManifests
    .map((manifest) => ({
      manifest,
      score: scoreManifest(manifest, tokens),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.manifest.id.localeCompare(right.manifest.id))
    .slice(0, limit)
    .map((item) => toSearchResult(item.manifest))
}

export function loadAgentSkill(skillId: string): LoadedAgentSkill | null {
  const manifest = getAgentSkillManifest(skillId)
  if (!manifest) return null
  const filePath = path.resolve(process.cwd(), manifest.documentPath)
  const instructions = fs.readFileSync(filePath, 'utf8').trim()
  return {
    ...toSearchResult(manifest),
    instructions,
    allowedOperationIds: [...manifest.allowedOperationIds],
  }
}
