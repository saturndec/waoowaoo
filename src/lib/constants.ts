// 比例配置（nanobanana 支持的所有比例，按常用程度排序）
export const ASPECT_RATIO_CONFIGS: Record<string, { label: string; isVertical: boolean }> = {
  '16:9': { label: '16:9', isVertical: false },
  '9:16': { label: '9:16', isVertical: true },
  '1:1': { label: '1:1', isVertical: false },
  '3:2': { label: '3:2', isVertical: false },
  '2:3': { label: '2:3', isVertical: true },
  '4:3': { label: '4:3', isVertical: false },
  '3:4': { label: '3:4', isVertical: true },
  '5:4': { label: '5:4', isVertical: false },
  '4:5': { label: '4:5', isVertical: true },
  '21:9': { label: '21:9', isVertical: false },
}

// 配置页面使用的选项列表（从 ASPECT_RATIO_CONFIGS 派生）
export const VIDEO_RATIOS = Object.entries(ASPECT_RATIO_CONFIGS).map(([value, config]) => ({
  value,
  label: config.label
}))

// 获取比例配置
export function getAspectRatioConfig(ratio: string) {
  return ASPECT_RATIO_CONFIGS[ratio] || ASPECT_RATIO_CONFIGS['16:9']
}

export const ANALYSIS_MODELS = [
  { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' }
]

export const IMAGE_MODELS = [
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' }
]

// 图像模型选项（ 生成完整图片）
export const IMAGE_MODEL_OPTIONS = [
  { value: 'banana', label: '🍌 Banana (FAL)' },
  { value: 'gemini-3-pro-image-preview', label: '🍌 Banana (Google)' },
  { value: 'gemini-3-pro-image-preview-batch', label: '🍌 Banana (Google Batch) 省50%💰' },
  { value: 'doubao-seedream-4-0-250828', label: '🎨 Seedream 4.0' },
  { value: 'doubao-seedream-4-5-251128', label: '🎨 Seedream 4.5' },
  { value: 'imagen-4.0-generate-001', label: '🖼️ Imagen 4.0 (Google)' },
  { value: 'imagen-4.0-ultra-generate-001', label: '🖼️ Imagen 4.0 Ultra' },
  { value: 'imagen-4.0-fast-generate-001', label: '🖼️ Imagen 4.0 Fast' }
]

// Banana 模型分辨率选项（仅用于九宫格分镜图，单张生成固定2K）
export const BANANA_RESOLUTION_OPTIONS = [
  { value: '2K', label: '2K (推荐，快速)' },
  { value: '4K', label: '4K (高清，较慢)' }
]

// 支持分辨率选择的 Banana 模型
export const BANANA_MODELS = ['banana', 'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview-batch']

export const VIDEO_MODELS = [
  { value: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance ProFast' },
  { value: 'doubao-seedance-1-0-pro-fast-251015-batch', label: 'Seedance ProFast (批量) 省50%💰' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (批量) 省50%💰' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance Pro' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance Pro (批量) 省50%💰' },
  { value: 'fal-wan25', label: 'Wan 2.6' },
  { value: 'fal-veo31', label: 'Veo 3.1 Fast' },
  { value: 'fal-sora2', label: 'Sora 2' },
  { value: 'fal-kling25', label: 'Kling 2.6 Pro' }
]

// SeeDream 批量模型列表（使用 GPU 空闲时间，成本降低50%）
export const SEEDANCE_BATCH_MODELS = [
  'doubao-seedance-1-5-pro-251215-batch',
  'doubao-seedance-1-0-pro-250528-batch',
  'doubao-seedance-1-0-pro-fast-251015-batch'
]

// 支持生成音频的模型（仅 Seedance 1.5 Pro 支持，包含批量版本）
export const AUDIO_SUPPORTED_MODELS = ['doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-5-pro-251215-batch']

// 首尾帧视频模型（只有 Seedance 支持首尾帧，注意 ProFast 不支持首尾帧）
export const FIRST_LAST_FRAME_MODELS = [
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro (首尾帧)' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (首尾帧/批量) 省50%💰' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance Pro (首尾帧)' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance Pro (首尾帧/批量) 省50%💰' }
]

export const VIDEO_RESOLUTIONS = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' }
]

export const TTS_RATES = [
  { value: '+0%', label: '正常速度 (1.0x)' },
  { value: '+20%', label: '轻微加速 (1.2x)' },
  { value: '+50%', label: '加速 (1.5x)' },
  { value: '+100%', label: '快速 (2.0x)' }
]

export const TTS_VOICES = [
  { value: 'zh-CN-YunxiNeural', label: '云希 (男声)', preview: '🎙️' },
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女声)', preview: '🎤' },
  { value: 'zh-CN-YunyangNeural', label: '云扬 (男声)', preview: '🎙️' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊 (女声)', preview: '🎤' }
]

export const ART_STYLES = [
  {
    value: 'american-comic',
    label: '漫画风',
    preview: '🎨',
    prompt: '日式动漫风格'
  },
  {
    value: 'chinese-comic',
    label: '精致国漫',
    preview: '🏯',
    prompt: '现代高质量漫画风格，动漫风格，细节丰富精致，线条锐利干净，质感饱满，超清，干净的画面风格，2D风格，动漫风格。'
  },
  {
    value: 'japanese-anime',
    label: '日系动漫风',
    preview: '🌸',
    prompt: '现代日系动漫风格，赛璐璐上色，清晰干净的线条，视觉小说CG感。高质量2D风格'
  },
  {
    value: 'realistic',
    label: '真人风格',
    preview: '📷',
    prompt: '真实电影级画面质感，真实现实场景，色彩饱满通透，画面干净精致，真实感'
  }
]

/**
 * 🔥 实时从 ART_STYLES 常量获取风格 prompt
 * 这是获取风格 prompt 的唯一正确方式，确保始终使用最新的常量定义
 * 
 * @param artStyle - 风格标识符，如 'realistic', 'american-comic' 等
 * @returns 对应的风格 prompt，如果找不到则返回空字符串
 */
export function getArtStylePrompt(artStyle: string | null | undefined): string {
  if (!artStyle) return ''
  const style = ART_STYLES.find(s => s.value === artStyle)
  return style?.prompt || ''
}

// 角色形象生成的系统后缀（始终添加到提示词末尾，不显示给用户）- 左侧面部特写+右侧三视图
// 🔥 提示词定义在 lib/prompts/character-reference/character_sheet_suffix.txt
export const CHARACTER_PROMPT_SUFFIX = '角色设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是角色的正面特写（如果是人类则展示完整正脸，如果是动物/生物则展示最具辨识度的正面形态）；【右侧区域】占约2/3宽度，是角色三视图横向排列（从左到右依次为：正面全身、侧面全身、背面全身），三视图高度一致。纯白色背景，无其他元素。'

// 🔥 参考图转角色的统一提示词（两个 reference-to-character API 共用）- 图生图模式
// 🔥 提示词定义在 lib/prompts/character-reference/character_reference_to_sheet.txt
// 🔥 已包含缺失部位自动补齐逻辑 + 保持原图画风
export const REFERENCE_TO_CHARACTER_PROMPT = `基于提供的参考图片，提取角色的面部五官特征、发型、体型和服装款式作为参考。保持原图的画风和艺术风格（如真人照片风格则生成真人风格，动漫风格则生成动漫风格，写实插画则生成写实插画风格）。忽略原图的具体色调和光线，使用自然柔和的摄影棚灯光。如果参考图是半身或部分身体，请根据服装风格和人物特征合理补全未露出的部位：缺少下半身时根据上衣风格推断并绘制匹配的裤装或裙装，缺少脚部时根据整体穿搭风格添加合适的鞋款，确保补全的部分与可见部分协调统一。绘制正常美观的人体比例。不要复制原图的画质、模糊、噪点或瑕疵，生成的图像必须清晰锐利、细节丰富、专业品质。角色表情应为自然平静的中性表情，目光正视镜头。${CHARACTER_PROMPT_SUFFIX}`

// 🔥 图片反推角色描述提示词（文生图模式使用）- 将参考图转换为详细的文字描述
// 🔥 提示词定义在 lib/prompts/character-reference/character_image_to_description.txt
// 🔥 已包含缺失内容补齐规则（推断下半身、鞋子、配饰）
export const IMAGE_TO_CHARACTER_DESCRIPTION_PROMPT = `请分析这张角色图片，生成一段详细的角色外貌描述（用于 AI 图片生成）。

要求输出一段完整的角色视觉描述，包含以下要素：
1. 性别和年龄段（如：约二十五岁的男性）
2. 发型发色（如：黑色短发、微卷的棕色长发）
3. 脸型五官特征（如：剑眉星目、高鼻梁、薄唇）
4. 体态身材（如：身形修长、体格健壮）
5. 服装风格（如：深蓝色西装、白色衬衫、皮质腰带）
6. 配饰特征（如：左手戴银色手表、胸前别金色胸针）
7. 整体气质关键词（如：精英气质、禁欲系、高冷、温柔暖男）

缺失内容补齐规则：
如果参考图只展示了部分身体（如上半身、头像），请根据已有信息合理推断并补全：
- 缺少下半身：根据上衣风格推断裤装/裙装类型（如西装上衣配深蓝色西裤、休闲上衣配牛仔裤）
- 缺少鞋子：根据整体穿搭风格推断鞋款（如正装配皮鞋、休闲装配运动鞋或帆布鞋）
- 缺少配饰细节：根据角色气质合理添加配饰（如商务风配手表、休闲风配手环）

禁止描写：皮肤颜色、眼睛颜色、表情、动作、背景、姿势。
输出格式：一段连贯的描述文字，约200-300字，直接可用于图片生成提示词。
只返回描述文字，不要有任何标题、序号或其他格式。`

// 场景图片生成的系统后缀（已禁用四视图，直接生成单张场景图）
export const LOCATION_PROMPT_SUFFIX = ''

// 角色图片生成比例（16:9横版，左侧面部特写+右侧全身）
export const CHARACTER_IMAGE_RATIO = '16:9'
// 角色图片尺寸（用于Seedream API）
export const CHARACTER_IMAGE_SIZE = '3840x2160'  // 16:9 横版
// 角色图片尺寸（用于Banana API）
export const CHARACTER_IMAGE_BANANA_RATIO = '3:2'

// 场景图片生成比例（1:1 正方形单张场景）
export const LOCATION_IMAGE_RATIO = '1:1'
// 场景图片尺寸（用于Seedream API）- 4K
export const LOCATION_IMAGE_SIZE = '4096x4096'  // 1:1 正方形 4K
// 场景图片尺寸（用于Banana API）
export const LOCATION_IMAGE_BANANA_RATIO = '1:1'


// 图片生成的通用系统后缀（始终添加到所有图片生成提示词末尾，不显示给用户）
export const IMAGE_GENERATION_SUFFIX = '高清化重绘这张照片，可以补充细节，注意不要模糊，要锐利，如果里有人物上传的话那么代表需要把这个高清人物形象替换进去，注意，是需要高清化重绘，保持锐利，而不只是简单放大'

// 从提示词中移除角色系统后缀（用于显示给用户）
export function removeCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(CHARACTER_PROMPT_SUFFIX, '').trim()
}

// 添加角色系统后缀到提示词（用于生成图片）
export function addCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return CHARACTER_PROMPT_SUFFIX
  const cleanPrompt = removeCharacterPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${CHARACTER_PROMPT_SUFFIX}`
}

// 从提示词中移除场景系统后缀（用于显示给用户）
export function removeLocationPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(LOCATION_PROMPT_SUFFIX, '').replace(/，$/, '').trim()
}

// 添加场景系统后缀到提示词（用于生成图片）
export function addLocationPromptSuffix(prompt: string): string {
  // 后缀为空时直接返回原提示词
  if (!LOCATION_PROMPT_SUFFIX) return prompt || ''
  if (!prompt) return LOCATION_PROMPT_SUFFIX
  const cleanPrompt = removeLocationPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${LOCATION_PROMPT_SUFFIX}`
}

/**
 * 构建角色介绍字符串（用于发送给 AI，帮助理解"我"和称呼对应的角色）
 * @param characters - 角色列表，需要包含 name 和 introduction 字段
 * @returns 格式化的角色介绍字符串
 */
export function buildCharactersIntroduction(characters: Array<{ name: string; introduction?: string | null }>): string {
  if (!characters || characters.length === 0) return '暂无角色介绍'

  const introductions = characters
    .filter(c => c.introduction && c.introduction.trim())
    .map(c => `- ${c.name}：${c.introduction}`)

  if (introductions.length === 0) return '暂无角色介绍'

  return introductions.join('\n')
}
