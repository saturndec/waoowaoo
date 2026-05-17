import { describe, expect, it } from 'vitest'
import {
  buildModelCapabilityConfigPatch,
  ensureCapabilityDefaultsForModels,
} from '@/components/ui/config-modals/ConfigEditModal'

describe('config capability defaults', () => {
  it('writes visible model parameter defaults into capability overrides', () => {
    const result = ensureCapabilityDefaultsForModels({
      capabilityOverrides: {
        'ark::doubao-seedance-2-0-fast-260128': {
          resolution: '720p',
        },
      },
      targets: [
        {
          modelKey: 'ark::doubao-seedance-2-0-fast-260128',
          fields: [
            { field: 'generateAudio', label: 'Generate audio', options: [true, false] },
            { field: 'resolution', label: 'Resolution', options: ['480p', '720p'] },
          ],
        },
      ],
    })

    expect(result.changed).toBe(true)
    expect(result.capabilityOverrides).toEqual({
      'ark::doubao-seedance-2-0-fast-260128': {
        generateAudio: true,
        resolution: '720p',
      },
    })
  })

  it('does not rewrite complete model parameter selections', () => {
    const result = ensureCapabilityDefaultsForModels({
      capabilityOverrides: {
        'ark::doubao-seedance-2-0-fast-260128': {
          generateAudio: false,
          resolution: '480p',
        },
      },
      targets: [
        {
          modelKey: 'ark::doubao-seedance-2-0-fast-260128',
          fields: [
            { field: 'generateAudio', label: 'Generate audio', options: [true, false] },
            { field: 'resolution', label: 'Resolution', options: ['480p', '720p'] },
          ],
        },
      ],
    })

    expect(result.changed).toBe(false)
    expect(result.capabilityOverrides).toEqual({
      'ark::doubao-seedance-2-0-fast-260128': {
        generateAudio: false,
        resolution: '480p',
      },
    })
  })

  it('builds a single config patch when switching a model with missing parameters', () => {
    const result = buildModelCapabilityConfigPatch({
      configPatch: { sequenceVideoModel: 'fal::alibaba/happy-horse/image-to-video' },
      capabilityOverrides: {},
      modelKey: 'fal::alibaba/happy-horse/image-to-video',
      fields: [
        { field: 'resolution', label: 'Resolution', options: ['720p', '1080p'] },
      ],
    })

    expect(result.changed).toBe(true)
    expect(result.patch).toEqual({
      sequenceVideoModel: 'fal::alibaba/happy-horse/image-to-video',
      capabilityOverrides: {
        'fal::alibaba/happy-horse/image-to-video': {
          resolution: '720p',
        },
      },
    })
  })
})
