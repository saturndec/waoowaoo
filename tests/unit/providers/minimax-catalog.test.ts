import { beforeEach, describe, expect, it } from 'vitest'
import {
  isOfficialModelRegistered,
  resetOfficialModelRegistryForTest,
} from '@/lib/providers/official/model-registry'
import {
  ensureMiniMaxCatalogRegistered,
  listMiniMaxCatalogModels,
  resetMiniMaxCatalogForTest,
} from '@/lib/providers/minimax/catalog'

describe('minimax catalog', () => {
  beforeEach(() => {
    resetOfficialModelRegistryForTest()
    resetMiniMaxCatalogForTest()
  })

  it('registers MiniMax-M2.5 and MiniMax-M2.5-highspeed as llm models', () => {
    ensureMiniMaxCatalogRegistered()

    expect(
      isOfficialModelRegistered({
        provider: 'minimax',
        modality: 'llm',
        modelId: 'MiniMax-M2.5',
      }),
    ).toBe(true)

    expect(
      isOfficialModelRegistered({
        provider: 'minimax',
        modality: 'llm',
        modelId: 'MiniMax-M2.5-highspeed',
      }),
    ).toBe(true)
  })

  it('lists llm models correctly', () => {
    const models = listMiniMaxCatalogModels('llm')
    expect(models).toEqual(['MiniMax-M2.5', 'MiniMax-M2.5-highspeed'])
  })

  it('returns empty arrays for non-llm modalities', () => {
    expect(listMiniMaxCatalogModels('image')).toEqual([])
    expect(listMiniMaxCatalogModels('video')).toEqual([])
    expect(listMiniMaxCatalogModels('audio')).toEqual([])
  })

  it('does not register unrelated models', () => {
    ensureMiniMaxCatalogRegistered()

    expect(
      isOfficialModelRegistered({
        provider: 'minimax',
        modality: 'llm',
        modelId: 'unknown-model',
      }),
    ).toBe(false)
  })
})
