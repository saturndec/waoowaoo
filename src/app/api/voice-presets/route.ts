import { NextRequest, NextResponse } from 'next/server'
import { AZURE_CHINESE_VOICES, getMaleVoices, getFemaleVoices } from '@/lib/azure-voices'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'

/**
 * GET /api/voice-presets
 * 获取音色库列表（Azure 中文音色）
 */
export const GET = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  // 返回内置的 Azure 音色列表
  return NextResponse.json({
    presets: AZURE_CHINESE_VOICES,
    maleVoices: getMaleVoices(),
    femaleVoices: getFemaleVoices(),
    total: AZURE_CHINESE_VOICES.length
  })
})
