'use client'

/**
 * 小说推文模式 - 故事输入阶段 (Story View)
 * V3.2 UI: 极简版，专注剧本输入，资产管理移至资产库
 */

import { useTranslations } from 'next-intl'
import { useState, useRef, useEffect } from 'react'
import '@/styles/animations.css'
import { ART_STYLES, VIDEO_RATIOS } from '@/lib/constants'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon, RatioPreviewIcon } from '@/components/ui/icons'

/**
 * RatioIcon - 比例预览图标组件
 */
function RatioIcon({ ratio, size = 24, selected = false }: { ratio: string; size?: number; selected?: boolean }) {
  return <RatioPreviewIcon ratio={ratio} size={size} selected={selected} />
}

/**
 * RatioSelector - 比例选择下拉组件
 */
function RatioSelector({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find(o => o.value === value)

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 flex w-full items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          <RatioIcon ratio={value} size={20} selected />
          <span className="text-sm text-foreground font-medium">{selectedOption?.label || value}</span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 - 横向网格布局 */}
      {isOpen && (
        <div className="rounded-xl border border-border bg-card shadow-lg absolute z-50 mt-1 left-0 right-0 p-3 max-h-60 overflow-y-auto custom-scrollbar" style={{ minWidth: '280px' }}>
          <div className="grid grid-cols-5 gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted/70 transition-colors ${value === option.value
                  ? 'bg-primary/10 shadow-[0_0_0_1px_rgba(79,128,255,0.35)]'
                  : ''
                  }`}
              >
                <RatioIcon ratio={option.value} size={28} selected={value === option.value} />
                <span className={`text-xs ${value === option.value ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * StyleSelector - 视觉风格选择抽屉组件
 */
function StyleSelector({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; preview: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find(o => o.value === value) || options[0]

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 flex w-full items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{selectedOption.preview}</span>
          <span className="text-sm text-foreground font-medium">{selectedOption.label}</span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="rounded-xl border border-border bg-card shadow-lg absolute z-50 mt-1 left-0 right-0 p-3">
          <div className="grid grid-cols-2 gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`flex items-center gap-2 p-3 rounded-lg text-left transition-all ${value === option.value
                  ? 'bg-primary/10 text-primary shadow-[0_0_0_1px_rgba(79,128,255,0.35)]'
                  : 'hover:bg-muted text-muted-foreground'
                  }`}
              >
                <span className="text-lg">{option.preview}</span>
                <span className="font-medium text-sm">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface NovelInputStageProps {
  // 核心数据
  novelText: string
  // 当前剧集名称
  episodeName?: string
  // 回调函数
  onNovelTextChange: (value: string) => void
  onNext: () => void
  // 状态
  isSubmittingTask?: boolean
  isSwitchingStage?: boolean
  // 旁白开关
  enableNarration?: boolean
  onEnableNarrationChange?: (enabled: boolean) => void
  // 配置项 - 比例与风格
  videoRatio?: string
  artStyle?: string
  onVideoRatioChange?: (value: string) => void
  onArtStyleChange?: (value: string) => void
}

export default function NovelInputStage({
  novelText,
  episodeName,
  onNovelTextChange,
  onNext,
  isSubmittingTask = false,
  isSwitchingStage = false,
  enableNarration = false,
  onEnableNarrationChange,
  videoRatio = '9:16',
  artStyle = 'american-comic',
  onVideoRatioChange,
  onArtStyleChange
}: NovelInputStageProps) {
  const t = useTranslations('novelPromotion')
  const hasContent = novelText.trim().length > 0
  const stageSwitchingState = isSwitchingStage
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'text',
      hasOutput: false,
    })
    : null

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* 当前编辑剧集提示 - 顶部居中醒目显示 */}
      {episodeName && (
        <div className="text-center py-1">
          <div className="text-lg font-semibold text-foreground">
            {t("storyInput.currentEditing", { name: episodeName })}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{t("storyInput.editingTip")}</div>
        </div>
      )}

      {/* 主输入区域 */}
      <div className="rounded-xl border border-border bg-card shadow-md overflow-hidden">
        <div className="p-6">
          {/* 字数统计 */}
          <div className="flex items-center justify-end mb-3">
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground text-xs">
              {t("storyInput.wordCount")} {novelText.length}
            </span>
          </div>

          {/* 剧本输入框 */}
          <textarea
            value={novelText}
            onChange={(e) => onNovelTextChange(e.target.value)}
            placeholder={`请输入您的剧本或小说内容...

AI 将根据您的文本智能分析：
• 自动识别场景切换
• 提取角色对话和动作
• 生成分镜脚本

例如：
清晨，阳光透过窗帘洒进房间。小明揉着惺忪的睡眼从床上坐起，看了一眼床头的闹钟——已经八点了！他猛地跳下床，手忙脚乱地开始穿衣服...`}
            className="w-full rounded-md border border-input bg-background custom-scrollbar h-80 px-4 py-3 text-base resize-none placeholder:text-muted-foreground"
            disabled={isSubmittingTask || isSwitchingStage}
          />

          {/* 资产库引导提示 */}
          <div className="mt-5 p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl border border-border bg-muted/30 rounded-xl flex items-center justify-center flex-shrink-0">
                <AppIcon name="folderCards" className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-muted-foreground mb-1">{t("storyInput.assetLibraryTip.title")}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("storyInput.assetLibraryTip.description")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 画面比例与视觉风格配置 */}
      <div className="rounded-xl border border-border bg-card p-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 画面比例 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground tracking-[0.01em]">{t("storyInput.videoRatio")}</h3>
            <RatioSelector
              value={videoRatio}
              onChange={(value) => onVideoRatioChange?.(value)}
              options={VIDEO_RATIOS}
            />
          </div>

          {/* 视觉风格 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground tracking-[0.01em]">{t("storyInput.visualStyle")}</h3>
            <StyleSelector
              value={artStyle}
              onChange={(value) => onArtStyleChange?.(value)}
              options={ART_STYLES}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4 text-center">
          {t("storyInput.moreConfig")}
        </p>
      </div>

      {/* 旁白开关 + 操作按钮 */}
      <div className="rounded-xl border border-border bg-card p-6">
        {/* 旁白开关 */}
        {onEnableNarrationChange && (
          <div className="rounded-xl border border-border bg-muted/30 flex items-center justify-between p-4 rounded-xl mb-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">VO</span>
              <div>
                <div className="font-medium text-foreground">{t("storyInput.narration.title")}</div>
                <div className="text-xs text-muted-foreground">{t("storyInput.narration.description")}</div>
              </div>
            </div>
            <button
              onClick={() => onEnableNarrationChange(!enableNarration)}
              className={`relative w-14 h-8 rounded-full transition-colors ${enableNarration
                ? 'bg-primary'
                : 'bg-border'
                }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 bg-card rounded-full shadow-sm transition-transform ${enableNarration ? 'translate-x-6' : 'translate-x-0'
                  }`}
              />
            </button>
          </div>
        )}

        {/* 开始创作按钮 */}
        <button
          onClick={onNext}
          disabled={!hasContent || isSubmittingTask || isSwitchingStage}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 w-full py-4 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {isSwitchingStage ? (
            <TaskStatusInline state={stageSwitchingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
          ) : (
            <>
              <span>{t("smartImport.manualCreate.button")}</span>
              <AppIcon name="arrowRight" className="w-5 h-5" />
            </>
          )}
        </button>
        <p className="text-center text-xs text-muted-foreground mt-3">
          {hasContent ? t("storyInput.ready") : t("storyInput.pleaseInput")}
        </p>
      </div>
    </div>
  )
}
