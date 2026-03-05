/**
 * Quality Reviewer Agent
 *
 * Agent chuyên đánh giá chất lượng output ở mọi giai đoạn sản xuất.
 * Được Director Agent gọi để review và đề xuất cải thiện.
 *
 * Architecture:
 *   Director → Quality Reviewer → [Analyze] → [Score] → [Recommend] → Report
 */

import OpenAI from 'openai'
import { createScopedLogger } from '@/lib/logging/core'
import { getSpecialistAgent } from './specialist-registry'
import type {
  QualityReviewRequest,
  QualityReviewResult,
  ReviewCriterion,
  ReviewTargetType,
  RevisionSuggestion,
  REVIEW_THRESHOLDS,
} from './specialist-types'
import type { AgentState } from './types'

const reviewLogger = createScopedLogger({
  module: 'agent.quality-reviewer',
  action: 'review',
})

// =====================================================
// Review Prompt Builder
// =====================================================

function buildReviewPrompt(
  request: QualityReviewRequest,
  locale: 'vi' | 'zh' | 'en',
): string {
  const criteriaList = request.criteria.join(', ')

  const localePrompts: Record<string, string> = {
    vi: `## Yêu cầu đánh giá

Đánh giá chất lượng **${request.targetType}** theo các tiêu chí: ${criteriaList}
Mức độ nghiêm khắc: **${request.strictness}**

### Thông tin dự án
- Project ID: ${request.context.projectId}
- Episode ID: ${request.context.episodeId}

### Artifacts hiện có
${JSON.stringify(request.context.artifacts, null, 2)}

### Hướng dẫn đánh giá
1. Với mỗi tiêu chí, cho điểm từ 1-10 và giải thích lý do
2. Liệt kê các vấn đề nghiêm trọng (critical issues) cần sửa ngay
3. Đề xuất cải thiện cụ thể với priority (critical/high/medium/low)
4. Tính điểm tổng thể (trung bình có trọng số)

### Format output (JSON)
\`\`\`json
{
  "overallScore": <number 1-10>,
  "passed": <boolean>,
  "criteriaScores": {
    "<criterion>": {
      "score": <number 1-10>,
      "feedback": "<string>",
      "issues": ["<string>"]
    }
  },
  "summary": "<string>",
  "recommendations": ["<string>"],
  "criticalIssues": ["<string>"],
  "suggestedRevisions": [{
    "targetType": "<string>",
    "targetId": "<string>",
    "issue": "<string>",
    "suggestion": "<string>",
    "priority": "critical|high|medium|low"
  }]
}
\`\`\``,

    zh: `评估 **${request.targetType}** 的质量，标准: ${criteriaList}
严格程度: ${request.strictness}
以JSON格式返回评分结果。`,

    en: `Evaluate **${request.targetType}** quality using criteria: ${criteriaList}
Strictness: ${request.strictness}
Return results in JSON format.`,
  }

  return localePrompts[locale] || localePrompts.vi
}

// =====================================================
// Quality Review Execution
// =====================================================

/**
 * Chạy quality review cho một target cụ thể
 */
export async function runQualityReview(
  request: QualityReviewRequest,
  state: AgentState,
  locale: 'vi' | 'zh' | 'en' = 'vi',
): Promise<QualityReviewResult> {
  reviewLogger.info({
    action: 'review.start',
    message: `Starting quality review for ${request.targetType}`,
    userId: state.userId,
    projectId: state.projectId,
    details: {
      targetType: request.targetType,
      criteria: request.criteria,
      strictness: request.strictness,
    },
  })

  const reviewerDef = getSpecialistAgent('quality_reviewer')
  if (!reviewerDef) {
    throw new Error('Quality reviewer agent not found in registry')
  }

  const systemPrompt = reviewerDef.systemPrompt(locale)
  const reviewPrompt = buildReviewPrompt(request, locale)

  try {
    const baseUrl = process.env.CLAUDE_PROXY_BASE_URL
    const apiKey = process.env.CLAUDE_PROXY_API_KEY
    if (!baseUrl || !apiKey) {
      throw new Error('CLAUDE_PROXY_NOT_CONFIGURED')
    }

    const client = new OpenAI({ baseURL: baseUrl, apiKey })

    const completion = await client.chat.completions.create({
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: reviewPrompt },
      ],
      temperature: 0.3,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    // Parse JSON từ response
    const result = parseReviewResponse(responseText, request)

    reviewLogger.info({
      action: 'review.complete',
      message: `Quality review completed: score=${result.overallScore}, passed=${result.passed}`,
      userId: state.userId,
      projectId: state.projectId,
      details: {
        targetType: request.targetType,
        overallScore: result.overallScore,
        passed: result.passed,
        criticalIssues: result.criticalIssues.length,
      },
    })

    return result
  } catch (error) {
    reviewLogger.error({
      action: 'review.error',
      message: 'Quality review failed',
      userId: state.userId,
      projectId: state.projectId,
      details: { error: error instanceof Error ? error.message : String(error) },
    })

    // Return a default failed review
    return createDefaultFailedReview(request, error)
  }
}

/**
 * Parse review response từ LLM
 */
function parseReviewResponse(
  responseText: string,
  request: QualityReviewRequest,
): QualityReviewResult {
  // Tìm JSON block trong response
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : responseText

  try {
    const parsed = JSON.parse(jsonStr.trim())

    // Validate và normalize
    const thresholds: Record<string, number> = { lenient: 5, moderate: 7, strict: 8 }
    const threshold = thresholds[request.strictness] || 7

    const overallScore = Math.max(1, Math.min(10, Number(parsed.overallScore) || 5))

    return {
      overallScore,
      passed: overallScore >= threshold,
      criteriaScores: normalizecriteriaScores(parsed.criteriaScores || {}, request.criteria),
      summary: String(parsed.summary || 'Review completed'),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      criticalIssues: Array.isArray(parsed.criticalIssues) ? parsed.criticalIssues : [],
      suggestedRevisions: normalizeRevisions(parsed.suggestedRevisions || []),
    }
  } catch {
    // Fallback: extract score from text
    const scoreMatch = responseText.match(/(?:score|điểm|评分)[:\s]*(\d+)/i)
    const score = scoreMatch ? Math.max(1, Math.min(10, parseInt(scoreMatch[1]))) : 5
    const thresholds: Record<string, number> = { lenient: 5, moderate: 7, strict: 8 }
    const threshold = thresholds[request.strictness] || 7

    return {
      overallScore: score,
      passed: score >= threshold,
      criteriaScores: createDefaultCriteriaScores(request.criteria, score),
      summary: responseText.slice(0, 500),
      recommendations: [],
      criticalIssues: [],
      suggestedRevisions: [],
    }
  }
}

function normalizecriteriaScores(
  raw: Record<string, unknown>,
  criteria: ReviewCriterion[],
): QualityReviewResult['criteriaScores'] {
  const result: QualityReviewResult['criteriaScores'] = {} as QualityReviewResult['criteriaScores']

  for (const criterion of criteria) {
    const entry = raw[criterion] as { score?: number; feedback?: string; issues?: string[] } | undefined
    result[criterion] = {
      score: Math.max(1, Math.min(10, Number(entry?.score) || 5)),
      feedback: String(entry?.feedback || ''),
      issues: Array.isArray(entry?.issues) ? entry.issues.map(String) : [],
    }
  }

  return result
}

function createDefaultCriteriaScores(
  criteria: ReviewCriterion[],
  defaultScore: number,
): QualityReviewResult['criteriaScores'] {
  const result: QualityReviewResult['criteriaScores'] = {} as QualityReviewResult['criteriaScores']

  for (const criterion of criteria) {
    result[criterion] = {
      score: defaultScore,
      feedback: 'Auto-generated score',
      issues: [],
    }
  }

  return result
}

function normalizeRevisions(raw: unknown[]): RevisionSuggestion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      targetType: String(item.targetType || 'overall') as ReviewTargetType,
      targetId: String(item.targetId || ''),
      issue: String(item.issue || ''),
      suggestion: String(item.suggestion || ''),
      priority: (['critical', 'high', 'medium', 'low'].includes(String(item.priority))
        ? String(item.priority)
        : 'medium') as RevisionSuggestion['priority'],
    }))
}

function createDefaultFailedReview(
  request: QualityReviewRequest,
  error: unknown,
): QualityReviewResult {
  return {
    overallScore: 0,
    passed: false,
    criteriaScores: createDefaultCriteriaScores(request.criteria, 0),
    summary: `Review failed: ${error instanceof Error ? error.message : String(error)}`,
    recommendations: ['Retry the quality review'],
    criticalIssues: ['Review process failed — unable to assess quality'],
    suggestedRevisions: [],
  }
}

// =====================================================
// Convenience: Quick Review Functions
// =====================================================

/**
 * Quick review cho script
 */
export function reviewScript(
  state: AgentState,
  locale: 'vi' | 'zh' | 'en' = 'vi',
  strictness: QualityReviewRequest['strictness'] = 'moderate',
): Promise<QualityReviewResult> {
  return runQualityReview(
    {
      targetType: 'script',
      criteria: ['coherence', 'pacing', 'emotion'],
      context: {
        projectId: state.projectId,
        episodeId: state.episodeId,
        artifacts: state.artifacts,
      },
      strictness,
    },
    state,
    locale,
  )
}

/**
 * Quick review cho storyboard
 */
export function reviewStoryboard(
  state: AgentState,
  locale: 'vi' | 'zh' | 'en' = 'vi',
  strictness: QualityReviewRequest['strictness'] = 'moderate',
): Promise<QualityReviewResult> {
  return runQualityReview(
    {
      targetType: 'storyboard',
      criteria: ['visual_match', 'pacing', 'consistency'],
      context: {
        projectId: state.projectId,
        episodeId: state.episodeId,
        artifacts: state.artifacts,
      },
      strictness,
    },
    state,
    locale,
  )
}

/**
 * Quick review tổng thể
 */
export function reviewOverall(
  state: AgentState,
  locale: 'vi' | 'zh' | 'en' = 'vi',
  strictness: QualityReviewRequest['strictness'] = 'moderate',
): Promise<QualityReviewResult> {
  return runQualityReview(
    {
      targetType: 'overall',
      criteria: ['consistency', 'quality', 'pacing', 'emotion', 'coherence'],
      context: {
        projectId: state.projectId,
        episodeId: state.episodeId,
        artifacts: state.artifacts,
      },
      strictness,
    },
    state,
    locale,
  )
}
