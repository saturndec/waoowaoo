import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { removeLocationPromptSuffix } from '@/lib/constants'
import { seedProjectLocationBackedImageSlots } from '@/lib/assets/services/location-backed-assets'
import { normalizeLocationAvailableSlots } from '@/lib/location-available-slots'
import { resolvePropVisualDescription } from '@/lib/assets/prop-description'
import { assertApprovedDomainMutationContext } from '@/lib/domain/approvals/guard'
import {
  assertExpectedVersion,
  assertNonEmptyText,
  type DomainMutationContext,
  DomainValidationError,
} from '@/lib/domain/shared'
import { createProjectRepository } from '@/lib/domain/repositories/project-workflow'

type JsonRecord = Record<string, unknown>

type ScreenplayPayload = Record<string, unknown>

type StoryToScriptClipCandidate = {
  id: string
  startText: string
  endText: string
  summary: string
  location: string | null
  characters: string[]
  props: string[]
  content: string
  matchLevel: string
  matchConfidence: number
}

type StoryToScriptScreenplayResult = {
  clipId: string
  success: boolean
  screenplay?: ScreenplayPayload | null
  error?: string | null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function toClipJsonArray(value: string[]): string | null {
  return value.length > 0 ? JSON.stringify(value) : null
}

function assertMutationContext(input: DomainMutationContext) {
  if (!input.runId?.trim()) {
    throw new DomainValidationError('mutation runId is required')
  }
  if (!input.operationId) {
    throw new DomainValidationError('mutation operationId is required')
  }
  if (!input.idempotencyKey?.trim()) {
    throw new DomainValidationError('mutation idempotencyKey is required')
  }
}

async function persistAnalyzedCharacters(params: {
  tx: Prisma.TransactionClient
  projectId: string
  existingNames: Set<string>
  analyzedCharacters: JsonRecord[]
}) {
  const repository = createProjectRepository(params.tx)
  const created: Array<{ id: string; name: string }> = []

  for (const item of params.analyzedCharacters) {
    const name = asString(item.name).trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (params.existingNames.has(key)) continue

    const profileData = {
      role_level: item.role_level,
      archetype: item.archetype,
      personality_tags: toStringArray(item.personality_tags),
      era_period: item.era_period,
      social_class: item.social_class,
      occupation: item.occupation,
      costume_tier: item.costume_tier,
      suggested_colors: toStringArray(item.suggested_colors),
      primary_identifier: item.primary_identifier,
      visual_keywords: toStringArray(item.visual_keywords),
      gender: item.gender,
      age_range: item.age_range,
    }

    const createdRow = await repository.createCharacter({
      projectId: params.projectId,
      name,
      aliasesJson: JSON.stringify(toStringArray(item.aliases)),
      introduction: asString(item.introduction) || null,
      profileDataJson: JSON.stringify(profileData),
    })
    params.existingNames.add(key)
    created.push(createdRow)
  }

  return created
}

async function persistAnalyzedLocations(params: {
  tx: Prisma.TransactionClient
  projectId: string
  existingNames: Set<string>
  analyzedLocations: JsonRecord[]
}) {
  const repository = createProjectRepository(params.tx)
  const created: Array<{ id: string; name: string }> = []
  const invalidKeywords = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']

  for (const item of params.analyzedLocations) {
    const name = asString(item.name).trim()
    if (!name) continue

    const descriptions = toStringArray(item.descriptions)
    const mergedDescriptions = descriptions.length > 0
      ? descriptions
      : (asString(item.description) ? [asString(item.description)] : [])
    const firstDescription = mergedDescriptions[0] || ''
    const isInvalid = invalidKeywords.some((keyword) =>
      name.includes(keyword) || firstDescription.includes(keyword),
    )
    if (isInvalid) continue

    const key = name.toLowerCase()
    if (params.existingNames.has(key)) continue

    const location = await repository.createLocation({
      projectId: params.projectId,
      name,
      summary: asString(item.summary) || null,
    })
    const cleanDescriptions = mergedDescriptions.map((desc) => removeLocationPromptSuffix(desc || ''))
    await seedProjectLocationBackedImageSlots({
      locationId: location.id,
      descriptions: cleanDescriptions,
      fallbackDescription: asString(item.summary) || name,
      availableSlots: normalizeLocationAvailableSlots(item.available_slots),
      locationImageModel: params.tx.locationImage,
    })

    params.existingNames.add(key)
    created.push(location)
  }

  return created
}

async function persistAnalyzedProps(params: {
  tx: Prisma.TransactionClient
  projectId: string
  existingNames: Set<string>
  analyzedProps: JsonRecord[]
}) {
  const repository = createProjectRepository(params.tx)
  const created: Array<{ id: string; name: string }> = []

  for (const item of params.analyzedProps) {
    const name = asString(item.name).trim()
    const summary = asString(item.summary).trim()
    const description = resolvePropVisualDescription({
      name,
      summary,
      description: asString(item.description).trim(),
    })
    if (!name || !summary || !description) continue

    const key = name.toLowerCase()
    if (params.existingNames.has(key)) continue

    const prop = await repository.createLocation({
      projectId: params.projectId,
      name,
      summary,
      assetKind: 'prop',
    })
    await seedProjectLocationBackedImageSlots({
      locationId: prop.id,
      descriptions: [description],
      fallbackDescription: description,
      availableSlots: [],
      locationImageModel: params.tx.locationImage,
    })

    params.existingNames.add(key)
    created.push(prop)
  }

  return created
}

async function replaceEpisodeClips(params: {
  tx: Prisma.TransactionClient
  episodeId: string
  clipList: StoryToScriptClipCandidate[]
}) {
  const repository = createProjectRepository(params.tx)
  const existing = await repository.listEpisodeClips(params.episodeId)
  const createdClips: Array<{ id: string; clipKey: string; version: string | null }> = []

  for (let index = 0; index < params.clipList.length; index += 1) {
    const clip = params.clipList[index]
    assertNonEmptyText(clip.summary, `clip summary at index ${index}`)
    assertNonEmptyText(clip.content, `clip content at index ${index}`)
    const target = existing[index]
    const payload = {
      startText: clip.startText,
      endText: clip.endText,
      summary: clip.summary,
      location: clip.location,
      charactersJson: toClipJsonArray(clip.characters),
      propsJson: toClipJsonArray(clip.props),
      content: clip.content,
    }
    if (target) {
      const updated = await repository.updateClip({
        clipId: target.id,
        ...payload,
      })
      createdClips.push({
        id: updated.id,
        clipKey: clip.id,
        version: updated.updatedAt.toISOString(),
      })
      continue
    }

    const created = await repository.createClip({
      episodeId: params.episodeId,
      ...payload,
    })
    createdClips.push({
      id: created.id,
      clipKey: clip.id,
      version: created.updatedAt.toISOString(),
    })
  }

  const staleClipIds = existing.slice(params.clipList.length).map((item) => item.id)
  await repository.deleteClipsByIds(staleClipIds)
  return createdClips
}

async function updateClipScreenplays(params: {
  tx: Prisma.TransactionClient
  clipIdMap: Map<string, string>
  screenplayResults: StoryToScriptScreenplayResult[]
}) {
  const repository = createProjectRepository(params.tx)
  for (const result of params.screenplayResults) {
    if (!result.success || !result.screenplay) continue
    const clipRecordId = params.clipIdMap.get(result.clipId)
    if (!clipRecordId) {
      throw new DomainValidationError(`clip mapping not found for screenplay result: ${result.clipId}`)
    }
    await repository.updateClipScreenplay({
      clipId: clipRecordId,
      screenplayJson: JSON.stringify(result.screenplay),
    })
  }
}

export async function persistStoryToScriptWorkflowResults(input: {
  projectId: string
  episodeId: string
  existingCharacterNames: Set<string>
  existingLocationNames: Set<string>
  existingPropNames: Set<string>
  analyzedCharacters: JsonRecord[]
  analyzedLocations: JsonRecord[]
  analyzedProps: JsonRecord[]
  clipList: StoryToScriptClipCandidate[]
  screenplayResults: StoryToScriptScreenplayResult[]
  mutation: DomainMutationContext
}) {
  assertMutationContext(input.mutation)
  await assertApprovedDomainMutationContext(input.mutation)

  return await prisma.$transaction(async (tx) => {
    const createdCharacters = await persistAnalyzedCharacters({
      tx,
      projectId: input.projectId,
      existingNames: input.existingCharacterNames,
      analyzedCharacters: input.analyzedCharacters,
    })
    const createdLocations = await persistAnalyzedLocations({
      tx,
      projectId: input.projectId,
      existingNames: input.existingLocationNames,
      analyzedLocations: input.analyzedLocations,
    })
    const createdProps = await persistAnalyzedProps({
      tx,
      projectId: input.projectId,
      existingNames: input.existingPropNames,
      analyzedProps: input.analyzedProps,
    })
    const createdClipRows = await replaceEpisodeClips({
      tx,
      episodeId: input.episodeId,
      clipList: input.clipList,
    })
    const clipIdMap = new Map(createdClipRows.map((item) => [item.clipKey, item.id]))
    await updateClipScreenplays({
      tx,
      clipIdMap,
      screenplayResults: input.screenplayResults,
    })

    return {
      createdCharacters,
      createdLocations,
      createdProps,
      createdClipRows,
    }
  })
}

export async function persistRetryScreenplayResult(input: {
  episodeId: string
  clip: JsonRecord
  screenplay: ScreenplayPayload
  expectedClipVersion?: string | null
  mutation: DomainMutationContext
}) {
  assertMutationContext(input.mutation)
  await assertApprovedDomainMutationContext(input.mutation)
  const clipContent = asString(input.clip.content)
  assertNonEmptyText(clipContent, 'retry clip content')

  return await prisma.$transaction(async (tx) => {
    const repository = createProjectRepository(tx)
    const startText = asString(input.clip.startText) || null
    const endText = asString(input.clip.endText) || null
    const summary = asString(input.clip.summary)
    assertNonEmptyText(summary, 'retry clip summary')

    const existingClip = await repository.findClipByEpisodeBoundary({
      episodeId: input.episodeId,
      startText,
      endText,
    })

    let clipRecordId = existingClip?.id || null
    if (existingClip) {
      assertExpectedVersion({
        entityLabel: `retry clip ${existingClip.id}`,
        actualUpdatedAt: existingClip.updatedAt,
        expectedVersion: input.expectedClipVersion || undefined,
      })
    }

    if (!clipRecordId) {
      const created = await repository.createClip({
        episodeId: input.episodeId,
        startText,
        endText,
        summary,
        location: asString(input.clip.location) || null,
        charactersJson: Array.isArray(input.clip.characters) ? JSON.stringify(input.clip.characters) : null,
        propsJson: Array.isArray(input.clip.props) ? JSON.stringify(input.clip.props) : null,
        content: clipContent,
      })
      clipRecordId = created.id
    }

    await repository.updateClipScreenplay({
      clipId: clipRecordId,
      screenplayJson: JSON.stringify(input.screenplay),
    })

    return {
      clipId: clipRecordId,
    }
  })
}
