import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToCOS, generateUniqueKey, getSignedUrl } from '@/lib/cos'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * PATCH /api/novel-promotion/[projectId]/character-voice
 * 更新角色的配音音色设置
 * Body: { characterId, voiceType, voiceId } - 使用Azure音色
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { characterId, voiceType, voiceId, customVoiceUrl } = body

  if (!characterId) {
    throw new ApiError('INVALID_PARAMS', { message: 'characterId is required' })
  }

  // 更新角色音色设置
  const character = await prisma.novelPromotionCharacter.update({
    where: { id: characterId },
    data: {
      voiceType: voiceType || null,
      voiceId: voiceId || null,
      customVoiceUrl: customVoiceUrl || null
    }
  })

  return NextResponse.json({ success: true, character })
})

/**
 * POST /api/novel-promotion/[projectId]/character-voice
 * 上传自定义音色音频 或 保存 AI 设计的声音
 * FormData: { characterId, file } - 文件上传
 * JSON: { characterId, voiceDesign: { voiceId, audioBase64 } } - AI 声音设计
 */
export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  // 🔐 统一权限验证
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const contentType = request.headers.get('content-type') || ''

  // 处理 JSON 请求（AI 声音设计）
  if (contentType.includes('application/json')) {
    const body = await request.json()
    const { characterId, voiceDesign } = body

    if (!characterId || !voiceDesign) {
      throw new ApiError('INVALID_PARAMS', { message: 'characterId and voiceDesign are required' })
    }

    const { voiceId, audioBase64 } = voiceDesign
    if (!voiceId || !audioBase64) {
      throw new ApiError('INVALID_PARAMS', { message: 'voiceDesign requires voiceId and audioBase64' })
    }

    // 解码 base64 音频
    const audioBuffer = Buffer.from(audioBase64, 'base64')

    // 上传到COS
    const key = generateUniqueKey(`voice/custom/${projectId}/${characterId}`, 'wav')
    const cosUrl = await uploadToCOS(audioBuffer, key)

    // 更新角色音色设置
    const character = await prisma.novelPromotionCharacter.update({
      where: { id: characterId },
      data: {
        voiceType: 'custom',
        voiceId: voiceId,  // 保存 AI 生成的 voice ID
        customVoiceUrl: cosUrl
      }
    })

    console.log(`Character ${characterId} AI-designed voice saved: ${cosUrl}, voiceId: ${voiceId}`)

    // 返回签名URL
    const signedAudioUrl = getSignedUrl(cosUrl, 7200)

    return NextResponse.json({
      success: true,
      audioUrl: signedAudioUrl,
      character: {
        ...character,
        customVoiceUrl: signedAudioUrl
      }
    })
  }

  // 处理 FormData 请求（文件上传）
  const formData = await request.formData()
  const file = formData.get('file') as File
  const characterId = formData.get('characterId') as string

  if (!file || !characterId) {
    throw new ApiError('INVALID_PARAMS', { message: 'file and characterId are required' })
  }

  // 验证文件类型
  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a']
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
    throw new ApiError('INVALID_PARAMS', { message: 'Invalid file type. Allowed: mp3, wav, ogg, m4a' })
  }

  // 读取文件
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // 获取文件扩展名
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'

  // 上传到COS
  const key = generateUniqueKey(`voice/custom/${projectId}/${characterId}`, ext)
  const audioUrl = await uploadToCOS(buffer, key)

  // 更新角色音色设置为自定义
  const character = await prisma.novelPromotionCharacter.update({
    where: { id: characterId },
    data: {
      voiceType: 'custom',
      voiceId: characterId, // 使用characterId作为标识
      customVoiceUrl: audioUrl
    }
  })

  console.log(`Character ${characterId} voice uploaded: ${audioUrl}`)

  // 返回签名URL，以便前端可以立即播放
  const signedAudioUrl = getSignedUrl(audioUrl, 7200)

  return NextResponse.json({
    success: true,
    audioUrl: signedAudioUrl,
    character: {
      ...character,
      customVoiceUrl: signedAudioUrl // 返回签名URL给前端
    }
  })
})
