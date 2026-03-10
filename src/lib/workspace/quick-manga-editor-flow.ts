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

export function resolveQuickMangaEnabledForRuntimeLane(params: {
  journeyType: 'film_video' | 'manga_webtoon'
  currentEnabled: boolean
  enabledFromEntry: boolean
  sessionPreference: boolean | null
}): boolean {
  const baseline = resolveQuickMangaEnabledFromEntryAndSession(params)

  if (params.enabledFromEntry) return true
  if (typeof params.sessionPreference === 'boolean') return params.sessionPreference

  if (params.journeyType === 'manga_webtoon') {
    // Lane-first default: Manga/Webtoon projects should open with Manga runtime controls on,
    // while still honoring explicit session preference/query compatibility bridge.
    return true
  }

  return baseline
}
