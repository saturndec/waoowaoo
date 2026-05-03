import { describe, expect, it } from 'vitest'
import { createProjectAgentOperationRegistry } from '@/lib/operations/registry'

describe('project agent operation registry', () => {
  it('keeps operation ids aligned and core fields defined', () => {
    const registry = createProjectAgentOperationRegistry()
    for (const [id, operation] of Object.entries(registry)) {
      expect(operation.id).toBe(id)
      expect(operation.summary.trim().length).toBeGreaterThan(0)
      expect(Array.isArray(operation.groupPath)).toBe(true)
      expect(operation.groupPath.length).toBeGreaterThan(0)
      expect(typeof operation.channels.tool).toBe('boolean')
      expect(typeof operation.channels.api).toBe('boolean')
      expect(['required', 'optional', 'forbidden']).toContain(operation.prerequisites.episodeId)
      expect(typeof operation.confirmation.required).toBe('boolean')
      expect(typeof operation.effects.writes).toBe('boolean')
      expect(typeof operation.effects.billable).toBe('boolean')
      expect(typeof operation.effects.destructive).toBe('boolean')
      expect(typeof operation.effects.overwrite).toBe('boolean')
      expect(typeof operation.effects.bulk).toBe('boolean')
      expect(typeof operation.effects.externalSideEffects).toBe('boolean')
      expect(typeof operation.effects.longRunning).toBe('boolean')
      expect(operation.inputSchema).toBeDefined()
      expect(operation.outputSchema).toBeDefined()
      expect(typeof operation.inputSchema.safeParse).toBe('function')
      expect(typeof operation.outputSchema.safeParse).toBe('function')
    }
  })

  it('keeps storyboard tools atomic and assistant-visible', () => {
    const registry = createProjectAgentOperationRegistry()

    expect(registry.mutate_storyboard).toBeUndefined()
    expect(registry.modify_asset_image?.channels).toEqual({ tool: false, api: true })
    expect(registry.voice_generate).toBeUndefined()
    expect(registry.generate_video).toBeUndefined()
    expect(registry.delete_storyboard_panel?.channels?.tool ?? true).toBe(true)
    expect(registry.update_storyboard_panel_prompt?.channels?.tool ?? true).toBe(true)
    expect(registry.insert_storyboard_panel?.channels?.tool ?? true).toBe(true)
    expect(registry.modify_character_image?.channels?.tool ?? true).toBe(true)
    expect(registry.generate_voice_line_audio?.channels?.tool ?? true).toBe(true)
    expect(registry.generate_panel_video?.channels?.tool ?? true).toBe(true)
    expect(registry.generate_episode_voice_audio?.channels?.api ?? false).toBe(true)
    expect(registry.generate_episode_videos?.channels?.api ?? false).toBe(true)

    expect(registry.delete_storyboard_panel?.groupPath).toEqual(['storyboard', 'edit'])
    expect(registry.update_storyboard_panel_prompt?.groupPath).toEqual(['storyboard', 'edit'])
    expect(registry.insert_storyboard_panel?.groupPath).toEqual(['storyboard', 'edit'])

    for (const operation of Object.values(registry)) {
      if (!operation.channels.tool) continue
      expect(operation.groupPath).not.toEqual(['storyboard'])
    }
  })

  it('registers project music generation as a confirmed billable tool/api operation', () => {
    const registry = createProjectAgentOperationRegistry()
    const operation = registry.generate_project_music

    expect(operation).toBeDefined()
    expect(operation.channels).toEqual({ tool: true, api: true })
    expect(operation.groupPath).toEqual(['media', 'music'])
    expect(operation.confirmation.required).toBe(true)
    expect(operation.effects).toEqual({
      writes: true,
      billable: true,
      destructive: false,
      overwrite: false,
      bulk: false,
      externalSideEffects: true,
      longRunning: true,
    })
  })

  it('registers Agent Skill gateway tools as assistant-visible operations', () => {
    const registry = createProjectAgentOperationRegistry()

    expect(registry.search_skills?.groupPath).toEqual(['skill'])
    expect(registry.load_skill?.groupPath).toEqual(['skill'])
    expect(registry.create_plan?.groupPath).toEqual(['skill'])
    expect(registry.validate_plan?.groupPath).toEqual(['skill'])
    expect(registry.invoke_operation?.groupPath).toEqual(['skill'])
    expect(registry.search_skills?.intent).toBe('query')
    expect(registry.load_skill?.intent).toBe('query')
    expect(registry.create_plan?.intent).toBe('plan')
    expect(registry.validate_plan?.intent).toBe('plan')
    expect(registry.invoke_operation?.intent).toBe('act')

    for (const operationId of ['search_skills', 'load_skill', 'create_plan', 'validate_plan', 'invoke_operation']) {
      expect(registry[operationId]?.effects).toEqual({
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      })
    }
  })
})
