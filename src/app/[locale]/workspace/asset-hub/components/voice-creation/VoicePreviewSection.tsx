import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import type { VoiceCreationRuntime } from './hooks/useVoiceCreation'

interface VoicePreviewSectionProps {
  runtime: VoiceCreationRuntime
}

export default function VoicePreviewSection({ runtime }: VoicePreviewSectionProps) {
  const {
    mode,
    voiceName,
    voicePrompt,
    previewText,
    isVoiceCreationSubmitting,
    isSaving,
    error,
    generatedVoices,
    selectedIndex,
    playingIndex,
    uploadFile,
    uploadPreviewUrl,
    isUploading,
    isDragging,
    fileInputRef,
    voiceCreationSubmittingState,
    uploadSubmittingState,
    tHub,
    tv,
    tvCreate,
    VOICE_PRESET_KEYS,
    setVoicePrompt,
    setPreviewText,
    setSelectedIndex,
    setUploadFile,
    setUploadPreviewUrl,
    handleGenerate,
    handlePlayVoice,
    handleSaveDesigned,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePlayUpload,
    handleSaveUploaded,
  } = runtime

  return (
    <>
      {mode === 'design' && (
        <>
          <div>
            <div className="text-sm text-muted-foreground mb-2">{tv('selectStyle')}</div>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_PRESET_KEYS.map((presetKey, idx) => {
                const prompt = tv(`presetsPrompts.${presetKey}` as Parameters<typeof tv>[0])
                return (
                  <button
                    key={idx}
                    onClick={() => setVoicePrompt(prompt)}
                    className={`inline-flex items-center justify-center px-2.5 py-1 text-xs rounded-md border transition-all ${voicePrompt === prompt
                      ? 'bg-primary/10 text-primary hover:bg-primary/15 border-primary/40'
                      : 'border border-border bg-muted/50 hover:bg-muted text-muted-foreground border-border hover:border-primary/40'
                      }`}
                  >
                    {tv(`presets.${presetKey}` as Parameters<typeof tv>[0])}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1">{tv('orCustomDescription')}</div>
            <textarea
              value={voicePrompt}
              onChange={(e) => setVoicePrompt(e.target.value)}
              placeholder={tv('describePlaceholder')}
              className="w-full rounded-md border border-input bg-background w-full px-3 py-2 text-sm resize-none"
              rows={2}
            />
          </div>

          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              {tv('editPreviewText')}
            </summary>
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder={tv('defaultPreviewText')}
              className="w-full rounded-md border border-input bg-background w-full mt-2 px-3 py-2 text-sm"
            />
          </details>

          {generatedVoices.length === 0 && !isVoiceCreationSubmitting && (
            <button
              onClick={handleGenerate}
              disabled={!voicePrompt.trim()}
              className="inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 w-full py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {tv('generate3Schemes')}
            </button>
          )}

          {isVoiceCreationSubmitting && (
            <div className="py-6">
              <TaskStatusInline
                state={voiceCreationSubmittingState}
                className="justify-center text-muted-foreground [&>span]:text-muted-foreground"
              />
            </div>
          )}

          {generatedVoices.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{tv('selectScheme')}</div>
              <div className="grid grid-cols-3 gap-2">
                {generatedVoices.map((voice, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedIndex(idx)}
                    className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${selectedIndex === idx
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border hover:border-primary/40'
                      }`}
                  >
                    <div className="text-sm font-medium text-foreground mb-2">{tv('schemeN', { n: idx + 1 })}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePlayVoice(idx)
                      }}
                      className={`w-10 h-10 mx-auto rounded-full inline-flex items-center justify-center flex items-center justify-center transition-all ${playingIndex === idx
                        ? 'bg-primary/10 text-primary hover:bg-primary/15 animate-pulse'
                        : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground'
                        }`}
                    >
                      {playingIndex === idx ? (
                        <AppIcon name="pause" className="w-4 h-4" />
                      ) : (
                        <AppIcon name="play" className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={isVoiceCreationSubmitting}
                  className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground flex-1 py-2 rounded-lg text-sm"
                >
                  {tv('regenerate')}
                </button>
                <button
                  onClick={handleSaveDesigned}
                  disabled={selectedIndex === null || isSaving || !voiceName.trim()}
                  className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex-1 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {isSaving ? tHub('modal.adding') : tHub('save')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'upload' && (
        <>
          {!uploadFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragging
                ? 'border-primary/40 bg-primary/10'
                : 'border-border hover:border-primary/40 hover:bg-muted'
                }`}
            >
              <div className="text-sm text-muted-foreground mb-2">{tvCreate('dropOrClick')}</div>
              <div className="text-xs text-muted-foreground">{tvCreate('supportedFormats')}</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
                className="hidden"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/30 border border-border rounded-xl p-4">
              <div className="text-sm font-medium text-foreground truncate">{uploadFile.name}</div>
              <button
                onClick={() => {
                  setUploadFile(null)
                  if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
                  setUploadPreviewUrl(null)
                }}
                className="inline-flex items-center justify-center border border-border bg-muted/50 hover:bg-muted p-1 mt-2"
              >
                ×
              </button>
              {uploadPreviewUrl && (
                <button
                  onClick={handlePlayUpload}
                  className="inline-flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/15 w-full py-2 rounded-lg text-sm font-medium mt-2"
                >
                  {tvCreate('previewAudio')}
                </button>
              )}
            </div>
          )}

          {uploadFile && (
            <button
              onClick={handleSaveUploaded}
              disabled={isUploading || !voiceName.trim()}
              className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 hover:bg-emerald-200 w-full py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <TaskStatusInline
                  state={uploadSubmittingState}
                  className="text-white [&>span]:text-white [&_svg]:text-white"
                />
              ) : (
                tHub('save')
              )}
            </button>
          )}
        </>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
    </>
  )
}
