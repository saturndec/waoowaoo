import { registerOfficialModel } from '@/lib/providers/official/model-registry'
import type { OfficialModelModality } from '@/lib/providers/official/model-registry'

const MINIMAX_CATALOG: Readonly<Record<OfficialModelModality, readonly string[]>> = {
  llm: [
    'MiniMax-M2.5',
    'MiniMax-M2.5-highspeed',
  ],
  image: [],
  video: [],
  audio: [],
}

let initialized = false

export function ensureMiniMaxCatalogRegistered(): void {
  if (initialized) return
  initialized = true
  for (const modality of Object.keys(MINIMAX_CATALOG) as OfficialModelModality[]) {
    for (const modelId of MINIMAX_CATALOG[modality]) {
      registerOfficialModel({ provider: 'minimax', modality, modelId })
    }
  }
}

export function listMiniMaxCatalogModels(modality: OfficialModelModality): readonly string[] {
  ensureMiniMaxCatalogRegistered()
  return MINIMAX_CATALOG[modality]
}

export function resetMiniMaxCatalogForTest(): void {
  initialized = false
}
