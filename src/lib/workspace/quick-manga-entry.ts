export function shouldEnableQuickMangaFromSearchParams(
  searchParams: Pick<URLSearchParams, 'get'> | null | undefined,
): boolean {
  if (!searchParams) return false
  return searchParams.get('quickManga') === '1'
}
