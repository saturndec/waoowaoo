import fs from 'node:fs'
import path from 'node:path'

const roots = [
  'src/lib/agent-skills',
  'src/lib/command-center',
  'src/lib/operations',
  'src/lib/operations/domains/agent-skill',
  'src/lib/project-context',
  'src/lib/project-projection',
  'src/lib/project-agent/copy.ts',
  'src/lib/project-agent/router.ts',
  'src/lib/saved-skills',
  'src/lib/task/types.ts',
  'src/app/api',
  'src/features/project-workspace',
  'skills/agent',
  'prisma/schema.prisma',
]

const banned = [
  'story-to-script',
  'script-to-storyboard',
  'create_workflow_plan',
  'approve_plan',
  'reject_plan',
  'run_workflow_package',
  'workflow_plan_template',
  'workflowType',
  'workflowVersion',
  'workflowId',
  'STORY_TO_SCRIPT_RUN',
  'SCRIPT_TO_STORYBOARD_RUN',
  '/api/runs',
  'WORKFLOW.md',
  'WorkflowPackage',
  'WorkflowPackageId',
  'WorkflowPlanTemplate',
]

const bannedPaths = [
  'skills/project-workflow',
  'src/lib/run-runtime',
  'src/lib/workflow-engine',
  'src/app/api/runs',
]

export function inspectAssistantFixedWorkflowSurface(filePath, content) {
  return banned
    .filter((term) => content.includes(term))
    .map((term) => `${filePath} contains ${term}`)
}

export function inspectForbiddenFixedWorkflowPath(targetPath, exists) {
  if (!exists) return []
  return bannedPaths.includes(targetPath)
    ? [`${targetPath} must not exist`]
    : []
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
for (const targetPath of bannedPaths) {
  const absolute = path.resolve(process.cwd(), targetPath)
  violations.push(...inspectForbiddenFixedWorkflowPath(targetPath, fs.existsSync(absolute)))
}

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
