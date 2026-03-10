const QUICK_MANGA_SESSION_KEY = 'vat.quickManga.enabled'

function getSessionStorageSafe(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function readQuickMangaSessionPreference(): boolean | null {
  const sessionStorageRef = getSessionStorageSafe()
  if (!sessionStorageRef) return null

  try {
    const raw = sessionStorageRef.getItem(QUICK_MANGA_SESSION_KEY)
    if (raw === '1') return true
    if (raw === '0') return false
    return null
  } catch {
    return null
  }
}

export function writeQuickMangaSessionPreference(enabled: boolean): void {
  const sessionStorageRef = getSessionStorageSafe()
  if (!sessionStorageRef) return

  try {
    sessionStorageRef.setItem(QUICK_MANGA_SESSION_KEY, enabled ? '1' : '0')
  } catch {
    return
  }
}

export function clearQuickMangaSessionPreference(): void {
  const sessionStorageRef = getSessionStorageSafe()
  if (!sessionStorageRef) return

  try {
    sessionStorageRef.removeItem(QUICK_MANGA_SESSION_KEY)
  } catch {
    return
  }
}

export { QUICK_MANGA_SESSION_KEY }
