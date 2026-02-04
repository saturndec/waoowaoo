/**
 * Mutations 模块导出
 */

// ==================== Asset Hub (全局资产) ====================
export {
    // 角色相关
    useGenerateCharacterImage,
    useSelectCharacterImage,
    useUndoCharacterImage,
    useUploadCharacterImage,
    useDeleteCharacter,
    useDeleteCharacterAppearance,
    useUploadCharacterVoice,
    // 场景相关
    useGenerateLocationImage,
    useSelectLocationImage,
    useUndoLocationImage,
    useUploadLocationImage,
    useDeleteLocation,
    // 音色相关
    useDeleteVoice,
    // 编辑相关
    useUpdateCharacterName,
    useUpdateLocationName,
} from './useAssetHubMutations'

// ==================== Project (项目资产) ====================
export {
    // 角色相关
    useGenerateProjectCharacterImage,
    useSelectProjectCharacterImage,
    useUndoProjectCharacterImage,
    useUploadProjectCharacterImage,
    useDeleteProjectCharacter,
    useDeleteProjectAppearance,
    useUpdateProjectCharacterName,
    useUploadProjectCharacterVoice,
    // 场景相关
    useGenerateProjectLocationImage,
    useSelectProjectLocationImage,
    useUndoProjectLocationImage,
    useUploadProjectLocationImage,
    useDeleteProjectLocation,
    useUpdateProjectLocationName,
    // 批量操作
    useBatchGenerateCharacterImages,
    useBatchGenerateLocationImages,
} from './useProjectMutations'
