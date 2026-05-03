import fs from 'node:fs'
import path from 'node:path'

const roots = [
  'src/lib/agent-skills',
  'src/lib/operations/domains/agent-skill',
  'src/lib/project-agent/copy.ts',
  'src/lib/project-agent/router.ts',
  'skills/agent',
]

const banned = [
  'story-to-script',
  'script-to-storyboard',
  'create_workflow_plan',
  'approve_plan',
  'reject_plan',
  'WORKFLOW.md',
  'WorkflowPackage',
]

export function inspectAssistantFixedWorkflowSurface(filePath, content) {
  return banned
    .filter((term) => content.includes(term))
    .map((term) => `${filePath} contains ${term}`)
}

function walk(target) {
  const absolute = path.resolve(process.cwd(), target)
  if (!fs.existsSync(absolute)) return []
  const stat = fs.statSync(absolute)
  if (stat.isFile()) return [absolute]
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(absolute, entry.name)
    if (entry.isDirectory()) return walk(path.relative(process.cwd(), next))
    if (entry.isFile()) return [next]
    return []
  })
}

const violations = []
for (const root of roots) {
  for (const filePath of walk(root)) {
    if (!/\.(ts|tsx|md)$/.test(filePath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    violations.push(...inspectAssistantFixedWorkflowSurface(path.relative(process.cwd(), filePath), content))
  }
}

if (violations.length > 0) {
  console.error([
    'Fixed workflow references are forbidden in assistant Agent Skill surfaces.',
    ...violations,
  ].join('\n'))
  process.exit(1)
}
