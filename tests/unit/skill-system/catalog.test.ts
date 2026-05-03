import { describe, expect, it } from 'vitest'
import {
  PROJECT_WORKFLOW_SKILL_IDS,
} from '@/lib/skill-system/project-workflow-machine'
import {
  discoverSkillDocuments,
  getWorkflowPackage,
  listSkillCatalogEntries,
  listSkillPackages,
  listWorkflowPackages,
  readSkillCatalogDocument,
} from '@/lib/skill-system/catalog'

describe('skill-system catalog', () => {
  it('discovers first-phase skill packages without workflow packages', () => {
    const skillPackages = listSkillPackages()
    const workflowPackages = listWorkflowPackages()
    const documents = discoverSkillDocuments()

    expect(skillPackages.map((pkg) => pkg.metadata.id)).toEqual(PROJECT_WORKFLOW_SKILL_IDS)
    expect(workflowPackages).toEqual([])
    expect(documents.map((item) => item.path)).toContain('skills/project-workflow/analyze-characters/SKILL.md')
    expect(documents.map((item) => item.path).some((item) => item.includes('/WORKFLOW.md'))).toBe(false)
  })

  it('fails explicitly when old workflow package lookup is attempted', () => {
    expect(() => getWorkflowPackage('story-to-script')).toThrow(/WORKFLOW_PACKAGE_REMOVED/)
  })

  it('reads skill document content from repository source files', () => {
    const catalogEntries = listSkillCatalogEntries()
    const characterSkill = catalogEntries.find((entry) => entry.id === 'analyze-characters')
    expect(characterSkill).toBeTruthy()

    const content = readSkillCatalogDocument(characterSkill!.documentPath)
    expect(content).toContain('analyze-characters')
  })
})
