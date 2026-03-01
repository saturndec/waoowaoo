import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logProjectAction } from '@/lib/logging/semantic'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import {
  parseModelKeyStrict,
  type CapabilitySelections,
  type UnifiedModelType} from '@/lib/model-config-contract'
import {
  resolveBuiltinModelContext,
  getCapabilityOptionFields,
  validateCapabilitySelectionsPayload,
  type CapabilityModelContext} from '@/lib/model-capabilities/lookup'

const MODEL_FIELDS = [
  'analysisModel',
  'characterModel',
  'locationModel',
  'storyboardModel',
  'editModel',
  'videoModel',
] as const

const MODEL_FIELD_TO_TYPE: Record<typeof MODEL_FIELDS[number], UnifiedModelType> = {
  analysisModel: 'llm',
  characterModel: 'image',
  locationModel: 'image',
  storyboardModel: 'image',
  editModel: 'image',
  videoModel: 'video'}

const CAPABILITY_MODEL_TYPES: readonly UnifiedModelType[] = ['image', 'video', 'llm', 'audio', 'lipsync']

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCapabilitySelectionsInput(
  raw: unknown,
  options?: { allowLegacyAspectRatio?: boolean },
): CapabilitySelections {
  if (raw === undefined || raw === null) return {}
  if (!isRecord(raw)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CAPABILITY_SELECTION_INVALID',
      field: 'capabilityOverrides'})
  }

  const normalized: CapabilitySelections = {}
  for (const [modelKey, rawSelection] of Object.entries(raw)) {
    if (!isRecord(rawSelection)) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'CAPABILITY_SELECTION_INVALID',
        field: `capabilityOverrides.${modelKey}`})
    }

    const selection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(rawSelection)) {
      if (field === 'aspectRatio') {
        if (options?.allowLegacyAspectRatio) continue
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_FIELD_INVALID',
          field: `capabilityOverrides.${modelKey}.${field}`})
      }
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new ApiError('INVALID_PARAMS', {
          code: 'CAPABILITY_SELECTION_INVALID',
          field: `capabilityOverrides.${modelKey}.${field}`})
      }
      selection[field] = value
    }

    if (Object.keys(selection).length > 0) {
      normalized[modelKey] = selection
    }
  }

  return normalized
}

function parseStoredCapabilitySelections(raw: string | null | undefined): CapabilitySelections {
  if (!raw) return {}
  try {
    return normalizeCapabilitySelectionsInput(JSON.parse(raw) as unknown, { allowLegacyAspectRatio: true })
  } catch {
    return {}
  }
}

function serializeCapabilitySelections(selections: CapabilitySelections): string | null {
  if (Object.keys(selections).length === 0) return null
  return JSON.stringify(selections)
}

function validateModelKeyField(field: typeof MODEL_FIELDS[number], value: unknown) {
  // Contract anchor: model key must be provider::modelId
  if (value === null) return
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field})
  }
  if (!parseModelKeyStrict(value)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field})
  }
}

function getNextProjectModelMap(
  current: {
    analysisModel: string | null
    characterModel: string | null
    locationModel: string | null
    storyboardModel: string | null
    editModel: string | null
    videoModel: string | null
  },
  updates: Record<string, unknown>,
): Record<string, CapabilityModelContext> {
  const nextMap = new Map<string, CapabilityModelContext>()

  for (const field of MODEL_FIELDS) {
    const rawValue = updates[field] !== undefined
      ? updates[field]
      : current[field]
    if (typeof rawValue !== 'string' || !rawValue.trim()) continue

    const modelKey = rawValue.trim()
    const context = resolveBuiltinModelContext(MODEL_FIELD_TO_TYPE[field], modelKey)
    if (!context) continue
    nextMap.set(modelKey, context)
  }

  return Object.fromEntries(nextMap)
}

function resolveCapabilityContext(
  modelKey: string,
  modelContextMap: Record<string, CapabilityModelContext>,
): CapabilityModelContext | null {
  const fromProjectModel = modelContextMap[modelKey]
  if (fromProjectModel) return fromProjectModel
  if (!parseModelKeyStrict(modelKey)) return null

  for (const modelType of CAPABILITY_MODEL_TYPES) {
    const context = resolveBuiltinModelContext(modelType, modelKey)
    if (context) return context
  }

  return null
}

function sanitizeCapabilityOverrides(
  overrides: CapabilitySelections,
  modelContextMap: Record<string, CapabilityModelContext>,
): CapabilitySelections {
  const sanitized: CapabilitySelections = {}

  for (const [modelKey, selection] of Object.entries(overrides)) {
    const context = resolveCapabilityContext(modelKey, modelContextMap)
    if (!context) continue

    const optionFields = getCapabilityOptionFields(context.modelType, context.capabilities)
    if (Object.keys(optionFields).length === 0) continue

    const cleanedSelection: Record<string, string | number | boolean> = {}
    for (const [field, value] of Object.entries(selection)) {
      const allowedValues = optionFields[field]
      if (!allowedValues) continue
      if (!allowedValues.includes(value)) continue
      cleanedSelection[field] = value
    }

    if (Object.keys(cleanedSelection).length > 0) {
      sanitized[modelKey] = cleanedSelection
    }
  }

  return sanitized
}

function validateCapabilityOverrides(
  overrides: CapabilitySelections,
  modelContextMap: Record<string, CapabilityModelContext>,
) {
  const issues = validateCapabilitySelectionsPayload(overrides, (modelKey) =>
    resolveCapabilityContext(modelKey, modelContextMap))

  if (issues.length > 0) {
    const firstIssue = issues[0]
    throw new ApiError('INVALID_PARAMS', {
      code: firstIssue.code,
      field: firstIssue.field,
      allowedValues: firstIssue.allowedValues})
  }
}

export const GET = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const projectData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: {
      capabilityOverrides: true,
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true}})

  const storedOverrides = parseStoredCapabilitySelections(projectData?.capabilityOverrides)
  const modelContextMap = projectData
    ? getNextProjectModelMap({
      analysisModel: projectData.analysisModel,
      characterModel: projectData.characterModel,
      locationModel: projectData.locationModel,
      storyboardModel: projectData.storyboardModel,
      editModel: projectData.editModel,
      videoModel: projectData.videoModel,
    }, {})
    : {}
  const cleanedOverrides = sanitizeCapabilityOverrides(storedOverrides, modelContextMap)

  return NextResponse.json({
    capabilityOverrides: cleanedOverrides})
})

// PATCH - 更新小说推文项目配置
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const project = authResult.project

  const body = await request.json()

  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS')
  }

  const currentProjectConfig = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    select: {
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true}})
  if (!currentProjectConfig) {
    throw new ApiError('NOT_FOUND')
  }

  const allowedProjectFields = [
    'analysisModel', 'characterModel', 'locationModel', 'storyboardModel',
    'editModel', 'videoModel', 'videoRatio', 'artStyle', 'locale',
    'ttsRate', 'lipSyncEnabled', 'lipSyncMode', 'capabilityOverrides',
  ] as const

  const updateData: Record<string, unknown> = {}
  for (const field of allowedProjectFields) {
    if (body[field] === undefined) continue

    if ((MODEL_FIELDS as readonly string[]).includes(field)) {
      validateModelKeyField(field as typeof MODEL_FIELDS[number], body[field])
    }

    if (field === 'capabilityOverrides') {
      const overrides = normalizeCapabilitySelectionsInput(body.capabilityOverrides)
      const modelContextMap = getNextProjectModelMap(currentProjectConfig, body as Record<string, unknown>)
      const cleanedOverrides = sanitizeCapabilityOverrides(overrides, modelContextMap)
      validateCapabilityOverrides(cleanedOverrides, modelContextMap)
      updateData.capabilityOverrides = serializeCapabilitySelections(cleanedOverrides)
      continue
    }

    updateData[field] = body[field]
  }

  const updatedNovelPromotionData = await prisma.novelPromotionProject.update({
    where: { projectId },
    data: updateData})

  // 同步更新用户偏好配置（配置字段）
  const preferenceFields = [
    'analysisModel', 'characterModel', 'locationModel', 'storyboardModel',
    'editModel', 'videoModel', 'videoRatio', 'artStyle', 'locale', 'ttsRate',
  ] as const
  const preferenceUpdate: Record<string, unknown> = {}
  for (const field of preferenceFields) {
    if (body[field] !== undefined) {
      if ((MODEL_FIELDS as readonly string[]).includes(field)) {
        validateModelKeyField(field as typeof MODEL_FIELDS[number], body[field])
      }
      preferenceUpdate[field] = body[field]
    }
  }
  if (Object.keys(preferenceUpdate).length > 0) {
    await prisma.userPreference.upsert({
      where: { userId: session.user.id },
      update: preferenceUpdate,
      create: {
        userId: session.user.id,
        ...preferenceUpdate}})
  }

  const novelPromotionDataWithSignedUrls = await attachMediaFieldsToProject(updatedNovelPromotionData)

  const fullProject = {
    ...project,
    novelPromotionData: novelPromotionDataWithSignedUrls}

  logProjectAction(
    'UPDATE_NOVEL_PROMOTION',
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    JSON.stringify({ changes: body }),
  )

  return NextResponse.json({ project: fullProject })
})
