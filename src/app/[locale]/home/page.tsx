'use client'

/**
 * 首页 - 创作中心
 * 用户登录后的主入口页面：快速创作 + 最近项目
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon, IconGradientDefs } from '@/components/ui/icons'
import StoryInputComposer from '@/components/story-input/StoryInputComposer'
import TypewriterHero from '@/components/home/TypewriterHero'
import { ART_STYLES, VIDEO_RATIOS } from '@/lib/constants'
import { DEFAULT_STYLE_PRESET_VALUE, STYLE_PRESETS } from '@/lib/style-presets'
import { decodeStylePresetRef, encodeStylePresetRef } from '@/lib/style-preset/ref'
import type { StylePresetRef, StylePresetView } from '@/lib/style-preset/types'
import { Link, useRouter } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'
import { expandHomeStory } from '@/lib/home/ai-story-expand'
import {
  createHomeProjectLaunch,
  writeHomeAssistantAutoStartMessage,
} from '@/lib/home/create-project-launch'
import { formatDefaultProjectTimestamp } from '@/lib/projects/default-name'
import { HOME_QUICK_START_MIN_ROWS } from '@/lib/ui/textarea-height'
import AiWriteModal from '@/components/home/AiWriteModal'

interface ProjectStats {
  episodes: number
  images: number
  videos: number
  panels: number
  firstEpisodePreview: string | null
}

interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  stats?: ProjectStats
}

const RECENT_COUNT = 5
const DEFAULT_VISUAL_STYLE_REF: StylePresetRef = { presetSource: 'system', presetId: 'american-comic' }

function readStylePresetList(value: unknown): StylePresetView[] {
  if (!value || typeof value !== 'object') return []
  const presets = (value as { presets?: unknown }).presets
  if (!Array.isArray(presets)) return []
  return presets.filter((preset): preset is StylePresetView => {
    if (!preset || typeof preset !== 'object') return false
    const record = preset as { id?: unknown; kind?: unknown; name?: unknown }
    return typeof record.id === 'string'
      && (record.kind === 'visual_style' || record.kind === 'director_style')
      && typeof record.name === 'string'
  })
}

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('home')
  const tc = useTranslations('common')

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const [videoRatio, setVideoRatio] = useState('9:16')
  const [artStyle, setArtStyle] = useState('american-comic')
  const [visualStyleValue, setVisualStyleValue] = useState(encodeStylePresetRef(DEFAULT_VISUAL_STYLE_REF))
  const [stylePresetValue, setStylePresetValue] = useState<string>(DEFAULT_STYLE_PRESET_VALUE)
  const [userStylePresets, setUserStylePresets] = useState<StylePresetView[]>([])
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [aiWriteOpen, setAiWriteOpen] = useState(false)
  const [aiWriteLoading, setAiWriteLoading] = useState(false)

  // 鉴权
  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push({ pathname: '/auth/signin' })
    }
  }, [session, status, router])

  // 获取最近项目
  const fetchRecentProjects = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: '1',
        pageSize: RECENT_COUNT.toString(),
      })
      const response = await apiFetch(`/api/projects?${params}`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects)
      }
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) {
      void fetchRecentProjects()
    }
  }, [session, fetchRecentProjects])

  const fetchUserStylePresets = useCallback(async () => {
    const response = await apiFetch('/api/user/style-presets')
    if (!response.ok) return
    const data = await response.json() as unknown
    setUserStylePresets(readStylePresetList(data))
  }, [])

  useEffect(() => {
    if (session) {
      void fetchUserStylePresets()
    }
  }, [session, fetchUserStylePresets])

  // 创建项目并跳转
  const handleCreate = async () => {
    if (!inputValue.trim() || createLoading) return
    setCreateError(null)
    setCreateLoading(true)
    try {
      const storyText = inputValue.trim()
      const result = await createHomeProjectLaunch({
        apiFetch,
        projectName: t('defaultProjectName', {
          timestamp: formatDefaultProjectTimestamp(new Date()),
        }),
        storyText,
        videoRatio,
        artStyle,
        visualStylePreset: decodeStylePresetRef(visualStyleValue),
        directorStylePreset: stylePresetValue ? decodeStylePresetRef(stylePresetValue) : null,
        episodeName: `${tc('episode')} 1`,
      })

      writeHomeAssistantAutoStartMessage({
        projectId: result.projectId,
        episodeId: result.episodeId,
        message: storyText,
      })
      router.push(result.target)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('createFailed')
      setCreateError(message)
    } finally {
      setCreateLoading(false)
    }
  }

  // AI 帮我写 — 直接生成文本并回填首页输入框
  const handleAiWriteStart = async (prompt: string) => {
    if (aiWriteLoading) return
    setAiWriteLoading(true)
    try {
      const result = await expandHomeStory({
        apiFetch,
        prompt,
      })

      setInputValue(result.expandedText)
      setAiWriteOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed'
      window.alert(message)
    } finally {
      setAiWriteLoading(false)
    }
  }

  // 比例选项（带推荐标签）
  const ratioOptions = useMemo(
    () => VIDEO_RATIOS.map((r) => ({ ...r, recommended: r.value === '9:16' })),
    []
  )

  // 风格选项（带推荐标签）
  const styleOptions = useMemo(
    () => [
      ...ART_STYLES.map((s) => ({
        value: encodeStylePresetRef({ presetSource: 'system', presetId: s.value }),
        label: s.label,
        recommended: s.value === 'realistic',
      })),
      ...userStylePresets
        .filter((preset) => preset.kind === 'visual_style')
        .map((preset) => ({
          value: encodeStylePresetRef({ presetSource: 'user', presetId: preset.id }),
          label: preset.name,
        })),
    ],
    [userStylePresets]
  )
  const directorStyleOptions = useMemo(() => {
    const disabledPreset = STYLE_PRESETS.find((preset) => preset.value === '')
    if (!disabledPreset) throw new Error('director style disabled preset is missing')
    return [
      {
        value: '',
        label: disabledPreset.label,
        description: disabledPreset.description,
      },
      ...STYLE_PRESETS
        .filter((preset) => preset.value)
        .map((preset) => ({
          value: encodeStylePresetRef({ presetSource: 'system', presetId: preset.value }),
          label: preset.label,
          description: preset.description,
        })),
      ...userStylePresets
        .filter((preset) => preset.kind === 'director_style')
        .map((preset) => ({
          value: encodeStylePresetRef({ presetSource: 'user', presetId: preset.id }),
          label: preset.name,
          description: preset.summary ?? '',
        })),
    ]
  }, [userStylePresets])
  // 时间格式化
  const formatTimeAgo = (dateString: string): string => {
    const diffMs = Date.now() - new Date(dateString).getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffMinutes < 1) return t('ago.justNow')
    if (diffMinutes < 60) return t('ago.minutesAgo', { n: diffMinutes })
    if (diffHours < 24) return t('ago.hoursAgo', { n: diffHours })
    return t('ago.daysAgo', { n: diffDays })
  }

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  return (
    <div className="glass-page min-h-screen">
      <Navbar />

      {/* 自定义呼吸动画 */}
      <style>{`
        @keyframes breathe-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          25% { transform: translate(30px, -20px) scale(1.15); opacity: 0.7; }
          50% { transform: translate(-20px, 15px) scale(0.95); opacity: 0.4; }
          75% { transform: translate(15px, 25px) scale(1.1); opacity: 0.65; }
        }
        @keyframes breathe-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.45; }
          30% { transform: translate(-25px, 20px) scale(1.2); opacity: 0.7; }
          60% { transform: translate(20px, -15px) scale(0.9); opacity: 0.35; }
          80% { transform: translate(-10px, -25px) scale(1.05); opacity: 0.6; }
        }
        @keyframes breathe-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1.05); opacity: 0.4; }
          20% { transform: translate(20px, 15px) scale(0.9); opacity: 0.55; }
          45% { transform: translate(-15px, -20px) scale(1.15); opacity: 0.7; }
          70% { transform: translate(10px, -10px) scale(1); opacity: 0.35; }
        }
        @keyframes home-hero-focus-rack-text {
          0%, 70%, 100% { filter: blur(0px); opacity: 1; }
          75% { filter: blur(3px); opacity: 0.85; }
          80% { filter: blur(1.5px); opacity: 0.9; }
          85% { filter: blur(0.5px); opacity: 0.95; }
          88% { filter: blur(1px); opacity: 0.92; }
          92% { filter: blur(0px); opacity: 1; }
        }
        @keyframes home-hero-focus-rack-frame {
          0%, 70%, 100% {
            opacity: 0.24;
            filter: blur(0px);
            transform: scale(1);
            box-shadow: 0 0 0 rgba(255, 255, 255, 0);
          }
          75% {
            opacity: 0.7;
            filter: blur(2px);
            transform: scale(1.04);
            box-shadow: 0 0 14px rgba(255, 255, 255, 0.18);
          }
          80% {
            opacity: 0.58;
            filter: blur(1px);
            transform: scale(1.02);
            box-shadow: 0 0 10px rgba(255, 255, 255, 0.12);
          }
          85% {
            opacity: 0.5;
            filter: blur(0.5px);
            transform: scale(1.01);
            box-shadow: 0 0 6px rgba(255, 255, 255, 0.08);
          }
          88% {
            opacity: 0.56;
            filter: blur(0.75px);
            transform: scale(1.02);
            box-shadow: 0 0 8px rgba(255, 255, 255, 0.1);
          }
          92% {
            opacity: 0.24;
            filter: blur(0px);
            transform: scale(1);
            box-shadow: 0 0 0 rgba(255, 255, 255, 0);
          }
        }
        @keyframes home-hero-focus-rack-rec {
          0%, 70%, 100% {
            opacity: 0.58;
            filter: blur(0px);
            transform: scale(1);
          }
          75% {
            opacity: 1;
            filter: blur(1.5px);
            transform: scale(1.06);
          }
          80% {
            opacity: 0.9;
            filter: blur(0.8px);
            transform: scale(1.03);
          }
          85% {
            opacity: 0.78;
            filter: blur(0.35px);
            transform: scale(1.01);
          }
          88% {
            opacity: 0.86;
            filter: blur(0.6px);
            transform: scale(1.02);
          }
          92% {
            opacity: 0.58;
            filter: blur(0px);
            transform: scale(1);
          }
        }
      `}</style>

      <main className="flex flex-col items-center pt-[13vh] pb-12 px-4 max-w-5xl mx-auto w-full">

        {/* ─── 取景器整体包裹：标题 + 输入框 ─── */}
        <div className="w-full relative p-5 [--home-hero-focus-rack-duration:8s]">
          {/* 四角校准线 */}
          <span
            data-home-focus-corner="top-left"
            className="absolute top-0 left-0 w-5 h-5 border-t border-l border-[var(--glass-text-primary)] pointer-events-none z-10"
            style={{ animation: 'home-hero-focus-rack-frame var(--home-hero-focus-rack-duration) ease-in-out infinite' }}
          />
          <span
            data-home-focus-corner="top-right"
            className="absolute top-0 right-0 w-5 h-5 border-t border-r border-[var(--glass-text-primary)] pointer-events-none z-10"
            style={{ animation: 'home-hero-focus-rack-frame var(--home-hero-focus-rack-duration) ease-in-out infinite' }}
          />
          <span
            data-home-focus-corner="bottom-left"
            className="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-[var(--glass-text-primary)] pointer-events-none z-10"
            style={{ animation: 'home-hero-focus-rack-frame var(--home-hero-focus-rack-duration) ease-in-out infinite' }}
          />
          <span
            data-home-focus-corner="bottom-right"
            className="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-[var(--glass-text-primary)] pointer-events-none z-10"
            style={{ animation: 'home-hero-focus-rack-frame var(--home-hero-focus-rack-duration) ease-in-out infinite' }}
          />

          {/* REC 录制指示灯 */}
          <span
            data-home-focus-rec="true"
            className="absolute top-2 right-7 flex items-center gap-1 z-10"
            style={{ animation: 'home-hero-focus-rack-rec var(--home-hero-focus-rack-duration) ease-in-out infinite' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.7)]" />
            <span className="text-[8px] font-mono font-bold tracking-widest text-red-500/70">REC</span>
          </span>

          {/* 标题区 */}
          <TypewriterHero
            title={t('title')}
            subtitle={t('subtitle')}
            focusAnimation="home-hero-focus-rack-text var(--home-hero-focus-rack-duration) ease-in-out infinite"
            subtitleAnimation="home-hero-focus-rack-text var(--home-hero-focus-rack-duration) ease-in-out infinite"
          />

          {/* 呼吸光晕 + 输入区域 */}
          <div className="w-full relative group">
            <div
              className="absolute -inset-10 rounded-[48px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 80% 60% at 30% 40%, rgba(6, 182, 212, 0.4), transparent 70%)',
                animation: 'breathe-drift-1 8s ease-in-out infinite',
                filter: 'blur(30px)',
              }}
            />
            <div
              className="absolute -inset-10 rounded-[48px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 80% at 70% 60%, rgba(139, 92, 246, 0.35), transparent 70%)',
                animation: 'breathe-drift-2 10s ease-in-out infinite',
                filter: 'blur(35px)',
              }}
            />
            <div
              className="absolute -inset-12 rounded-[56px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59, 130, 246, 0.3), transparent 70%)',
                animation: 'breathe-drift-3 12s ease-in-out infinite',
                filter: 'blur(40px)',
              }}
            />

            <StoryInputComposer
              value={inputValue}
              onValueChange={(nextValue) => {
                setInputValue(nextValue)
                if (createError) {
                  setCreateError(null)
                }
              }}
              placeholder={t('inputPlaceholder')}
              minRows={HOME_QUICK_START_MIN_ROWS}
              textareaClassName="px-0 pt-0 pb-3 align-top"
              videoRatio={videoRatio}
              onVideoRatioChange={setVideoRatio}
              ratioOptions={ratioOptions}
              artStyle={visualStyleValue}
              onArtStyleChange={(value) => {
                setVisualStyleValue(value)
                const ref = decodeStylePresetRef(value)
                if (ref.presetSource === 'system') {
                  setArtStyle(ref.presetId)
                }
              }}
              styleOptions={styleOptions}
              stylePresetValue={stylePresetValue}
              onStylePresetChange={setStylePresetValue}
              stylePresetOptions={directorStyleOptions}
              primaryAction={(
                <button
                  onClick={() => void handleCreate()}
                  disabled={!inputValue.trim() || createLoading}
                  className="glass-btn-base glass-btn-primary h-10 flex-shrink-0 px-5 text-sm disabled:opacity-50"
                >
                  {createLoading ? tc('loading') : t('startCreation')}
                  <AppIcon name="arrowRight" className="w-4 h-4" />
                </button>
              )}
              secondaryActions={(
                <button
                  onClick={() => setAiWriteOpen(true)}
                  disabled={createLoading}
                  className="glass-btn-base flex h-10 flex-shrink-0 items-center gap-1.5 border border-[var(--glass-stroke-strong)] px-3 text-sm transition-all hover:border-[var(--glass-tone-info-fg)]/40"
                >
                  <AppIcon name="sparkles" className="w-4 h-4 text-[#7c3aed]" />
                  <span
                    className="font-medium"
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {t('aiWrite.trigger')}
                  </span>
                </button>
              )}
              footer={createError ? (
                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                  {createError}
                </p>
              ) : null}
            />
          </div>
        </div>
        {/* AI 帮我写模态框 */}
        <AiWriteModal
          open={aiWriteOpen}
          loading={aiWriteLoading}
          onClose={() => setAiWriteOpen(false)}
          onStart={(prompt) => void handleAiWriteStart(prompt)}
          t={(key: string) => t(`aiWrite.${key}`)}
        />
      </main>

      {/* 最近项目 */}
      <section className="px-4 sm:px-6 lg:px-10 pb-8 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[var(--glass-text-secondary)]">{t('recentProjects')}</h2>
          <Link
            href={{ pathname: '/workspace' }}
            className="text-xs text-[var(--glass-tone-info-fg)] hover:underline font-medium"
          >
            {t('viewAll')}
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-surface p-5 animate-pulse">
                <div className="h-4 bg-[var(--glass-bg-muted)] rounded mb-3" />
                <div className="h-3 bg-[var(--glass-bg-muted)] rounded mb-2" />
                <div className="h-3 bg-[var(--glass-bg-muted)] rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-[var(--glass-bg-muted)] rounded-xl flex items-center justify-center mx-auto mb-3">
              <AppIcon name="folderCards" className="w-6 h-6 text-[var(--glass-text-tertiary)]" />
            </div>
            <p className="text-sm text-[var(--glass-text-tertiary)]">{t('noProjects')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={{ pathname: `/workspace/${project.id}` }}
                className="glass-surface cursor-pointer group hover:border-[var(--glass-tone-info-fg)]/40 transition-all duration-300 overflow-hidden relative block"
              >
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="p-5 relative z-10">
                  <h3 className="text-sm font-bold text-[var(--glass-text-primary)] mb-2 group-hover:text-[var(--glass-tone-info-fg)] transition-colors line-clamp-1">
                    {project.name}
                  </h3>
                  {(project.description || project.stats?.firstEpisodePreview) && (
                    <div className="flex items-start gap-2 mb-3">
                      <AppIcon name="fileText" className="w-3.5 h-3.5 text-[var(--glass-text-tertiary)] mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-[var(--glass-text-secondary)] line-clamp-2 leading-relaxed">
                        {project.description || project.stats?.firstEpisodePreview}
                      </p>
                    </div>
                  )}
                  {project.stats && (project.stats.episodes > 0 || project.stats.images > 0 || project.stats.videos > 0) && (
                    <div className="flex items-center gap-2 mb-3">
                      <IconGradientDefs className="w-0 h-0 absolute" aria-hidden="true" />
                      <AppIcon name="statsBarGradient" className="w-4 h-4 flex-shrink-0" />
                      <div className="flex items-center gap-3 text-sm font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                        {project.stats.episodes > 0 && (
                          <span className="flex items-center gap-1">
                            <AppIcon name="statsEpisodeGradient" className="w-3.5 h-3.5" />
                            {project.stats.episodes}
                          </span>
                        )}
                        {project.stats.images > 0 && (
                          <span className="flex items-center gap-1">
                            <AppIcon name="statsImageGradient" className="w-3.5 h-3.5" />
                            {project.stats.images}
                          </span>
                        )}
                        {project.stats.videos > 0 && (
                          <span className="flex items-center gap-1">
                            <AppIcon name="statsVideoGradient" className="w-3.5 h-3.5" />
                            {project.stats.videos}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-[var(--glass-text-tertiary)]">
                    <AppIcon name="clock" className="w-3 h-3" />
                    {formatTimeAgo(project.updatedAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
