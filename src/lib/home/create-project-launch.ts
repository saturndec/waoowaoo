import { readApiErrorMessage } from '@/lib/api/read-error-message'
import type { StylePresetRef } from '@/lib/style-preset/types'

export const HOME_ASSISTANT_AUTOSTART_QUERY = 'assistantAutoStart' as const
export const HOME_ASSISTANT_AUTOSTART_VALUE = 'home-story' as const

interface ProjectCreationPayload {
  project?: {
    id?: string | null
  } | null
}

interface EpisodeCreationPayload {
  episode?: {
    id?: string | null
  } | null
}

interface ApiFetchLike {
  (input: string, init?: RequestInit): Promise<Response>
}

export interface HomeWorkspaceLaunchTarget {
  pathname: string
  query: {
    episode: string
    [HOME_ASSISTANT_AUTOSTART_QUERY]?: typeof HOME_ASSISTANT_AUTOSTART_VALUE
  }
}

export interface CreateHomeProjectLaunchParams {
  apiFetch: ApiFetchLike
  projectName: string
  storyText: string
  videoRatio: string
  artStyle: string
  visualStylePreset?: StylePresetRef
  directorStylePreset?: StylePresetRef | null
  directorStylePresetId?: string
  episodeName: string
}

export interface CreateHomeProjectLaunchResult {
  projectId: string
  episodeId: string
  target: HomeWorkspaceLaunchTarget
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function readNestedString(
  source: Record<string, unknown> | null,
  outerKey: string,
  innerKey: string,
): string | null {
  const outer = readObject(source?.[outerKey])
  const value = outer?.[innerKey]
  return typeof value === 'string' && value.trim() ? value : null
}

async function readProjectId(response: Response): Promise<string> {
  const payload = await response.json() as ProjectCreationPayload
  const projectId = readNestedString(readObject(payload), 'project', 'id')
  if (!projectId) {
    throw new Error('Project creation response missing project id')
  }
  return projectId
}

async function readEpisodeId(response: Response): Promise<string> {
  const payload = await response.json() as EpisodeCreationPayload
  const episodeId = readNestedString(readObject(payload), 'episode', 'id')
  if (!episodeId) {
    throw new Error('Episode creation response missing episode id')
  }
  return episodeId
}

export function buildHomeWorkspaceLaunchTarget(projectId: string, episodeId: string): HomeWorkspaceLaunchTarget {
  return {
    pathname: `/workspace/${projectId}`,
    query: {
      episode: episodeId,
      [HOME_ASSISTANT_AUTOSTART_QUERY]: HOME_ASSISTANT_AUTOSTART_VALUE,
    },
  }
}

export async function createHomeProjectLaunch({
  apiFetch,
  projectName,
  storyText,
  videoRatio,
  artStyle,
  visualStylePreset,
  directorStylePreset,
  directorStylePresetId,
  episodeName,
}: CreateHomeProjectLaunchParams): Promise<CreateHomeProjectLaunchResult> {
  const projectResponse = await apiFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: projectName,
      ...(directorStylePreset ? { directorStylePreset } : {}),
      ...(!directorStylePreset && directorStylePresetId ? { directorStylePresetId } : {}),
    }),
  })

  if (!projectResponse.ok) {
    throw new Error(await readApiErrorMessage(projectResponse, 'Failed to create project'))
  }

  const projectId = await readProjectId(projectResponse)

  const configResponse = await apiFetch(`/api/projects/${projectId}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoRatio,
      artStyle,
      ...(visualStylePreset ? { visualStylePreset } : {}),
    }),
  })

  if (!configResponse.ok) {
    throw new Error(await readApiErrorMessage(configResponse, 'Failed to save project config'))
  }

  const episodeResponse = await apiFetch(`/api/projects/${projectId}/episodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: episodeName,
      novelText: storyText,
    }),
  })

  if (!episodeResponse.ok) {
    throw new Error(await readApiErrorMessage(episodeResponse, 'Failed to create first episode'))
  }

  const episodeId = await readEpisodeId(episodeResponse)

  return {
    projectId,
    episodeId,
    target: buildHomeWorkspaceLaunchTarget(projectId, episodeId),
  }
}
