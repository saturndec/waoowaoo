/**
 * Specialist Agent Registry
 *
 * Đăng ký và quản lý tất cả specialist agents.
 * Director Agent sử dụng registry này để tìm và delegate work.
 */

import type { SpecialistAgentDefinition, SpecialistAgentType } from './specialist-types'
import type { DirectorAgentConfig } from './types'

// =====================================================
// Specialist Agent Definitions
// =====================================================

const SPECIALIST_AGENTS: SpecialistAgentDefinition[] = [
  {
    type: 'script_writer',
    name: 'Script Writer',
    description: 'Chuyên viết kịch bản điện ảnh chuyên nghiệp từ nội dung tiểu thuyết',
    phase: 'scripting',
    tools: ['analyze_novel', 'create_script', 'get_project_status'],
    maxIterations: 15,
    reviewCriteria: ['coherence', 'pacing', 'emotion'],
    systemPrompt: (locale: DirectorAgentConfig['locale']) => {
      const prompts: Record<string, string> = {
        vi: `Bạn là Script Writer Agent — chuyên gia viết kịch bản điện ảnh.

## Nhiệm vụ
Chuyển đổi nội dung tiểu thuyết thành kịch bản điện ảnh chuyên nghiệp.

## Quy tắc
1. Phân tích kỹ tâm lý nhân vật trước khi viết lời thoại
2. Tạo nhịp phim hợp lý — xen kẽ giữa hành động và đối thoại
3. Mô tả cảnh quay chi tiết (INT/EXT, thời gian, không gian)
4. Đảm bảo lời thoại tự nhiên, phù hợp tính cách nhân vật
5. Sử dụng kỹ thuật kể chuyện điện ảnh (show don't tell)

Trả lời bằng tiếng Việt.`,
        zh: `你是Script Writer Agent——专业电影编剧。将小说内容转化为专业电影剧本。用中文回复。`,
        en: `You are the Script Writer Agent — a professional screenwriter. Transform novel content into professional screenplays. Reply in English.`,
      }
      return prompts[locale] || prompts.vi
    },
  },
  {
    type: 'storyboard_artist',
    name: 'Storyboard Artist',
    description: 'Chuyên tạo storyboard với mô tả hình ảnh chi tiết cho từng panel',
    phase: 'storyboarding',
    tools: ['create_storyboard', 'get_project_status'],
    maxIterations: 15,
    reviewCriteria: ['visual_match', 'pacing', 'consistency'],
    systemPrompt: (locale: DirectorAgentConfig['locale']) => {
      const prompts: Record<string, string> = {
        vi: `Bạn là Storyboard Artist Agent — chuyên gia phân cảnh.

## Nhiệm vụ
Tạo storyboard chi tiết từ kịch bản với mô tả hình ảnh cho từng panel.

## Quy tắc
1. Mỗi panel phải có mô tả rõ ràng: nhân vật, hành động, bối cảnh
2. Đặc tả góc camera: wide shot, medium shot, close-up, etc.
3. Mô tả ánh sáng và không khí cảnh
4. Đảm bảo liên tục hình ảnh giữa các panel
5. Chú ý composition và rule of thirds

Trả lời bằng tiếng Việt.`,
        zh: `你是Storyboard Artist Agent——专业分镜师。从剧本创建详细分镜板。用中文回复。`,
        en: `You are the Storyboard Artist Agent — a professional storyboard artist. Create detailed storyboards from scripts. Reply in English.`,
      }
      return prompts[locale] || prompts.vi
    },
  },
  {
    type: 'visual_designer',
    name: 'Visual Designer',
    description: 'Chuyên tạo hình ảnh nhân vật, bối cảnh, và panel cho storyboard',
    phase: 'generating_assets',
    tools: ['generate_character_image', 'generate_location_image', 'generate_panel_image', 'get_project_status'],
    maxIterations: 25,
    reviewCriteria: ['quality', 'consistency', 'visual_match'],
    systemPrompt: (locale: DirectorAgentConfig['locale']) => {
      const prompts: Record<string, string> = {
        vi: `Bạn là Visual Designer Agent — chuyên gia thiết kế hình ảnh.

## Nhiệm vụ
Tạo hình ảnh nhân vật, bối cảnh, và panel cho storyboard.

## Quy tắc
1. Đảm bảo tính nhất quán visual giữa tất cả hình ảnh
2. Tạo character sheet trước khi tạo panel images
3. Sử dụng cùng art style xuyên suốt
4. Mô tả prompt chi tiết, chính xác cho image generation
5. Ưu tiên tạo song song các asset độc lập

Trả lời bằng tiếng Việt.`,
        zh: `你是Visual Designer Agent——专业视觉设计师。创建角色、场景和面板图像。用中文回复。`,
        en: `You are the Visual Designer Agent — a professional visual designer. Create character, location, and panel images. Reply in English.`,
      }
      return prompts[locale] || prompts.vi
    },
  },
  {
    type: 'video_producer',
    name: 'Video Producer',
    description: 'Chuyên tạo video từ hình ảnh panel với chuyển động và hiệu ứng',
    phase: 'generating_video',
    tools: ['generate_video', 'get_project_status'],
    maxIterations: 20,
    reviewCriteria: ['quality', 'pacing', 'consistency'],
    systemPrompt: (locale: DirectorAgentConfig['locale']) => {
      const prompts: Record<string, string> = {
        vi: `Bạn là Video Producer Agent — chuyên gia sản xuất video.

## Nhiệm vụ
Tạo video từ hình ảnh panel với chuyển động camera và hiệu ứng.

## Quy tắc
1. Chọn motion type phù hợp với nội dung cảnh
2. Đảm bảo chuyển cảnh mượt mà
3. Sử dụng camera movement để tạo cảm xúc
4. Tối ưu duration phù hợp nhịp kể chuyện
5. Ưu tiên tạo song song các video độc lập

Trả lời bằng tiếng Việt.`,
        zh: `你是Video Producer Agent——专业视频制作人。从面板图像创建带动效的视频。用中文回复。`,
        en: `You are the Video Producer Agent — a professional video producer. Create videos from panel images with motion. Reply in English.`,
      }
      return prompts[locale] || prompts.vi
    },
  },
  {
    type: 'voice_director',
    name: 'Voice Director',
    description: 'Chuyên xử lý giọng nói, lời thoại và narration',
    phase: 'generating_voice',
    tools: ['generate_voice', 'get_project_status'],
    maxIterations: 20,
    reviewCriteria: ['quality', 'emotion', 'consistency'],
    systemPrompt: (locale: DirectorAgentConfig['locale']) => {
      const prompts: Record<string, string> = {
        vi: `Bạn là Voice Director Agent — chuyên gia chỉ đạo giọng nói.

## Nhiệm vụ
Tạo giọng nói, lời thoại và narration cho video.

## Quy tắc
1. Chọn tone và emotion phù hợp với từng nhân vật
2. Đảm bảo nhịp nói tự nhiên
3. Narration phải match với visual trên màn hình
4. Giọng nói phải phân biệt rõ ràng giữa các nhân vật
5. Kiểm soát volume và pacing cho từng đoạn

Trả lời bằng tiếng Việt.`,
        zh: `你是Voice Director Agent——专业配音导演。创建角色配音和旁白。用中文回复。`,
        en: `You are the Voice Director Agent — a professional voice director. Create character voices and narration. Reply in English.`,
      }
      return prompts[locale] || prompts.vi
    },
  },
  {
    type: 'quality_reviewer',
    name: 'Quality Reviewer',
    description: 'Chuyên đánh giá và review chất lượng output ở mọi giai đoạn',
    phase: 'reviewing',
    tools: ['review_quality', 'get_project_status'],
    maxIterations: 10,
    reviewCriteria: ['consistency', 'quality', 'pacing', 'emotion', 'coherence', 'visual_match'],
    systemPrompt: (locale: DirectorAgentConfig['locale']) => {
      const prompts: Record<string, string> = {
        vi: `Bạn là Quality Reviewer Agent — chuyên gia đánh giá chất lượng.

## Nhiệm vụ
Đánh giá chất lượng output từ các giai đoạn sản xuất và đề xuất cải thiện.

## Quy trình đánh giá
1. Đánh giá tính nhất quán (consistency) — nhân vật, bối cảnh có đồng nhất?
2. Đánh giá chất lượng kỹ thuật (quality) — hình ảnh, video, giọng nói có đạt chuẩn?
3. Đánh giá nhịp kể chuyện (pacing) — có hợp lý, cuốn hút?
4. Đánh giá cảm xúc (emotion) — có truyền tải được cảm xúc đúng?
5. Đánh giá sự mạch lạc (coherence) — các phần có liên kết logic?
6. Đánh giá hình ảnh khớp mô tả (visual_match) — output có đúng với yêu cầu?

## Thang điểm
- 1-3: Kém, cần làm lại hoàn toàn
- 4-5: Trung bình, cần sửa đáng kể
- 6-7: Khá, cần sửa nhỏ
- 8-9: Tốt, chấp nhận được
- 10: Xuất sắc

## Output Format
Trả về JSON với format:
{
  "overallScore": number,
  "criteriaScores": {
    "criterion_name": { "score": number, "feedback": "...", "issues": [...] }
  },
  "summary": "...",
  "recommendations": [...],
  "criticalIssues": [...],
  "suggestedRevisions": [{ "targetType": "...", "targetId": "...", "issue": "...", "suggestion": "...", "priority": "..." }]
}

Trả lời bằng tiếng Việt.`,
        zh: `你是Quality Reviewer Agent——专业质量评审员。评估制作各阶段的输出质量并提出改进建议。
评分标准: 1-3差 4-5中 6-7良 8-9优 10完美。用中文回复。`,
        en: `You are the Quality Reviewer Agent — a professional quality assessor. Evaluate output quality and suggest improvements.
Scoring: 1-3 Poor, 4-5 Average, 6-7 Good, 8-9 Great, 10 Excellent. Reply in English.`,
      }
      return prompts[locale] || prompts.vi
    },
  },
]

// =====================================================
// Registry API
// =====================================================

const agentMap = new Map<SpecialistAgentType, SpecialistAgentDefinition>(
  SPECIALIST_AGENTS.map((a) => [a.type, a])
)

/**
 * Lấy specialist agent definition theo type
 */
export function getSpecialistAgent(type: SpecialistAgentType): SpecialistAgentDefinition | undefined {
  return agentMap.get(type)
}

/**
 * Lấy tất cả specialist agents
 */
export function getAllSpecialistAgents(): SpecialistAgentDefinition[] {
  return SPECIALIST_AGENTS
}

/**
 * Tìm specialist agent phù hợp nhất cho một phase
 */
export function getSpecialistForPhase(phase: string): SpecialistAgentDefinition | undefined {
  return SPECIALIST_AGENTS.find((a) => a.phase === phase)
}

/**
 * Lấy danh sách tools mà specialist agent được phép sử dụng
 */
export function getSpecialistTools(type: SpecialistAgentType): string[] {
  const agent = agentMap.get(type)
  return agent ? [...agent.tools] : []
}

/**
 * Kiểm tra specialist agent có thể sử dụng một tool hay không
 */
export function canSpecialistUseTool(type: SpecialistAgentType, toolName: string): boolean {
  const agent = agentMap.get(type)
  return agent ? agent.tools.includes(toolName as never) : false
}

export { SPECIALIST_AGENTS }
