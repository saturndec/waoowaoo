import type { ChatMessage } from './types'

function extractThinkTaggedContent(raw: string): { text: string; reasoning: string } {
    if (!raw) return { text: '', reasoning: '' }
    const reasoningChunks: string[] = []
    const textWithoutThink = raw.replace(
        /<think(?:\s+[^>]*)?>([\s\S]*?)<\/think>/gi,
        (_full: string, inner: string) => {
            const trimmed = typeof inner === 'string' ? inner.trim() : ''
            if (trimmed) reasoningChunks.push(trimmed)
            return ''
        },
    )
    return {
        text: textWithoutThink.trim(),
        reasoning: reasoningChunks.join('\n\n').trim(),
    }
}

export function collectTextValue(value: unknown): string {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
        return value.map((item) => collectTextValue(item)).join('')
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>
        if (typeof obj.text === 'string') return obj.text
        if (typeof obj.content === 'string') return obj.content
        if (typeof obj.delta === 'string') return obj.delta
        if (Array.isArray(obj.parts)) {
            return obj.parts.map((part) => collectTextValue(part)).join('')
        }
    }
    return ''
}

export function extractCompletionPartsFromContent(content: unknown): { text: string; reasoning: string } {
    if (typeof content === 'string') {
        return extractThinkTaggedContent(content)
    }
    if (!Array.isArray(content)) {
        return extractThinkTaggedContent(collectTextValue(content))
    }

    let text = ''
    let reasoning = ''
    for (const part of content) {
        if (typeof part === 'string') {
            text += part
            continue
        }
        if (!part || typeof part !== 'object') continue
        const obj = part as Record<string, unknown>
        const kind = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''
        const value =
            (typeof obj.text === 'string' && obj.text) ||
            (typeof obj.content === 'string' && obj.content) ||
            collectTextValue(obj.delta) ||
            collectTextValue(obj.output_text) ||
            ''
        if (!value) continue
        if (kind.includes('reason') || kind.includes('think')) {
            reasoning += value
        } else {
            text += value
        }
    }

    const normalized = extractThinkTaggedContent(text)
    if (normalized.reasoning) {
        if (!reasoning) {
            reasoning = normalized.reasoning
        } else if (!reasoning.includes(normalized.reasoning)) {
            reasoning = `${reasoning}\n\n${normalized.reasoning}`.trim()
        }
    }

    return { text: normalized.text, reasoning }
}

export function extractStreamDeltaParts(part: unknown): { textDelta: string; reasoningDelta: string } {
    const partObject =
        typeof part === 'object' && part !== null
            ? (part as {
                choices?: Array<{ delta?: Record<string, unknown> }>
                response?: {
                    output_text?: { delta?: unknown }
                    reasoning?: { delta?: unknown }
                }
            })
            : {}
    const delta = partObject.choices?.[0]?.delta || {}
    const contentParts = extractCompletionPartsFromContent(delta.content)
    const responseDelta = partObject.response?.output_text?.delta || ''
    const responseReasoning = partObject.response?.reasoning?.delta || ''
    const explicitReasoning =
        collectTextValue(delta.reasoning) ||
        collectTextValue(delta.reasoning_content) ||
        collectTextValue(delta.reasoningContent) ||
        collectTextValue(delta.thinking) ||
        collectTextValue(delta.reasoning_details) ||
        collectTextValue(responseReasoning)
    const textDelta =
        contentParts.text ||
        collectTextValue(delta.output_text) ||
        collectTextValue(delta.text) ||
        collectTextValue(responseDelta) ||
        ''
    const reasoningDelta = contentParts.reasoning || explicitReasoning || ''
    return {
        textDelta,
        reasoningDelta,
    }
}

export function getSystemPrompt(messages: ChatMessage[]) {
    const systemParts = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .filter(Boolean)
    if (systemParts.length === 0) return undefined
    return systemParts.join('\n')
}

export function getConversationMessages(messages: ChatMessage[]) {
    return messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
            role: m.role,
            content: m.content,
        }))
}

export function mapReasoningEffort(effort: 'minimal' | 'low' | 'medium' | 'high' | undefined) {
    if (effort === 'low' || effort === 'medium' || effort === 'high') return effort
    if (effort === 'minimal') return 'low'
    return 'high'
}

export function buildReasoningAwareContent(text: string, reasoning: string) {
    if (!reasoning) return text
    return [
        { type: 'reasoning', text: reasoning },
        { type: 'text', text },
    ]
}
