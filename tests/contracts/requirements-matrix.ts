export type RequirementPriority = 'P0' | 'P1' | 'P2'

export type RequirementCoverageEntry = {
  id: string
  feature: string
  userValue: string
  risk: string
  priority: RequirementPriority
  tests: ReadonlyArray<string>
}

export const REQUIREMENTS_MATRIX: ReadonlyArray<RequirementCoverageEntry> = [
  {
    id: 'REQ-ASSETHUB-CHARACTER-EDIT',
    feature: 'Asset Hub character edit',
    userValue: '角色信息编辑后立即可见并正确保存',
    risk: '字段映射漂移导致保存失败或误写',
    priority: 'P0',
    tests: [
      'tests/integration/api/contract/asset-crud-routes.test.ts',
      'tests/integration/chain/text.chain.test.ts',
    ],
  },
  {
    id: 'REQ-ASSETHUB-REFERENCE-TO-CHARACTER',
    feature: 'Asset Hub reference-to-character',
    userValue: '上传参考图后生成角色形象且使用参考图',
    risk: 'referenceImages 丢失或分支走错',
    priority: 'P0',
    tests: [
      'tests/unit/helpers/reference-to-character-helpers.test.ts',
      'tests/unit/worker/reference-to-character.test.ts',
      'tests/integration/chain/text.chain.test.ts',
    ],
  },
  {
    id: 'REQ-NP-GENERATE-IMAGE',
    feature: 'Novel promotion image generation',
    userValue: '角色/场景/分镜图可稳定生成并回写',
    risk: '任务 payload 漂移、worker 写回错误实体',
    priority: 'P0',
    tests: [
      'tests/integration/api/contract/direct-submit-media-routes.test.ts',
      'tests/unit/worker/image-task-handlers-core.test.ts',
      'tests/integration/chain/image.chain.test.ts',
      'tests/system/generate-image.system.test.ts',
    ],
  },
  {
    id: 'REQ-NP-GENERATE-VIDEO',
    feature: 'Novel promotion video generation',
    userValue: '面板视频可生成并可追踪状态',
    risk: 'panel 定位错误、model 能力判断错误、状态错乱',
    priority: 'P0',
    tests: [
      'tests/integration/api/contract/direct-submit-media-routes.test.ts',
      'tests/unit/worker/video-worker.test.ts',
      'tests/integration/chain/video.chain.test.ts',
      'tests/system/generate-video.system.test.ts',
    ],
  },
  {
    id: 'REQ-NP-INSERT-PANEL-AUTO-ANALYZE',
    feature: 'Novel promotion insert panel',
    userValue: 'AI 自动分析插入分镜时不会因空输入失败',
    risk: 'route 与 worker 契约分叉导致异步任务直接报错',
    priority: 'P0',
    tests: [
      'tests/unit/project-workflow/panel-stage-runtime.test.ts',
      'tests/integration/api/contract/direct-submit-text-routes.test.ts',
      'tests/unit/worker/llm-proxy.test.ts',
    ],
  },
  {
    id: 'REQ-NP-PANEL-VARIANT-SAFETY',
    feature: 'Novel promotion panel variant',
    userValue: '镜头变体只能插入当前 storyboard，任务失败可回滚，资产开关真实生效',
    risk: '跨分镜误插入、创建脏 panel、参考图开关失效',
    priority: 'P0',
    tests: [
      'tests/integration/api/specific/panel-variant-selection.test.ts',
      'tests/integration/api/contract/direct-submit-media-routes.test.ts',
      'tests/unit/worker/panel-variant-task-handler.test.ts',
      'tests/regression/panel-variant-cross-storyboard.test.ts',
    ],
  },
  {
    id: 'REQ-NP-TEXT-ANALYSIS',
    feature: 'Atomic text analysis tasks',
    userValue: '文本分析链路稳定并可回放结果',
    risk: '原子任务结果结构损坏',
    priority: 'P1',
    tests: [
      'tests/integration/api/contract/llm-observe-routes.test.ts',
      'tests/integration/chain/text.chain.test.ts',
      'tests/unit/worker/clips-build.test.ts',
      'tests/unit/worker/screenplay-convert.test.ts',
    ],
  },
  {
    id: 'REQ-TASK-STATE-CONSISTENCY',
    feature: 'Task state and SSE consistency',
    userValue: '前端状态与任务真实状态一致',
    risk: 'target-state 与 SSE 失配导致误提示',
    priority: 'P0',
    tests: [
      'tests/unit/helpers/task-state-service.test.ts',
      'tests/integration/api/contract/task-queue-routes.test.ts',
      'tests/integration/api/contract/task-run-routes.test.ts',
      'tests/integration/task/create-task-dedupe.integration.test.ts',
      'tests/unit/optimistic/sse-invalidation.test.ts',
    ],
  },
  {
    id: 'REQ-PROVIDER-PROTOCOL-CONTRACT',
    feature: 'Provider protocol contract',
    userValue: '外部 provider 请求格式、轮询状态和错误分类保持稳定',
    risk: 'provider 协议漂移导致系统链路仅在真实调用时失败',
    priority: 'P0',
    tests: [
      'tests/integration/provider/fal-provider.contract.test.ts',
      'tests/integration/provider/openai-compat-provider.contract.test.ts',
      'tests/unit/task/async-poll-external-id.test.ts',
    ],
  },
  {
    id: 'REQ-TASK-DEDUPE-COMPENSATION',
    feature: 'Task dedupe and enqueue compensation',
    userValue: '重复提交不会卡死，队列失败不会留下脏冻结或孤儿任务',
    risk: '重复任务、孤儿 dedupeKey、enqueue 失败后冻结金额未回滚',
    priority: 'P0',
    tests: [
      'tests/integration/task/create-task-dedupe.integration.test.ts',
      'tests/integration/billing/submitter.integration.test.ts',
      'tests/regression/task-dedupe-recovery.test.ts',
      'tests/regression/task-enqueue-billing-rollback.test.ts',
      'tests/unit/worker/user-concurrency-gate.test.ts',
    ],
  },
  {
    id: 'REQ-API-CONFIG-TUTORIAL-PORTAL',
    feature: 'API config tutorial modal layering',
    userValue: '开通教程浮层只高亮当前教程，不污染其他 provider card',
    risk: '弹层挂载在局部层叠上下文内，导致高亮重叠和误覆盖',
    priority: 'P1',
    tests: [
      'tests/unit/api-config/provider-card-tutorial-modal.test.ts',
    ],
  },
  {
    id: 'REQ-INFRA-PUBLIC-ROUTES',
    feature: 'Infra and public routes',
    userValue: '基础公共路由可稳定访问，公开范围明确且有测试兜底',
    risk: '特殊公开路由缺少约束或回归覆盖，导致泄漏、误拦截或行为漂移',
    priority: 'P1',
    tests: [
      'tests/integration/api/contract/infra-routes.test.ts',
    ],
  },
]
