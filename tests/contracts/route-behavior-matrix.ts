import { ROUTE_CATALOG, type RouteCatalogEntry } from './route-catalog'

export type RouteBehaviorMatrixEntry = {
  routeFile: string
  contractGroup: RouteCatalogEntry['contractGroup']
  caseId: string
  tests: ReadonlyArray<string>
}

const CONTRACT_TEST_BY_GROUP: Record<RouteCatalogEntry['contractGroup'], string> = {
  'llm-observe-routes': 'tests/integration/api/contract/llm-observe-routes.test.ts',
  'direct-submit-routes': 'tests/integration/api/contract/direct-submit-routes.test.ts',
  'crud-asset-hub-routes': 'tests/integration/api/contract/crud-routes.test.ts',
  'crud-novel-promotion-routes': 'tests/integration/api/contract/crud-routes.test.ts',
  'task-infra-routes': 'tests/integration/api/contract/task-infra-routes.test.ts',
  'user-project-routes': 'tests/integration/api/contract/crud-routes.test.ts',
  'auth-routes': 'tests/integration/api/contract/crud-routes.test.ts',
  'infra-routes': 'tests/integration/api/contract/crud-routes.test.ts',
}

function resolveChainTest(routeFile: string): string {
  if (routeFile.includes('/generate-video/') || routeFile.includes('/lip-sync/')) {
    return 'tests/integration/chain/video.chain.test.ts'
  }
  if (routeFile.includes('/voice-') || routeFile.includes('/voice/')) {
    return 'tests/integration/chain/voice.chain.test.ts'
  }
  if (
    routeFile.includes('/analyze')
    || routeFile.includes('/story-to-script')
    || routeFile.includes('/script-to-storyboard')
    || routeFile.includes('/screenplay-conversion')
    || routeFile.includes('/reference-to-character')
    || routeFile.includes('/quick-manga/')
  ) {
    return 'tests/integration/chain/text.chain.test.ts'
  }
  return 'tests/integration/chain/image.chain.test.ts'
}

export const ROUTE_BEHAVIOR_MATRIX: ReadonlyArray<RouteBehaviorMatrixEntry> = ROUTE_CATALOG.map((entry) => ({
  routeFile: entry.routeFile,
  contractGroup: entry.contractGroup,
  caseId: `ROUTE:${entry.routeFile.replace(/^src\/app\/api\//, '').replace(/\/route\.ts$/, '')}`,
  tests: [
    CONTRACT_TEST_BY_GROUP[entry.contractGroup],
    resolveChainTest(entry.routeFile),
  ],
}))

export const ROUTE_BEHAVIOR_COUNT = ROUTE_BEHAVIOR_MATRIX.length
