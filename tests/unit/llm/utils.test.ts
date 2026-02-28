import { describe, expect, it } from 'vitest'
import { extractCompletionPartsFromContent } from '@/lib/llm/utils'

describe('llm utils - extractCompletionPartsFromContent', () => {
  it('extracts think block from string content into reasoning', () => {
    const parts = extractCompletionPartsFromContent(
      '<think>\n内部推理A\n</think>\n{"ok":true}',
    )

    expect(parts.reasoning).toContain('内部推理A')
    expect(parts.text).toBe('{"ok":true}')
  })

  it('keeps plain string content as text when no think tag exists', () => {
    const parts = extractCompletionPartsFromContent('plain output')
    expect(parts.reasoning).toBe('')
    expect(parts.text).toBe('plain output')
  })

  it('merges explicit reasoning part and think-tag reasoning from text part', () => {
    const parts = extractCompletionPartsFromContent([
      { type: 'reasoning', text: '显式推理B' },
      { type: 'text', text: '<think>隐式推理C</think>\n最终答案' },
    ])

    expect(parts.reasoning).toContain('显式推理B')
    expect(parts.reasoning).toContain('隐式推理C')
    expect(parts.text).toBe('最终答案')
  })
})
