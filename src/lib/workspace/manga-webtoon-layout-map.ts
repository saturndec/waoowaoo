import type {
  QuickMangaColorMode,
  QuickMangaLayout,
  QuickMangaPreset,
} from '@/lib/novel-promotion/quick-manga'
import type { QuickMangaStyleLockProfile } from '@/lib/novel-promotion/quick-manga-contract'

export interface MangaPanelTemplateSpec {
  id: string
  sourceLayoutId: string
  sourceReferencePresetId: string
  title: string
  description: string
  values: {
    preset: QuickMangaPreset
    layout: QuickMangaLayout
    colorMode: QuickMangaColorMode
    styleLockEnabled: boolean
    styleLockProfile: QuickMangaStyleLockProfile
    styleLockStrength: number
  }
}

/**
 * VAT-132/VAT-133 usable P0 mapping slice.
 * Source artifact: docs/ux/vat-manga-webtoon-settings-layout-map-2026-03-11.json
 */
export const MANGA_PANEL_TEMPLATE_SPECS: MangaPanelTemplateSpec[] = [
  {
    id: 'webtoon-vertical',
    sourceLayoutId: 'anifun_t11',
    sourceReferencePresetId: 'anifun_preset_03_cat_cafe_jp',
    title: 'Webtoon Vertical Flow',
    description: 'Ưu tiên nhịp cuộn dọc và continuity mềm giữa các panel.',
    values: {
      preset: 'slice-of-life',
      layout: 'vertical-scroll',
      colorMode: 'full-color',
      styleLockEnabled: true,
      styleLockProfile: 'soft-tones',
      styleLockStrength: 0.65,
    },
  },
  {
    id: 'manga-page-classic',
    sourceLayoutId: 'anifun_t04',
    sourceReferencePresetId: 'anifun_preset_06_sexy_beauty_day',
    title: 'Manga Page Classic',
    description: 'Thiên về page-like layout, nét mực rõ và tương phản cao.',
    values: {
      preset: 'action-battle',
      layout: 'cinematic',
      colorMode: 'black-white',
      styleLockEnabled: true,
      styleLockProfile: 'ink-contrast',
      styleLockStrength: 0.78,
    },
  },
  {
    id: 'yonkoma-strip',
    sourceLayoutId: 'anifun_t10',
    sourceReferencePresetId: 'anifun_preset_01_school_romance',
    title: '4-koma Quick Strip',
    description: 'Chuỗi panel ngắn theo nhịp gag, phù hợp social preview.',
    values: {
      preset: 'comedy-4koma',
      layout: 'four-koma',
      colorMode: 'black-white',
      styleLockEnabled: true,
      styleLockProfile: 'line-consistent',
      styleLockStrength: 0.7,
    },
  },
]
