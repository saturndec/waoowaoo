export type OfficialProviderKey = 'bailian' | 'minimax' | 'siliconflow'
export type OfficialModelModality = 'llm' | 'image' | 'video' | 'audio'

interface RegisterOfficialModelInput {
  provider: OfficialProviderKey
  modality: OfficialModelModality
  modelId: string
}

interface AssertOfficialModelInput {
  provider: OfficialProviderKey
  modality: OfficialModelModality
  modelId: string
}

const registry = new Set<string>()

function buildRegistryKey(input: RegisterOfficialModelInput): string {
  return `${input.provider}::${input.modality}::${input.modelId}`
}

function readTrimmedString(value: string): string {
  return value.trim()
}

export function registerOfficialModel(input: RegisterOfficialModelInput): void {
  const modelId = readTrimmedString(input.modelId)
  if (!modelId) {
    throw new Error('MODEL_REGISTRY_INVALID_MODEL_ID')
  }
  registry.add(buildRegistryKey({ ...input, modelId }))
}

export function isOfficialModelRegistered(input: AssertOfficialModelInput): boolean {
  const modelId = readTrimmedString(input.modelId)
  if (!modelId) return false
  return registry.has(buildRegistryKey({ ...input, modelId }))
}

export function assertOfficialModelRegistered(input: AssertOfficialModelInput): void {
  if (isOfficialModelRegistered(input)) return
  throw new Error(`MODEL_NOT_REGISTERED: ${input.provider}/${input.modality}/${input.modelId}`)
}

export function resetOfficialModelRegistryForTest(): void {
  registry.clear()
}
