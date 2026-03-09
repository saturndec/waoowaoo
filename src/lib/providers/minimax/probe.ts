import type { MiniMaxProbeResult, MiniMaxProbeStep } from './types'

export async function probeMiniMax(apiKey: string): Promise<MiniMaxProbeResult> {
  const steps: MiniMaxProbeStep[] = []
  const model = 'MiniMax-M2.5'

  try {
    const response = await fetch('https://api.minimaxi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const message = response.status === 401 || response.status === 403
        ? `Authentication failed (${response.status})`
        : response.status === 429
          ? `Rate limited (${response.status})`
          : `Provider error (${response.status})`
      steps.push({
        name: 'models',
        status: 'fail',
        message,
        detail: detail.slice(0, 500),
      })
      return { success: false, steps }
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const answer = data.choices?.[0]?.message?.content?.trim() || ''
    steps.push({
      name: 'models',
      status: 'pass',
      message: answer ? `Response: ${answer.slice(0, 80)}` : 'OK',
    })
    return { success: true, steps }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    steps.push({
      name: 'models',
      status: 'fail',
      message: `Network error: ${message}`,
    })
    return { success: false, steps }
  }
}
