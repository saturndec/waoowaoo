export type WorkspaceProjectEntryMode = 'story' | 'manga'

export interface ProjectCreationInput {
  name: string
  description: string
  entryMode: WorkspaceProjectEntryMode
}

export interface ProjectCreatePayload {
  name: string
  description: string
  mode: 'novel-promotion'
}

export function toProjectCreatePayload(input: ProjectCreationInput): ProjectCreatePayload {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    mode: 'novel-promotion',
  }
}

export function buildProjectEntryUrl(projectId: string, entryMode: WorkspaceProjectEntryMode): string {
  const basePath = `/workspace/${projectId}`
  if (entryMode === 'manga') {
    const params = new URLSearchParams({
      stage: 'script',
      quickManga: '1',
    })
    return `${basePath}?${params.toString()}`
  }

  return basePath
}
