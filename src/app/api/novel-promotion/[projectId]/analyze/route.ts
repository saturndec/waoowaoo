import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatCompletion, getCompletionContent } from '@/lib/llm-client'
import fs from 'fs'
import path from 'path'
import { logAIAnalysis, logError } from '@/lib/logger'
import { ART_STYLES, removeLocationPromptSuffix } from '@/lib/constants'
import { withTextBilling } from '@/lib/pricing'
import { requireProjectAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

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

  if (project.mode !== 'novel-promotion') {
    throw new ApiError('INVALID_PARAMS', { message: 'Not a novel promotion project' })
  }

  const globalAssetText = novelData.globalAssetText
  const firstEpisode = await prisma.novelPromotionEpisode.findFirst({
    where: { novelPromotionProjectId: novelData.id },
    orderBy: { createdAt: 'asc' }
  })
  const novelText = firstEpisode?.novelText

  let contentToAnalyze = globalAssetText || novelText || ''

  if (!contentToAnalyze.trim()) {
    throw new ApiError('INVALID_PARAMS', { message: '请先填写全局资产设定或剧本内容' })
  }

  const MAX_CONTENT_LENGTH = 30000
  if (contentToAnalyze.length > MAX_CONTENT_LENGTH) {
    contentToAnalyze = contentToAnalyze.substring(0, MAX_CONTENT_LENGTH)
    console.log(`Content truncated to ${MAX_CONTENT_LENGTH} characters`)
  }

  // 使用 withTextBilling 包装
  const result = await withTextBilling(
    session.user.id,
    novelData.analysisModel,
    15000,  // 预估输入tokens
    5000,   // 预估输出tokens
    { projectId, action: 'analyze_novel' },
    async () => {
      const characterPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'agent_character_profile.txt')
      const locationPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'novel-promotion', 'select_location.txt')
      let characterPromptTemplate = fs.readFileSync(characterPromptPath, 'utf-8')
      let locationPromptTemplate = fs.readFileSync(locationPromptPath, 'utf-8')

      const charactersLibName = (novelData.characters || []).map(c => c.name).join(', ')
      const locationsLibName = (novelData.locations || []).map(l => l.name).join(', ')

      characterPromptTemplate = characterPromptTemplate
        .replace('{input}', contentToAnalyze)
        .replace('{characters_lib_name}', charactersLibName || '无')

      locationPromptTemplate = locationPromptTemplate
        .replace('{input}', contentToAnalyze)
        .replace('{locations_lib_name}', locationsLibName || '无')

      logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
        action: 'ANALYZE_NOVEL_PROFILE',
        input: { contentLength: contentToAnalyze.length },
        model: novelData.analysisModel
      })

      const [characterCompletion, locationCompletion] = await Promise.all([
        chatCompletion(session.user.id, novelData.analysisModel, [{ role: 'user', content: characterPromptTemplate }], { temperature: 0.7, projectId, action: 'analyze_characters' }),
        chatCompletion(session.user.id, novelData.analysisModel, [{ role: 'user', content: locationPromptTemplate }], { temperature: 0.7, projectId, action: 'analyze_locations' })
      ])

      const characterResponseText = getCompletionContent(characterCompletion)
      const locationResponseText = getCompletionContent(locationCompletion)

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

      let charactersData: { characters?: any[] } = { characters: [] }
      let locationsData: { locations?: any[] } = { locations: [] }

      try {
        charactersData = parseJsonResponse(characterResponseText)
        console.log(`✓ Parsed ${charactersData.characters?.length || 0} character profiles`)
      } catch (e: any) {
        console.error('Failed to parse character response:', e.message)
        console.error('Raw response (first 500 chars):', characterResponseText?.substring(0, 500))
      }

      try {
        locationsData = parseJsonResponse(locationResponseText)
        console.log(`✓ Parsed ${locationsData.locations?.length || 0} locations`)
      } catch (e: any) {
        console.error('Failed to parse location response:', e.message)
        console.error('Raw response (first 500 chars):', locationResponseText?.substring(0, 500))
      }

      console.log(`=== Starting to save ${charactersData.characters?.length || 0} characters (profile only) and ${locationsData.locations?.length || 0} locations ===`)

      const createdCharacters = []
      for (const char of (charactersData.characters || [])) {
        const existsInLibrary = (novelData.characters || []).some(
          (c: any) => c.name.toLowerCase() === char.name.toLowerCase()
        )
        if (existsInLibrary) {
          console.log(`Character "${char.name}" already exists, skipping`)
          continue
        }

        try {
          // 保存角色基础信息和档案数据,不生成外貌描述
          const profileData = {
            role_level: char.role_level,
            archetype: char.archetype,
            personality_tags: char.personality_tags || [],
            era_period: char.era_period,
            social_class: char.social_class,
            occupation: char.occupation,
            costume_tier: char.costume_tier,
            suggested_colors: char.suggested_colors || [],
            primary_identifier: char.primary_identifier,
            visual_keywords: char.visual_keywords || [],
            gender: char.gender,
            age_range: char.age_range
          }

          const character = await prisma.novelPromotionCharacter.create({
            data: {
              novelPromotionProjectId: novelData.id,
              name: char.name,
              aliases: JSON.stringify(char.aliases || []),
              profileData: JSON.stringify(profileData),
              profileConfirmed: false  // 等待用户确认
            }
          })

          createdCharacters.push(character)
          console.log(`✓ Created character profile: ${char.name} (${char.role_level} level, tier ${char.costume_tier})`)
        } catch (dbError: any) {
          console.error(`✗ Failed to create character "${char.name}":`, dbError.message)
          throw dbError
        }
      }

      const createdLocations = []
      for (const loc of (locationsData.locations || [])) {
        const descriptions = loc.descriptions || (loc.description ? [loc.description] : [])
        const firstDescription = descriptions[0] || ''

        const invalidKeywords = ['幻想', '抽象', '无明确', '空间锚点', '未说明', '不明确']
        const isInvalid = invalidKeywords.some(keyword =>
          loc.name.includes(keyword) || firstDescription.includes(keyword)
        )
        if (isInvalid) {
          console.log(`Location "${loc.name}" is invalid, skipping`)
          continue
        }

        const existsInLibrary = (novelData.locations || []).some(
          (l: any) => l.name.toLowerCase() === loc.name.toLowerCase()
        )
        if (existsInLibrary) {
          console.log(`Location "${loc.name}" already exists, skipping`)
          continue
        }

        const cleanDescriptions = descriptions.map((d: string) => removeLocationPromptSuffix(d || ''))

        try {
          const location = await prisma.novelPromotionLocation.create({
            data: {
              novelPromotionProjectId: novelData.id,
              name: loc.name,
              summary: loc.summary || null  // 场景简要描述
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

          createdLocations.push(location)
          console.log(`✓ Created location: ${loc.name} with ${cleanDescriptions.length} images`)
        } catch (dbError: any) {
          console.error(`✗ Failed to create location "${loc.name}":`, dbError.message)
          throw dbError
        }
      }

      const selectedStyle = ART_STYLES.find(s => s.value === novelData.artStyle)
      await prisma.novelPromotionProject.update({
        where: { id: novelData.id },
        data: {
          stage: 'assets',
          artStylePrompt: selectedStyle?.prompt || ''
        }
      })

      logAIAnalysis(session.user.id, session.user.name, projectId, project.name, {
        action: 'ANALYZE_NOVEL_SRT',
        output: { characters: createdCharacters.length, locations: createdLocations.length },
        model: novelData.analysisModel
      })

      return {
        success: true,
        characters: createdCharacters,
        locations: createdLocations
      }
    }
  )

  return NextResponse.json(result)
})
