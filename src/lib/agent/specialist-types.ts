/**
 * Specialist Agent Types
 *
 * Mỗi specialist agent chuyên xử lý một giai đoạn cụ thể trong pipeline sản xuất.
 * Director Agent sẽ delegate work cho các specialist agents khi cần.
 */

import type { AgentToolName, AgentPhase, DirectorAgentConfig } from './types'

// =====================================================
// Specialist Agent Registry
// =====================================================

export type SpecialistAgentType =
  | 'script_writer'       // Chuyên viết kịch bản
  | 'storyboard_artist'   // Chuyên tạo storyboard
  | 'visual_designer'     // Chuyên tạo hình ảnh
  | 'video_producer'      // Chuyên tạo video
  | 'voice_director'      // Chuyên xử lý giọng nói
  | 'quality_reviewer'    // Chuyên review chất lượng

export interface SpecialistAgentDefinition {
  type: SpecialistAgentType
  name: string
  description: string
  phase: AgentPhase
  tools: AgentToolName[]
  systemPrompt: (locale: DirectorAgentConfig['locale']) => string
  maxIterations: number
  reviewCriteria: string[]
}

export interface SpecialistTaskRequest {
  agentType: SpecialistAgentType
  instruction: string
  context?: Record<string, unknown>
  parentRunId?: string
}

export interface SpecialistTaskResult {
  agentType: SpecialistAgentType
  success: boolean
  output: Record<string, unknown>
  qualityScore?: number
  feedback?: string
  artifactsProduced: string[]
  iterationsUsed: number
}

// =====================================================
// Quality Review Types
// =====================================================

export type ReviewTargetType =
  | 'script'
  | 'storyboard'
  | 'character_images'
  | 'panel_images'
  | 'videos'
  | 'voices'
  | 'overall'

export type ReviewCriterion =
  | 'consistency'    // Tính nhất quán giữa các phần
  | 'quality'        // Chất lượng kỹ thuật
  | 'pacing'         // Nhịp kể chuyện
  | 'emotion'        // Sức truyền cảm
  | 'coherence'      // Sự mạch lạc
  | 'visual_match'   // Hình ảnh khớp mô tả

export interface QualityReviewRequest {
  targetType: ReviewTargetType
  criteria: ReviewCriterion[]
  context: {
    projectId: string
    episodeId: string
    artifacts: Record<string, unknown>
  }
  strictness: 'lenient' | 'moderate' | 'strict'
}

export interface QualityReviewResult {
  overallScore: number           // 1-10
  passed: boolean                // score >= threshold
  criteriaScores: Record<ReviewCriterion, {
    score: number
    feedback: string
    issues: string[]
  }>
  summary: string
  recommendations: string[]
  criticalIssues: string[]       // Vấn đề cần sửa ngay
  suggestedRevisions: RevisionSuggestion[]
}

export interface RevisionSuggestion {
  targetType: ReviewTargetType
  targetId: string
  issue: string
  suggestion: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

// =====================================================
// Review Thresholds
// =====================================================

export const REVIEW_THRESHOLDS: Record<string, number> = {
  lenient: 5,
  moderate: 7,
  strict: 8,
}
