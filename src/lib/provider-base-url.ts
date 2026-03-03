export interface BaseUrlValidationResult {
  valid: boolean
  message?: string
}

function normalizePath(pathname: string): string {
  if (!pathname) return '/'
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

function hasDisallowedGeminiEndpointPath(pathname: string): boolean {
  const normalized = normalizePath(pathname).toLowerCase()
  return (
    normalized.includes('/images/generations')
    || normalized.includes('/v1beta/models')
    || normalized.includes('/chat/completions')
    || normalized.includes(':generatecontent')
  )
}

export function validateGeminiCompatibleBaseUrl(baseUrl: string): BaseUrlValidationResult {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    return { valid: false, message: 'Base URL 不能为空' }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return {
      valid: false,
      message: 'Base URL 必须是完整 URL（例如 https://api.example.com）',
    }
  }

  if (hasDisallowedGeminiEndpointPath(parsed.pathname)) {
    return {
      valid: false,
      message: 'Gemini 兼容 Base URL 必须填写服务根地址，不能包含 /images/generations 或 /v1beta/models 路径',
    }
  }

  return { valid: true }
}

