export function resolveQuickMangaEnabledFromEntryAndSession(params: {
  currentEnabled: boolean
  enabledFromEntry: boolean
  sessionPreference: boolean | null
}): boolean {
  const { currentEnabled, enabledFromEntry, sessionPreference } = params

  if (enabledFromEntry) return true
  if (typeof sessionPreference === 'boolean') return sessionPreference
  return currentEnabled
}
