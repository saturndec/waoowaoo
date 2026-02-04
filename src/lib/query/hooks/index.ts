/**
 * React Query Hooks 统一导出
 * 
 * 使用示例：
 * import { useProjectAssets, useGenerateProjectCharacterImage } from '@/lib/query/hooks'
 */

// 中心资产库
export {
    useGlobalCharacters,
    useGlobalLocations,
    useGlobalVoices,
    useGlobalFolders,
    useGenerateCharacterImage,
    useGenerateLocationImage,
    useModifyCharacterImage,
    useModifyLocationImage,
    useCreateFolder,
    useUpdateFolder,
    useDeleteFolder,
    useRefreshGlobalAssets,
    type GlobalCharacter,
    type GlobalCharacterAppearance,
    type GlobalLocation,
    type GlobalLocationImage,
    type GlobalVoice,
    type GlobalFolder,
} from './useGlobalAssets'

// 项目资产
export {
    useProjectAssets,
    useProjectCharacters,
    useProjectLocations,
    useGenerateProjectCharacterImage,
    useGenerateProjectLocationImage,
    useModifyProjectCharacterImage,
    useModifyProjectLocationImage,
    useRegenerateCharacterGroup,
    useRegenerateSingleCharacterImage,
    useRegenerateLocationGroup,
    useRegenerateSingleLocationImage,
    useUndoAssetImage,
    useSelectImage,
    useDeleteCharacter,
    useDeleteLocation,
    useRefreshProjectAssets,
    type Character,
    type CharacterAppearance,
    type Location,
    type LocationImage,
    type ProjectAssetsData,
} from './useProjectAssets'

// 分镜
export {
    useStoryboards,
    useRegeneratePanelImage,
    useModifyPanelImage,
    useGenerateVideo,
    useBatchGenerateVideos,
    useSelectPanelCandidate,
    useRefreshStoryboards,
    type StoryboardPanel,
    type StoryboardGroup,
    type StoryboardData,
    type PanelCandidate,
} from './useStoryboards'

// 语音
export {
    useVoiceLines,
    useGenerateVoice,
    useBatchGenerateVoices,
    useUpdateVoiceText,
    useRefreshVoiceLines,
    type VoiceLine,
    type VoiceLinesData,
} from './useVoiceLines'

// 轮询
export {
    useTaskPolling,
    useTriggerPoll,
} from './useTaskPolling'

// 项目数据
export {
    useProjectData,
    useRefreshProjectData,
    useEpisodeData,
    useEpisodes,
    useRefreshEpisodeData,
    useRefreshAll,
    type Episode,
} from './useProjectData'

// 取消生成
export {
    useCancelGeneration,
    type CancelType,
} from './useCancelGeneration'
