import { afterEach, describe, expect, it, vi } from 'vitest'

const proxyAgentMock = vi.hoisted(() => vi.fn((url: string) => ({ url })))
const setGlobalDispatcherMock = vi.hoisted(() => vi.fn())

vi.mock('undici', () => ({
  ProxyAgent: proxyAgentMock,
  setGlobalDispatcher: setGlobalDispatcherMock,
}))

describe('setProxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('uses lowercase https_proxy when PROXY_URL is not configured', async () => {
    vi.stubEnv('PROXY_URL', '')
    vi.stubEnv('HTTPS_PROXY', '')
    vi.stubEnv('https_proxy', 'http://127.0.0.1:7890')

    const { setProxy } = await import('../../../lib/prompts/proxy')
    await setProxy()

    expect(proxyAgentMock).toHaveBeenCalledWith('http://127.0.0.1:7890')
    expect(setGlobalDispatcherMock).toHaveBeenCalledWith({ url: 'http://127.0.0.1:7890' })
  })

  it('prefers PROXY_URL over generic proxy environment variables', async () => {
    vi.stubEnv('PROXY_URL', 'http://127.0.0.1:9999')
    vi.stubEnv('https_proxy', 'http://127.0.0.1:7890')

    const { setProxy } = await import('../../../lib/prompts/proxy')
    await setProxy()

    expect(proxyAgentMock).toHaveBeenCalledWith('http://127.0.0.1:9999')
  })
})
