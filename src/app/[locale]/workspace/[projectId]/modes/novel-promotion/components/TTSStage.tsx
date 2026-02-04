'use client'

import { useTranslations } from 'next-intl'
/**
 * 小说推文模式 - TTS生成阶段
 * 显示生成的音频和SRT字幕
 */

import { parseSRT } from '@/lib/srt'

interface TTSStageProps {
  audioUrl: string | null
  srtContent: string | null
  onRegenerateTTS: () => void
  onNextStep: () => void
  isRegenerating: boolean
  isAnalyzing: boolean
}

export default function TTSStage({
  audioUrl,
  srtContent,
  onRegenerateTTS,
  onNextStep,
  isRegenerating,
  isAnalyzing
}: TTSStageProps) {
  const t = useTranslations('voice')
  // 解析SRT获取统计信息
  const srtEntries = srtContent ? parseSRT(srtContent) : []
  const audioDuration = srtEntries.length > 0
    ? srtEntries[srtEntries.length - 1].endTime
    : '00:00:00,000'

  // 将SRT时间转换为秒
  const timeToSeconds = (timeStr: string): number => {
    const match = timeStr.match(/(\d+):(\d+):(\d+)[,.](\d+)/)
    if (!match) return 0
    const hours = parseInt(match[1])
    const minutes = parseInt(match[2])
    const seconds = parseInt(match[3])
    const milliseconds = parseInt(match[4])
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
  }

  const durationSeconds = timeToSeconds(audioDuration)

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* 左侧：音频播放器和统计信息 */}
      <div className="col-span-2 space-y-6">
        {/* 音频播放器 */}
        <div className="card-base p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {t("tts.generatedAudio")}
          </h2>
          {audioUrl ? (
            <div className="space-y-4">
              <audio controls className="w-full" src={audioUrl}>
                {t("tts.browserNotSupport")}
              </audio>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>{t("tts.audioDuration")} {Math.floor(durationSeconds / 60)}:{String(Math.floor(durationSeconds % 60)).padStart(2, '0')}</span>
                <span>{t("tts.subtitleCount")} {srtEntries.length}</span>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              {t("tts.noAudio")}
            </div>
          )}
        </div>

        {/* SRT字幕预览 */}
        <div className="card-base p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {t("tts.srtPreview")}
          </h2>
          {srtContent ? (
            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                {srtContent}
              </pre>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              {t("tts.noSubtitle")}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="space-y-6">
        {/* 统计卡片 */}
        <div className="card-base p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t("tts.stats")}
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("tts.audioDuration")}</span>
              <span className="text-sm font-medium text-gray-900">
                {Math.floor(durationSeconds / 60)}{t("tts.minute")}{Math.floor(durationSeconds % 60)}{t("tts.second")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("tts.subtitleCount")}</span>
              <span className="text-sm font-medium text-gray-900">
                {srtEntries.length} {t("tts.items")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("common.status")}</span>
              <span className="text-sm font-medium text-green-600">
                {t("tts.completed")}
              </span>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="card-base p-6 space-y-3">
          <button
            onClick={onRegenerateTTS}
            disabled={isRegenerating}
            className="btn-base w-full px-6 py-3 bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isRegenerating ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{t("tts.regenerating")}</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{t("tts.regenerateTTS")}</span>
              </>
            )}
          </button>

          <button
            onClick={onNextStep}
            disabled={!audioUrl || !srtContent || isAnalyzing}
            className="btn-base w-full px-6 py-3 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isAnalyzing ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{t("assets.stage.analyzing")}</span>
              </>
            ) : (
              <>
                <span>{t("tts.nextStep")}</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 text-center">
            {audioUrl && srtContent ? t("tts.readyTip") : t("tts.needGenerate")}
          </p>
        </div>
      </div>
    </div>
  )
}

