import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  parseImagePrompt,
  type LocationAssetWithImages,
  type PromptStageRuntime,
} from './hooks/usePromptStageActions'

interface PromptListCardViewProps {
  runtime: PromptStageRuntime
}
export default function PromptListCardView({ runtime }: PromptListCardViewProps) {
  const t = useTranslations('storyboard')
  const tCommon = useTranslations('common')

  const {
    shots,
    onGenerateImage,
    isBatchSubmitting,
    assetLibraryCharacters,
    assetLibraryLocations,
    styleLabel,
    editingPrompt,
    editValue,
    aiModifyInstruction,
    selectedAssets,
    showAssetPicker,
    aiModifyingShots,
    textareaRef,
    shotExtraAssets,
    getShotRunningState,
    isShotTaskRunning,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleModifyInstructionChange,
    handleSelectAsset,
    handleAiModify,
    handleEditValueChange,
    handleRemoveSelectedAsset,
    setPreviewImage,
  } = runtime

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {shots.map((shot) => {
        const shotRunningState = getShotRunningState(shot)
        const isEditing = editingPrompt?.shotId === shot.id && editingPrompt?.field === 'imagePrompt'
        const promptContent = shot.imagePrompt ? parseImagePrompt(shot.imagePrompt).content : ''

        return (
          <div key={shot.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="relative flex aspect-video items-center justify-center bg-muted">
              {shot.imageUrl ? (
                <MediaImageWithLoading
                  src={shot.imageUrl}
                  alt={`${t('panel.shot')}${shot.shotId}`}
                  containerClassName="w-full h-full"
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setPreviewImage(shot.imageUrl)}
                />
              ) : (
                <AppIcon name="video" className="h-16 w-16 text-muted-foreground" />
              )}
              <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
                #{shot.shotId}
              </div>
              {shot.imageUrl && (
                <Button
                  onClick={(event) => {
                    event.stopPropagation()
                    onGenerateImage(shot.id, shotExtraAssets[shot.id])
                  }}
                  disabled={isBatchSubmitting}
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-2 z-10 h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/75"
                  title={t('panel.regenerateImage')}
                >
                  <AppIcon name="refresh" className="h-4 w-4" />
                </Button>
              )}
              {isShotTaskRunning(shot) && <TaskStatusOverlay state={shotRunningState} />}
            </div>

            <div className="space-y-4 p-5">
              {shot.imagePrompt && (
                <div className="space-y-2 border-b pb-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm font-medium">
                      <AppIcon name="imageEdit" className="w-4 h-4" />
                      {styleLabel}
                    </Badge>
                  </div>

                  <div className="text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-base font-semibold text-foreground">{t('prompts.imagePrompt')}</span>
                      {!isEditing && (
                        <Button
                          onClick={() => handleStartEdit(shot.id, 'imagePrompt', shot.imagePrompt || '')}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={t('prompts.imagePrompt')}
                        >
                          <AppIcon name="edit" className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('prompts.currentPrompt')}</label>
                          <Textarea
                            value={editValue}
                            onChange={(event) => handleEditValueChange(event.target.value)}
                            className="w-full resize-none text-sm"
                            rows={4}
                            autoFocus
                          />
                        </div>

                        <div className="border-t pt-3">
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            {t('prompts.aiInstruction')} <span className="text-muted-foreground">{t('prompts.supportReference')}</span>
                          </label>
                          <div className="relative">
                            <Textarea
                              ref={textareaRef}
                              value={aiModifyInstruction}
                              onChange={(event) => handleModifyInstructionChange(event.target.value)}
                              placeholder={t('prompts.instructionPlaceholder')}
                              className="w-full resize-none text-sm"
                              rows={2}
                            />

                            {showAssetPicker && (
                              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                                <div className="p-2">
                                  <div className="mb-2 text-xs font-medium text-muted-foreground">{t('prompts.selectAsset')}</div>

                                  {assetLibraryCharacters.length > 0 && (
                                    <div className="mb-2">
                                      <div className="mb-1 text-xs text-muted-foreground">{t('prompts.character')}</div>
                                      {assetLibraryCharacters.map((character) => (
                                        <Button
                                          key={character.id}
                                          onClick={() => handleSelectAsset({ id: character.id, name: character.name, description: character.description, type: 'character' })}
                                          variant="ghost"
                                          className="h-8 w-full justify-start px-2 text-sm"
                                        >
                                          {character.name}
                                        </Button>
                                      ))}
                                    </div>
                                  )}

                                  {assetLibraryLocations.length > 0 && (
                                    <div>
                                      <div className="mb-1 text-xs text-muted-foreground">{t('prompts.location')}</div>
                                      {assetLibraryLocations.map((location) => {
                                        const locationAsset = location as LocationAssetWithImages
                                        const selectedImage = locationAsset.selectedImageId
                                          ? locationAsset.images?.find((image) => image.id === locationAsset.selectedImageId)
                                          : locationAsset.images?.find((image) => image.isSelected) || locationAsset.images?.find((image) => image.imageUrl) || locationAsset.images?.[0]
                                        const description = selectedImage?.description || locationAsset.description || ''

                                        return (
                                          <Button
                                            key={location.id}
                                            onClick={() => handleSelectAsset({ id: location.id, name: location.name, description, type: 'location' })}
                                            variant="ghost"
                                            className="h-8 w-full justify-start px-2 text-sm"
                                          >
                                            {location.name}
                                          </Button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {selectedAssets.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border bg-muted/50 p-2.5">
                              <div className="mb-1 w-full text-xs font-medium text-muted-foreground">{t('prompts.referencedAssets')}</div>
                              {selectedAssets.map((asset, index) => (
                                <Badge
                                  key={asset.id}
                                  variant={asset.type === 'character' ? 'outline' : 'secondary'}
                                  className="group gap-1.5 px-3 py-1.5 text-xs font-medium"
                                >
                                  <span>{asset.name}</span>
                                  <Button
                                    onClick={() => handleRemoveSelectedAsset(index, asset.name)}
                                    variant="ghost"
                                    size="icon"
                                    className="ml-0.5 h-4 w-4 rounded p-0"
                                    title={t('prompts.removeAsset')}
                                  >
                                    <AppIcon name="closeSolid" className="w-3 h-3" />
                                  </Button>
                                </Badge>
                              ))}
                            </div>
                          )}

                          <Button
                            onClick={handleAiModify}
                            disabled={editingPrompt ? aiModifyingShots.has(editingPrompt.shotId) || !aiModifyInstruction.trim() : true}
                            className="mt-2 w-full gap-2 text-sm font-medium"
                            title={t('prompts.aiModifyTip')}
                          >
                            {editingPrompt && aiModifyingShots.has(editingPrompt.shotId) ? (
                              <TaskStatusInline
                                state={resolveTaskPresentationState({ phase: 'processing', intent: 'modify', resource: 'text', hasOutput: true })}
                                className="[&>span]:text-primary-foreground [&_svg]:text-primary-foreground text-primary-foreground"
                              />
                            ) : (
                              t('prompts.aiModify')
                            )}
                          </Button>
                        </div>

                        <div className="flex gap-2 pt-2 border-t">
                          <Button
                            onClick={handleSaveEdit}
                            className="flex-1"
                          >
                            {t('prompts.save')}
                          </Button>
                          <Button
                            onClick={handleCancelEdit}
                            variant="secondary"
                            className="flex-1"
                          >
                            {tCommon('cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="leading-relaxed text-muted-foreground">{promptContent}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">SRT:</span>
                  <span className="text-foreground">{shot.srtStart}-{shot.srtEnd}</span>
                  <span className="text-muted-foreground">({shot.srtDuration?.toFixed(1)}s)</span>
                </div>
                {shot.scale && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">{t('panel.shotType')}</span>
                    <span className="text-foreground">{shot.scale}</span>
                  </div>
                )}
                {shot.locations && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">{t('panel.location')}</span>
                    <span className="text-foreground">{shot.locations}</span>
                  </div>
                )}
                {shot.module && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">{t('panel.mode')}</span>
                    <span className="text-foreground">{shot.module}</span>
                  </div>
                )}
              </div>

              <Button
                onClick={() => onGenerateImage(shot.id, shotExtraAssets[shot.id])}
                disabled={isShotTaskRunning(shot) || isBatchSubmitting}
                variant={shot.imageUrl ? 'secondary' : 'default'}
                className="w-full text-sm"
              >
                {shot.imageUrl ? t('group.hasSynced') : isShotTaskRunning(shot) ? (
                  <TaskStatusInline state={shotRunningState} className="justify-center text-primary-foreground [&>span]:text-primary-foreground [&_svg]:text-primary-foreground" />
                ) : t('assets.location.generateImage')}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
