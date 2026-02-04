import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import * as fs from 'fs'
import * as path from 'path'
import { logAIAnalysis, logError } from '@/lib/logger'
import { sliceSRT } from '@/lib/srt'
import { removeLocationPromptSuffix, buildCharactersIntroduction } from '@/lib/constants'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/clips
 * 生成clips（第二步：切割SRT为片段）
 * 需要传入 episodeId
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证（包含 characters, locations）
  const authResult = await requireProjectAuth(projectId, {
    include: { characters: true, locations: true }
  })
  if (isErrorResponse(authResult)) return authResult
  const session = authResult.session
  const project = authResult.project
  const novelData = authResult.novelData

  const body = await request.json()
  const { episodeId } = body

  if (!episodeId) {
    throw new ApiError('INVALID_PARAMS', { message: 'episodeId is required' })
  }

  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS', { message: 'Not a novel promotion project' })
  }

  // 💰 计费通过 withTextBilling 在下方统一处理

  // 获取剧集数据
  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId }
  })

  if (!episode) {
    throw new ApiError('NOT_FOUND', { message: 'Episode not found' })
  }

  if (episode.novelPromotionProjectId !== novelData.id) {
    throw new ApiError('INVALID_PARAMS', { message: 'Episode does not belong to this project' })
  }

  // 确定要处理的内容（从剧集获取）
  const contentToProcess = episode.novelText

  if (!contentToProcess) {
    throw new ApiError('INVALID_PARAMS', { message: 'No novel text to process' })
  }

  // ========== 🔧 资产筛选步骤：分析该剧集内容，创建缺失的角色/场景 ==========
  console.log(`[Clips] 开始资产筛选，分析剧集 "${episode.name}" 的内容...`)

  // 读取资产筛选提示词 - 使用 profile 提示词统一流程
  const characterPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_character_profile.txt')
  const locationPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'select_location.txt')
  let characterPromptTemplate = fs.readFileSync(characterPromptPath, 'utf-8')
  let locationPromptTemplate = fs.readFileSync(locationPromptPath, 'utf-8')

  // 构建当前资产库信息（用于去重）
  const currentLocationsLibName = (novelData.locations || []).map((l: any) => l.name).join(', ')

  // 🔥 构建完整的角色库信息（包含别名和介绍）
  const existingCharacters = (novelData.characters || []).map((c: any) => ({
    name: c.name,
    aliases: c.aliases ? (typeof c.aliases === 'string' ? JSON.parse(c.aliases) : c.aliases) : [],
    introduction: c.introduction || ''
  }))

  function buildCharactersLibInfo(): string {
    if (existingCharacters.length === 0) return '暂无已有角色'
    return existingCharacters.map((c: any, i: number) => {
      const aliasStr = c.aliases.length > 0 ? `别名：${c.aliases.join('、')}` : '别名：无'
      const introStr = c.introduction ? `介绍：${c.introduction}` : '介绍：暂无'
      return `${i + 1}. ${c.name}\n   ${aliasStr}\n   ${introStr}`
    }).join('\n\n')
  }

  characterPromptTemplate = characterPromptTemplate
    .replace('{input}', contentToProcess)
    .replace('{characters_lib_info}', buildCharactersLibInfo())

  locationPromptTemplate = locationPromptTemplate
    .replace('{input}', contentToProcess)
    .replace('{locations_lib_name}', currentLocationsLibName || '无')

  // 并行调用 AI 分析角色和场景
  const [characterCompletion, locationCompletion] = await Promise.all([
    chatCompletion(session.user.id, novelData.analysisModel, [{ role: 'user', content: characterPromptTemplate }], { temperature: 0.7, projectId, action: 'clips_analyze_characters' }),
    chatCompletion(session.user.id, novelData.analysisModel, [{ role: 'user', content: locationPromptTemplate }], { temperature: 0.7, projectId, action: 'clips_analyze_locations' })
  ])

  const characterResponseText = getCompletionContent(characterCompletion)
  const locationResponseText = getCompletionContent(locationCompletion)

  // 解析 JSON 响应
  const parseJsonResponse = (responseText: string) => {
    let cleanedText = responseText.trim()
    cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
    const firstBrace = cleanedText.indexOf('{')
    const lastBrace = cleanedText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedText = cleanedText.substring(firstBrace, lastBrace + 1)
    }
    return JSON.parse(cleanedText)
  }

  // 🔥 解析 profile 响应（支持 new_characters 和 updated_characters）
  let charactersData: { new_characters?: any[], updated_characters?: any[], characters?: any[] } = {}
  let locationsData: { locations?: any[] } = { locations: [] }

  try {
    charactersData = parseJsonResponse(characterResponseText)
    // 兼容旧格式（如果 AI 返回 characters 而不是 new_characters）
    if (!charactersData.new_characters && charactersData.characters) {
      charactersData.new_characters = charactersData.characters
    }
    console.log(`[Clips] ✓ 解析到 ${charactersData.new_characters?.length || 0} 个新角色, ${charactersData.updated_characters?.length || 0} 个需更新`)
  } catch (e: any) {
    console.error('[Clips] 解析角色响应失败:', e.message)
  }

  try {
    locationsData = parseJsonResponse(locationResponseText)
    console.log(`[Clips] ✓ 解析到 ${locationsData.locations?.length || 0} 个新场景`)
  } catch (e: any) {
    console.error('[Clips] 解析场景响应失败:', e.message)
  }

  // 创建缺失的角色（使用 profile 提示词的完整输出）
  // 🔥 统一流程：设置 profileConfirmed: false，让用户在资产库中确认
  let createdCharactersCount = 0
  for (const char of (charactersData.new_characters || [])) {
    const existsInLibrary = (novelData.characters || []).some(
      (c: any) => c.name.toLowerCase() === char.name.toLowerCase()
    )
    if (existsInLibrary) {
      console.log(`[Clips] 角色 "${char.name}" 已存在，跳过`)
      continue
    }

    try {
      // 🔥 使用 profile 提示词的完整输出，包含 expected_appearances
      const profileData = {
        role_level: char.role_level || 'B',
        archetype: char.archetype || 'unknown',
        personality_tags: char.personality_tags || [],
        era_period: char.era_period || 'modern',
        social_class: char.social_class || 'middle',
        occupation: char.occupation || '',
        costume_tier: char.costume_tier || 2,
        suggested_colors: char.suggested_colors || [],
        primary_identifier: char.primary_identifier || '',
        visual_keywords: char.visual_keywords || [],
        gender: char.gender || 'unknown',
        age_range: char.age_range || 'adult',
        expected_appearances: char.expected_appearances || [{ id: 1, change_reason: '初始形象' }]
      }

      await prisma.novelPromotionCharacter.create({
        data: {
          novelPromotionProjectId: novelData.id,
          name: char.name,
          aliases: JSON.stringify(char.aliases || []),
          introduction: char.introduction || '',
          profileData: JSON.stringify(profileData),
          profileConfirmed: false  // 等待用户在资产库中确认
        }
      })

      createdCharactersCount++
      const appearanceCount = profileData.expected_appearances.length
      console.log(`[Clips] ✓ 创建角色档案: ${char.name}（待确认，${appearanceCount} 个形象）`)
    } catch (dbError: any) {
      console.error(`[Clips] ✗ 创建角色 "${char.name}" 失败:`, dbError.message)
    }
  }

  // 🔥 处理需要更新的已有角色（更新 introduction 和 aliases）
  let updatedCharactersCount = 0
  for (const update of (charactersData.updated_characters || [])) {
    const existingChar = (novelData.characters || []).find(
      (c: any) => c.name.toLowerCase() === update.name.toLowerCase()
    )
    if (!existingChar) {
      console.log(`[Clips] ⚠️ 更新目标角色不存在: ${update.name}`)
      continue
    }

    try {
      const updateData: any = {}

      // 更新介绍
      if (update.updated_introduction) {
        updateData.introduction = update.updated_introduction
      }

      // 合并新别名
      if (update.updated_aliases && update.updated_aliases.length > 0) {
        const currentAliases = existingChar.aliases
          ? (typeof existingChar.aliases === 'string' ? JSON.parse(existingChar.aliases) : existingChar.aliases)
          : []
        const newAliases = update.updated_aliases.filter(
          (a: string) => !currentAliases.some((ca: string) => ca.toLowerCase() === a.toLowerCase())
        )
        const mergedAliases = [...currentAliases, ...newAliases]
        updateData.aliases = JSON.stringify(mergedAliases)
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.novelPromotionCharacter.update({
          where: { id: existingChar.id },
          data: updateData
        })
        updatedCharactersCount++
        console.log(`[Clips] ✓ 更新角色: ${update.name}`)
      }
    } catch (dbError: any) {
      console.error(`[Clips] ✗ 更新角色 "${update.name}" 失败:`, dbError.message)
    }
  }

  // 创建缺失的场景
  let createdLocationsCount = 0
  for (const loc of (locationsData.locations || [])) {
    const descriptions = loc.descriptions || (loc.description ? [loc.description] : [])
    const firstDescription = descriptions[0] || ''

    const invalidKeywords = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']
    const isInvalid = invalidKeywords.some(keyword =>
      loc.name.includes(keyword) || firstDescription.includes(keyword)
    )
    if (isInvalid) {
      console.log(`[Clips] 场景 "${loc.name}" 无效，跳过`)
      continue
    }

    const existsInLibrary = (novelData.locations || []).some(
      (l: any) => l.name.toLowerCase() === loc.name.toLowerCase()
    )
    if (existsInLibrary) {
      console.log(`[Clips] 场景 "${loc.name}" 已存在，跳过`)
      continue
    }

    const cleanDescriptions = descriptions.map((d: string) => removeLocationPromptSuffix(d || ''))

    try {
      const location = await prisma.novelPromotionLocation.create({
        data: {
          novelPromotionProjectId: novelData.id,
          name: loc.name
        }
      })

      for (let i = 0; i < cleanDescriptions.length; i++) {
        await prisma.locationImage.create({
          data: {
            locationId: location.id,
            imageIndex: i,
            description: cleanDescriptions[i]
          }
        })
      }

      createdLocationsCount++
      console.log(`[Clips] ✓ 创建场景: ${loc.name}，${cleanDescriptions.length} 个描述`)
    } catch (dbError: any) {
      console.error(`[Clips] ✗ 创建场景 "${loc.name}" 失败:`, dbError.message)
    }
  }

  console.log(`[Clips] 资产筛选完成: 新增 ${createdCharactersCount} 个角色, ${createdLocationsCount} 个场景`)

  // 重新获取更新后的资产库
  const updatedNovelPromotionData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      locations: true,
      characters: true
    }
  })

  if (!updatedNovelPromotionData) {
    throw new ApiError('SERVER_ERROR', { message: 'Failed to refresh asset data' })
  }
  // ========== 资产筛选步骤结束 ==========


  // 读取提示词模板 (Agent模式)
  const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_clip.txt')
  let promptTemplate = fs.readFileSync(promptPath, 'utf-8')

  // 构建场景库名字列表（使用更新后的资产库）
  const locationsLibName = updatedNovelPromotionData.locations.length > 0
    ? updatedNovelPromotionData.locations.map((l: any) => l.name).join('、')
    : '无'

  // 构建角色库名字列表（使用更新后的资产库）
  const charactersLibName = updatedNovelPromotionData.characters.length > 0
    ? updatedNovelPromotionData.characters.map((c: any) => c.name).join('、')
    : '无'

  // 构建角色介绍（用于 AI 理解“我”和称呼映射）
  const charactersIntroduction = buildCharactersIntroduction(updatedNovelPromotionData.characters)

  // 替换占位符
  promptTemplate = promptTemplate
    .replace('{input}', contentToProcess)
    .replace('{locations_lib_name}', locationsLibName)
    .replace('{characters_lib_name}', charactersLibName)
    .replace('{characters_introduction}', charactersIntroduction)

  console.log('Step 2: Calling OpenRouter API to split clips...')

  logAIAnalysis(
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    {
      action: 'SPLIT_CLIPS',
      input: {
        episodeId,
        episodeName: episode.name,
        内容长度: contentToProcess.length,
        场景库: locationsLibName,
        角色库: charactersLibName,
        完整提示词: promptTemplate
      },
      model: novelData.analysisModel
    }
  )

  // 调用OpenRouter API（开启 reasoning 模式）
  const completion = await chatCompletion(
    session.user.id,
    novelData.analysisModel,
    [{ role: 'user', content: promptTemplate }],
    { projectId, action: 'split_clips' }
  )

  // 费用通过 withTextBilling 统一记录

  const responseText = getCompletionContent(completion)
  if (!responseText) {
    throw new ApiError('AI_ERROR', { message: 'No response from AI' })
  }

  console.log('Step 2: AI Response:', responseText)

  // 解析JSON（移除可能的markdown代码块）
  let clipsData: any[]
  try {
    // ========== 🔍 全面调试日志 START ==========
    console.log('='.repeat(80))
    console.log('🔍 [JSON PARSE DEBUG] Starting JSON parsing...')
    console.log('='.repeat(80))

    // 1. 原始响应信息
    console.log('\n📥 [RAW RESPONSE INFO]')
    console.log('  - Raw length:', responseText.length)
    console.log('  - Type:', typeof responseText)
    console.log('  - First 10 char codes:', [...responseText.slice(0, 10)].map(c => c.charCodeAt(0)).join(', '))
    console.log('  - Last 10 char codes:', [...responseText.slice(-10)].map(c => c.charCodeAt(0)).join(', '))

    // 2. 检测不可见字符
    const invisibleChars: { pos: number; code: number; char: string }[] = []
    for (let i = 0; i < responseText.length; i++) {
      const code = responseText.charCodeAt(i)
      // 检测: BOM, 零宽字符, 控制字符 (除了常见的换行、空格、制表符)
      if (
        code === 0xFEFF || // BOM
        code === 0x200B || // 零宽空格
        code === 0x200C || // 零宽非连接符
        code === 0x200D || // 零宽连接符
        code === 0x2060 || // Word Joiner
        (code < 32 && code !== 10 && code !== 13 && code !== 9) // 控制字符
      ) {
        invisibleChars.push({ pos: i, code, char: responseText[i] })
      }
    }

    if (invisibleChars.length > 0) {
      console.log('\n⚠️ [INVISIBLE CHARS DETECTED]')
      invisibleChars.forEach(({ pos, code }) => {
        console.log(`  - Position ${pos}: U+${code.toString(16).toUpperCase().padStart(4, '0')} (${code})`)
      })
    } else {
      console.log('\n✅ [NO INVISIBLE CHARS DETECTED]')
    }

    // 3. 原始内容完整输出（使用 JSON.stringify 转义所有特殊字符）
    console.log('\n📄 [FULL RAW RESPONSE - ESCAPED]')
    console.log(JSON.stringify(responseText))

    // 4. 处理步骤
    let jsonText = responseText.trim()
    console.log('\n📝 [STEP 1: After trim()]')
    console.log('  - Length:', jsonText.length, '(delta:', responseText.length - jsonText.length, ')')

    // 移除markdown标记
    const beforeMarkdown = jsonText.length
    jsonText = jsonText.replace(/^```json\s*/i, '')
    jsonText = jsonText.replace(/^```\s*/, '')
    jsonText = jsonText.replace(/\s*```$/, '')
    console.log('\n📝 [STEP 2: After markdown removal]')
    console.log('  - Length:', jsonText.length, '(delta:', beforeMarkdown - jsonText.length, ')')

    // 提取JSON数组
    const firstBracket = jsonText.indexOf('[')
    const lastBracket = jsonText.lastIndexOf(']')
    console.log('\n📝 [STEP 3: Bracket detection]')
    console.log('  - First "[" at position:', firstBracket)
    console.log('  - Last "]" at position:', lastBracket)

    if (firstBracket > 0) {
      console.log('  - Content BEFORE first "[" (escaped):', JSON.stringify(jsonText.slice(0, firstBracket)))
    }
    if (lastBracket < jsonText.length - 1) {
      console.log('  - Content AFTER last "]" (escaped):', JSON.stringify(jsonText.slice(lastBracket + 1)))
    }

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      jsonText = jsonText.substring(firstBracket, lastBracket + 1)
      console.log('\n📝 [STEP 4: After bracket extraction]')
      console.log('  - Final length:', jsonText.length)
    }

    // 5. 最终要解析的内容
    console.log('\n📄 [FINAL JSON STRING TO PARSE - ESCAPED]')
    console.log(JSON.stringify(jsonText))

    // 6. 尝试解析
    console.log('\n🔧 [ATTEMPTING JSON.parse()]...')
    clipsData = JSON.parse(jsonText)
    console.log('✅ [JSON PARSE SUCCESS]')
    console.log('  - Parsed array length:', clipsData.length)
    console.log('='.repeat(80))
    // ========== 🔍 全面调试日志 END ==========

  } catch (parseError: any) {
    // ========== ❌ 解析失败详细日志 ==========
    console.error('='.repeat(80))
    console.error('❌ [JSON PARSE FAILED]')
    console.error('='.repeat(80))
    console.error('\n🚨 [ERROR DETAILS]')
    console.error('  - Error name:', parseError?.name)
    console.error('  - Error message:', parseError?.message)

    // 如果是 SyntaxError，尝试找出错误位置
    if (parseError?.message) {
      const posMatch = parseError.message.match(/position\s+(\d+)/i)
      if (posMatch) {
        const errorPos = parseInt(posMatch[1], 10)
        console.error('\n🎯 [ERROR POSITION CONTEXT]')
        console.error('  - Error at position:', errorPos)
        console.error('  - Characters around error (escaped):')
        const start = Math.max(0, errorPos - 30)
        const end = Math.min(responseText.length, errorPos + 30)
        console.error('    ', JSON.stringify(responseText.slice(start, end)))
        console.error('  - Char at error position:', responseText.charCodeAt(errorPos), `(U+${responseText.charCodeAt(errorPos).toString(16).toUpperCase()})`)
      }
    }

    console.error('\n📄 [FULL RESPONSE THAT FAILED - ESCAPED]')
    console.error(JSON.stringify(responseText))
    console.error('='.repeat(80))

    throw new ApiError('AI_ERROR', { message: 'Invalid JSON response from AI' })
  }

  if (!Array.isArray(clipsData) || clipsData.length === 0) {
    throw new ApiError('AI_ERROR', { message: 'Invalid clips data structure' })
  }

  console.log(`Step 2: Parsed ${clipsData.length} clips`)

  // 记录AI返回的片段切分结果
  logAIAnalysis(
    session.user.id,
    session.user.name,
    projectId,
    project.name,
    {
      action: 'SPLIT_CLIPS',
      output: {
        clipsCount: clipsData.length,
        片段列表: clipsData.map((c: any) => ({
          文本范围: `${c.start?.substring(0, 20)}...~...${c.end?.substring(0, 20)}`,
          摘要: c.summary,
          场景: c.location,
          角色: c.characters
        }))
      },
      model: novelData.analysisModel
    }
  )

  // 删除旧的clips（该剧集的）
  await prisma.novelPromotionClip.deleteMany({
    where: { episodeId }
  })

  // 保存片段到数据库
  // 保存片段到数据库 (Agent模式)

  /**
   * 模糊查找文本位置
   * AI返回的 start/end 可能带有省略号或标点差异，需要容错处理
   */
  const fuzzyIndexOf = (content: string, searchText: string, fromIndex: number = 0): number => {
    // 1. 首先尝试精确匹配
    const exactIndex = content.indexOf(searchText, fromIndex)
    if (exactIndex !== -1) return exactIndex

    // 2. 移除搜索文本末尾的省略号后重试
    //    AI经常在end文本后加 "..." 或 "…"
    const cleanedSearch = searchText
      .replace(/\.{2,}$/g, '')     // 移除末尾的多个英文句点
      .replace(/…$/g, '')          // 移除末尾的中文省略号
      .replace(/。\.+$/g, '。')    // 移除句号后的省略号
      .trim()

    if (cleanedSearch && cleanedSearch !== searchText) {
      const cleanedIndex = content.indexOf(cleanedSearch, fromIndex)
      if (cleanedIndex !== -1) {
        console.log(`[Clips] 模糊匹配成功: "${searchText.substring(0, 15)}..." → 在位置 ${cleanedIndex} 找到`)
        return cleanedIndex
      }
    }

    // 3. 尝试只匹配前N个字符（至少10个）
    if (searchText.length >= 10) {
      const prefix = searchText.substring(0, Math.min(10, searchText.length))
      const prefixIndex = content.indexOf(prefix, fromIndex)
      if (prefixIndex !== -1) {
        console.log(`[Clips] 前缀匹配成功: "${prefix}..." → 在位置 ${prefixIndex} 找到`)
        return prefixIndex
      }
    }

    console.warn(`[Clips] 无法在原文中找到: "${searchText.substring(0, 20)}..."`)
    return -1
  }

  /**
   * 查找结束文本的位置，返回包含结束文本完整内容的结束索引
   */
  const findEndPosition = (content: string, endText: string, fromIndex: number): number => {
    // 1. 精确匹配
    const exactIndex = content.indexOf(endText, fromIndex)
    if (exactIndex !== -1) return exactIndex + endText.length

    // 2. 移除省略号后匹配
    const cleanedEnd = endText
      .replace(/\.{2,}$/g, '')
      .replace(/…$/g, '')
      .replace(/。\.+$/g, '。')
      .trim()

    if (cleanedEnd && cleanedEnd !== endText) {
      const cleanedIndex = content.indexOf(cleanedEnd, fromIndex)
      if (cleanedIndex !== -1) {
        // 找到清理后的结束文本后，尝试扩展到原文中该句的结尾
        const afterMatch = cleanedIndex + cleanedEnd.length
        // 查找下一个换行符或段落结尾
        const nextNewline = content.indexOf('\n', afterMatch)
        // 如果下一个换行符就在附近（10字符内），使用它作为结束点
        if (nextNewline !== -1 && nextNewline - afterMatch < 10) {
          return nextNewline
        }
        return afterMatch
      }
    }

    // 3. 前缀匹配
    if (endText.length >= 10) {
      const prefix = endText.substring(0, Math.min(10, endText.length))
      const prefixIndex = content.indexOf(prefix, fromIndex)
      if (prefixIndex !== -1) {
        // 从前缀位置向后找到句子结尾
        const afterPrefix = prefixIndex + prefix.length
        // 寻找下一个换行符
        const nextNewline = content.indexOf('\n', afterPrefix)
        if (nextNewline !== -1) {
          return nextNewline
        }
        // 没有换行符，取到内容末尾
        return content.length
      }
    }

    return -1
  }

  const createdClips = []
  for (const clipData of clipsData) {
    const startText = clipData.start || ''
    const endText = clipData.end || ''

    // 从原文中提取片段内容（从startText到endText）- 使用模糊匹配
    const startIndex = fuzzyIndexOf(contentToProcess, startText, 0)
    const endPosition = startIndex !== -1
      ? findEndPosition(contentToProcess, endText, startIndex)
      : -1

    const clipContent = startIndex !== -1 && endPosition !== -1
      ? contentToProcess.substring(startIndex, endPosition)
      : ''

    if (!clipContent) {
      console.error(`[Clips] ⚠️ 无法提取片段内容!`)
      console.error(`  - startText: "${startText.substring(0, 30)}..."`)
      console.error(`  - endText: "${endText.substring(0, 30)}..."`)
      console.error(`  - startIndex: ${startIndex}, endPosition: ${endPosition}`)
    } else {
      console.log(`[Clips] ✓ 提取片段内容: ${clipContent.length} 字符`)
    }

    const clip = await prisma.novelPromotionClip.create({
      data: {
        episodeId,
        startText,
        endText,
        summary: clipData.summary || '',
        location: clipData.location || null,
        characters: clipData.characters ? JSON.stringify(clipData.characters) : null,
        content: clipContent
      }
    })
    createdClips.push(clip)
  }

  console.log(`Step 2: Created ${createdClips.length} clips in database`)

  return NextResponse.json({
    success: true,
    clips: createdClips,
    count: createdClips.length
  })
})
