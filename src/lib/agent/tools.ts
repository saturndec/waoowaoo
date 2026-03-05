/**
 * Định nghĩa các tool mà Director Agent có thể sử dụng
 *
 * Mỗi tool tương ứng với một hành động cụ thể trong pipeline sản xuất video.
 * Director Agent sẽ gọi các tool này dựa trên kế hoạch sản xuất.
 */

import type { AgentToolDefinition } from './types'

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'analyze_novel',
    description: 'Phân tích nội dung tiểu thuyết/truyện để trích xuất nhân vật, bối cảnh, và cốt truyện. Đây là bước đầu tiên bắt buộc.',
    parameters: {
      novelText: {
        type: 'string',
        description: 'Nội dung tiểu thuyết cần phân tích',
        required: true,
      },
      focusAreas: {
        type: 'string',
        description: 'Các khía cạnh cần tập trung phân tích: characters, locations, plot, emotions',
        enum: ['characters', 'locations', 'plot', 'emotions', 'all'],
      },
    },
  },
  {
    name: 'create_script',
    description: 'Chuyển đổi cốt truyện thành kịch bản điện ảnh chuyên nghiệp với phân cảnh, lời thoại, và mô tả hành động.',
    parameters: {
      storyOutline: {
        type: 'string',
        description: 'Tóm tắt cốt truyện để chuyển thành kịch bản',
        required: true,
      },
      style: {
        type: 'string',
        description: 'Phong cách kịch bản: dramatic, action, romance, comedy, thriller',
        enum: ['dramatic', 'action', 'romance', 'comedy', 'thriller'],
      },
      pacing: {
        type: 'string',
        description: 'Nhịp phim: slow (chậm rãi), moderate (vừa phải), fast (nhanh)',
        enum: ['slow', 'moderate', 'fast'],
      },
    },
  },
  {
    name: 'create_storyboard',
    description: 'Tạo storyboard từ kịch bản với mô tả hình ảnh chi tiết cho từng panel, bao gồm góc camera và composition.',
    parameters: {
      scriptId: {
        type: 'string',
        description: 'ID kịch bản đã tạo',
        required: true,
      },
      visualStyle: {
        type: 'string',
        description: 'Phong cách hình ảnh: anime, realistic, comic, chinese-comic',
        enum: ['anime', 'realistic', 'comic', 'chinese-comic'],
      },
      camerawork: {
        type: 'string',
        description: 'Gợi ý camera: dynamic (nhiều góc), static (ít di chuyển), cinematic (điện ảnh)',
        enum: ['dynamic', 'static', 'cinematic'],
      },
    },
  },
  {
    name: 'generate_character_image',
    description: 'Tạo hình ảnh nhân vật với character sheet (mặt trước, bên, sau) để đảm bảo tính nhất quán.',
    parameters: {
      characterName: {
        type: 'string',
        description: 'Tên nhân vật',
        required: true,
      },
      description: {
        type: 'string',
        description: 'Mô tả chi tiết ngoại hình nhân vật',
        required: true,
      },
      artStyle: {
        type: 'string',
        description: 'Phong cách nghệ thuật',
        required: true,
      },
    },
  },
  {
    name: 'generate_location_image',
    description: 'Tạo hình ảnh bối cảnh/địa điểm cho cảnh quay.',
    parameters: {
      locationName: {
        type: 'string',
        description: 'Tên địa điểm',
        required: true,
      },
      description: {
        type: 'string',
        description: 'Mô tả chi tiết bối cảnh',
        required: true,
      },
      mood: {
        type: 'string',
        description: 'Tâm trạng cảnh: bright, dark, mysterious, warm, cold',
        enum: ['bright', 'dark', 'mysterious', 'warm', 'cold'],
      },
    },
  },
  {
    name: 'generate_panel_image',
    description: 'Tạo hình ảnh cho một panel cụ thể trong storyboard.',
    parameters: {
      panelIndex: {
        type: 'number',
        description: 'Vị trí panel trong storyboard (bắt đầu từ 0)',
        required: true,
      },
      prompt: {
        type: 'string',
        description: 'Mô tả chi tiết cảnh cần tạo',
        required: true,
      },
      characters: {
        type: 'string',
        description: 'Danh sách tên nhân vật xuất hiện trong cảnh (phân cách bằng dấu phẩy)',
      },
      cameraAngle: {
        type: 'string',
        description: 'Góc camera: wide, medium, close-up, bird-eye, low-angle',
        enum: ['wide', 'medium', 'close-up', 'bird-eye', 'low-angle'],
      },
    },
  },
  {
    name: 'generate_video',
    description: 'Tạo video từ hình ảnh panel với chuyển động camera và hiệu ứng.',
    parameters: {
      panelIndex: {
        type: 'number',
        description: 'Vị trí panel cần tạo video',
        required: true,
      },
      motionPrompt: {
        type: 'string',
        description: 'Mô tả chuyển động: camera pan left, zoom in, character walking, wind blowing',
      },
      duration: {
        type: 'string',
        description: 'Thời lượng video: 3s, 5s, 10s',
        enum: ['3s', '5s', '10s'],
      },
    },
  },
  {
    name: 'generate_voice',
    description: 'Tạo giọng nói/lời thoại cho nhân vật trong một cảnh.',
    parameters: {
      text: {
        type: 'string',
        description: 'Nội dung lời thoại',
        required: true,
      },
      characterName: {
        type: 'string',
        description: 'Tên nhân vật nói',
        required: true,
      },
      emotion: {
        type: 'string',
        description: 'Cảm xúc: neutral, happy, sad, angry, excited, whisper',
        enum: ['neutral', 'happy', 'sad', 'angry', 'excited', 'whisper'],
      },
    },
  },
  {
    name: 'review_quality',
    description: 'Đánh giá chất lượng output hiện tại (kịch bản, storyboard, hình ảnh, video). Agent sẽ tự phân tích và đề xuất cải thiện.',
    parameters: {
      targetType: {
        type: 'string',
        description: 'Loại output cần đánh giá',
        required: true,
        enum: ['script', 'storyboard', 'character_images', 'panel_images', 'videos', 'voices', 'overall'],
      },
      criteria: {
        type: 'string',
        description: 'Tiêu chí đánh giá: consistency, quality, pacing, emotion, all',
        enum: ['consistency', 'quality', 'pacing', 'emotion', 'all'],
      },
    },
  },
  {
    name: 'revise_panel',
    description: 'Sửa lại một panel cụ thể dựa trên feedback từ bước review.',
    parameters: {
      panelIndex: {
        type: 'number',
        description: 'Vị trí panel cần sửa',
        required: true,
      },
      feedback: {
        type: 'string',
        description: 'Mô tả vấn đề và hướng sửa',
        required: true,
      },
      regenerateImage: {
        type: 'string',
        description: 'Có cần tạo lại hình ảnh không: yes hoặc no',
        enum: ['yes', 'no'],
      },
    },
  },
  {
    name: 'get_project_status',
    description: 'Lấy trạng thái hiện tại của dự án: các bước đã hoàn thành, đang chạy, chưa bắt đầu.',
    parameters: {},
  },
]

/**
 * Build tool definitions cho LLM prompt (OpenAI function calling format)
 */
export function buildToolDefinitionsForLLM(): Record<string, unknown>[] {
  return AGENT_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, param]) => [
            key,
            {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {}),
            },
          ]),
        ),
        required: Object.entries(tool.parameters)
          .filter(([, param]) => param.required)
          .map(([key]) => key),
      },
    },
  }))
}
