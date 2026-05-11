
function resolveProxyUrl(): string | null {
  const proxyUrl = process.env.PROXY_URL
    || process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy
  return typeof proxyUrl === 'string' && proxyUrl.trim() ? proxyUrl.trim() : null
}

export async function setProxy() {
  const proxyUrl = resolveProxyUrl()
  if (!proxyUrl) return

  const { setGlobalDispatcher, ProxyAgent } = await import('undici')
  const proxyAgent = new ProxyAgent(proxyUrl)
  setGlobalDispatcher(proxyAgent)
}
