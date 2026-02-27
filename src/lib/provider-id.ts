const RANDOM_SUFFIX_LENGTH = 8

export function createProviderIdSuffix(): string {
  const timestampPart = Date.now().toString(36)
  const randomPart = Math.random().toString(36).slice(2, 2 + RANDOM_SUFFIX_LENGTH).padEnd(RANDOM_SUFFIX_LENGTH, '0')
  return `${timestampPart}${randomPart}`
}
