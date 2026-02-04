/**
 * 分集标记检测器
 * 用于检测文本中是否存在明确的分集标记，支持预分割
 */

import { countWords } from './word-count'

export interface EpisodeMarkerMatch {
    index: number          // 在原文中的位置
    text: string           // 匹配到的标记文本
    episodeNumber: number  // 推断的集数
}

export interface PreviewSplit {
    number: number
    title: string
    wordCount: number
    startIndex: number
    endIndex: number
    preview: string        // 前20字预览
}

export interface EpisodeMarkerResult {
    hasMarkers: boolean
    markerType: string
    markerTypeKey: string  // i18n key
    confidence: 'high' | 'medium' | 'low'
    matches: EpisodeMarkerMatch[]
    previewSplits: PreviewSplit[]
}

// 中文数字映射
const CHINESE_NUMBERS: Record<string, number> = {
    '零': 0, '〇': 0,
    '一': 1, '壹': 1,
    '二': 2, '贰': 2, '两': 2,
    '三': 3, '叁': 3,
    '四': 4, '肆': 4,
    '五': 5, '伍': 5,
    '六': 6, '陆': 6,
    '七': 7, '柒': 7,
    '八': 8, '捌': 8,
    '九': 9, '玖': 9,
    '十': 10, '拾': 10,
    '百': 100, '佰': 100,
    '千': 1000, '仟': 1000,
}

/**
 * 将中文数字转换为阿拉伯数字
 */
function chineseToNumber(chinese: string): number {
    // 如果是纯数字，直接返回
    if (/^\d+$/.test(chinese)) {
        return parseInt(chinese, 10)
    }

    let result = 0
    let temp = 0
    let lastUnit = 1

    for (const char of chinese) {
        const num = CHINESE_NUMBERS[char]
        if (num === undefined) continue

        if (num >= 10) {
            // 单位（十、百、千）
            if (temp === 0) temp = 1
            temp *= num
            if (num >= lastUnit) {
                result += temp
                temp = 0
            }
            lastUnit = num
        } else {
            // 数字
            temp = num
        }
    }

    return result + temp
}

// 检测模式定义
interface DetectionPattern {
    regex: RegExp
    typeKey: string
    typeName: string
    extractNumber: (match: RegExpMatchArray) => number
    extractTitle: (match: RegExpMatchArray, content: string, nextIndex?: number) => string
}

const DETECTION_PATTERNS: DetectionPattern[] = [
    // 1. 中文"第X集"
    {
        regex: /^第([一二三四五六七八九十百千\d]+)集[：:\s]*(.*)?/gm,
        typeKey: 'episode',
        typeName: '第X集',
        extractNumber: (match) => chineseToNumber(match[1]),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // 2. 中文"第X章"
    {
        regex: /^第([一二三四五六七八九十百千\d]+)章[：:\s]*(.*)?/gm,
        typeKey: 'chapter',
        typeName: '第X章',
        extractNumber: (match) => chineseToNumber(match[1]),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // 3. 中文"第X幕"
    {
        regex: /^第([一二三四五六七八九十百千\d]+)幕[：:\s]*(.*)?/gm,
        typeKey: 'act',
        typeName: '第X幕',
        extractNumber: (match) => chineseToNumber(match[1]),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // 4. 场景编号 X-Y【场景】 - 只取第一个数字作为集数
    {
        regex: /^(\d+)-\d+[【\[](.*?)[】\]]/gm,
        typeKey: 'scene',
        typeName: 'X-Y【场景】',
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // 5. 数字前缀 "1. 标题" 或 "1、标题"
    {
        regex: /^(\d+)[\.、：:]\s*(.+)/gm,
        typeKey: 'numbered',
        typeName: '数字编号',
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim().slice(0, 20) || ''
    },
    // 5.5 数字+转义点 "1\." 或 "3\."（Markdown格式）
    {
        regex: /^(\d+)\\\.\s*(.+)/gm,
        typeKey: 'numberedEscaped',
        typeName: '数字编号(转义)',
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim().slice(0, 20) || ''
    },
    // 5.6 纯数字后直接跟中文（无分隔符）如 "1太子带回" - 需要数字在行首或段首
    {
        regex: /(?:^|\n\n)(\d+)([\u4e00-\u9fa5])/gm,
        typeKey: 'numberedDirect',
        typeName: '数字+中文',
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim().slice(0, 20) || ''
    },
    // 6. 英文 Episode
    {
        regex: /^Episode\s*(\d+)[：:\s]*(.*)?/gim,
        typeKey: 'episodeEn',
        typeName: 'Episode X',
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // 7. 英文 Chapter
    {
        regex: /^Chapter\s*(\d+)[：:\s]*(.*)?/gim,
        typeKey: 'chapterEn',
        typeName: 'Chapter X',
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: (match) => match[2]?.trim() || ''
    },
    // 8. Markdown加粗数字标记 (如 "...内容**1**内容..." 或 "...内容**3**内容...")
    // 支持行内出现，不要求单独一行
    {
        regex: /\*\*(\d+)\*\*/g,
        typeKey: 'boldNumber',
        typeName: '**数字**',
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: () => ''
    },
    // 9. 纯数字单独一行 (如 "1\n内容")
    {
        regex: /^(\d+)\s*$/gm,
        typeKey: 'pureNumber',
        typeName: '纯数字',
        extractNumber: (match) => parseInt(match[1], 10),
        extractTitle: () => ''
    },
]

/**
 * 检测文本中的分集标记
 */
export function detectEpisodeMarkers(content: string): EpisodeMarkerResult {
    const result: EpisodeMarkerResult = {
        hasMarkers: false,
        markerType: '',
        markerTypeKey: '',
        confidence: 'low',
        matches: [],
        previewSplits: []
    }

    if (!content || content.length < 100) {
        return result
    }

    // 尝试每种模式
    for (const pattern of DETECTION_PATTERNS) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
        const matches: EpisodeMarkerMatch[] = []
        let match: RegExpExecArray | null

        while ((match = regex.exec(content)) !== null) {
            const episodeNumber = pattern.extractNumber(match)

            // 场景编号特殊处理：同一集只记录第一次出现
            if (pattern.typeKey === 'scene') {
                const existingMatch = matches.find(m => m.episodeNumber === episodeNumber)
                if (existingMatch) {
                    continue // 跳过同一集的后续场景
                }
            }

            matches.push({
                index: match.index,
                text: match[0],
                episodeNumber
            })
        }

        // 如果这种模式匹配数量更多，使用它
        if (matches.length >= 2 && matches.length > result.matches.length) {
            result.matches = matches
            result.markerType = pattern.typeName
            result.markerTypeKey = pattern.typeKey
            result.hasMarkers = true
        }
    }

    if (!result.hasMarkers) {
        return result
    }

    // 按位置排序
    result.matches.sort((a, b) => a.index - b.index)

    // 计算置信度
    const matchCount = result.matches.length
    const avgDistance = result.matches.length > 1
        ? (result.matches[result.matches.length - 1].index - result.matches[0].index) / (result.matches.length - 1)
        : 0

    if (matchCount >= 3 && avgDistance >= 500 && avgDistance <= 8000) {
        result.confidence = 'high'
    } else if (matchCount >= 2) {
        result.confidence = 'medium'
    } else {
        result.confidence = 'low'
    }

    // 生成预览分割
    const previewSplits: PreviewSplit[] = []

    // 🔥 检查第一个标记是否不是第1集，如果是且前面有内容，自动补充缺失的集
    const firstMatch = result.matches[0]
    if (firstMatch && firstMatch.episodeNumber > 1 && firstMatch.index > 100) {
        // 补充从第1集到第一个标记前的所有集
        for (let i = 1; i < firstMatch.episodeNumber; i++) {
            const startIndex = i === 1 ? 0 : Math.floor(firstMatch.index * (i - 1) / (firstMatch.episodeNumber - 1))
            const endIndex = i === firstMatch.episodeNumber - 1 ? firstMatch.index : Math.floor(firstMatch.index * i / (firstMatch.episodeNumber - 1))

            // 只有第1集使用所有前面的内容
            if (i === 1) {
                const episodeContent = content.slice(0, firstMatch.index)
                const preview = episodeContent.slice(0, 50).trim().slice(0, 20)
                previewSplits.push({
                    number: i,
                    title: `第 ${i} 集`,
                    wordCount: countWords(episodeContent),
                    startIndex: 0,
                    endIndex: firstMatch.index,
                    preview: preview + (preview.length >= 20 ? '...' : '')
                })
                break // 只补充第1集，后续的1和2可能只是格式不同
            }
        }
    }

    // 处理正常检测到的标记
    result.matches.forEach((match, idx) => {
        const startIndex = idx === 0 && previewSplits.length === 0 ? 0 : match.index
        const endIndex = idx < result.matches.length - 1
            ? result.matches[idx + 1].index
            : content.length

        const episodeContent = content.slice(startIndex, endIndex)
        const wordCount = countWords(episodeContent)

        // 标题固定使用"第 X 集"格式
        const title = `第 ${match.episodeNumber} 集`

        // 生成预览：从数字前缀后开始取内容（只跳过如 "1." 这样的前缀，不跳过整行）
        const markerPositionInContent = match.index - startIndex
        // 计算数字前缀的长度
        const markerPrefix = match.text.match(/^(?:第[一二三四五六七八九十百千\d]+[集章幕]|Episode\s*\d+|Chapter\s*\d+|\*\*\d+\*\*|\d+)[\.、：:\s]*/i)?.[0] || ''
        const prefixLength = markerPrefix.length || match.text.length
        const previewStart = markerPositionInContent + prefixLength
        const preview = episodeContent.slice(previewStart, previewStart + 50).trim().slice(0, 20)

        previewSplits.push({
            number: match.episodeNumber,
            title,
            wordCount,
            startIndex,
            endIndex,
            preview: preview + (preview.length >= 20 ? '...' : '')
        })
    })

    result.previewSplits = previewSplits

    return result
}

/**
 * 根据检测结果分割内容
 */
export function splitByMarkers(content: string, markerResult: EpisodeMarkerResult): Array<{
    number: number
    title: string
    summary: string
    content: string
    wordCount: number
}> {
    if (!markerResult.hasMarkers || markerResult.previewSplits.length === 0) {
        return []
    }

    return markerResult.previewSplits.map(split => {
        const episodeContent = content.slice(split.startIndex, split.endIndex).trim()

        return {
            number: split.number,
            title: split.title || `第 ${split.number} 集`,
            summary: '', // 标识符分集不生成摘要
            content: episodeContent,
            wordCount: countWords(episodeContent)
        }
    })
}
