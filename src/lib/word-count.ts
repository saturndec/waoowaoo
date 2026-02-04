/**
 * 字数统计工具函数
 * 
 * 按照 Word 的字数统计规则：
 * - 中文：每个汉字算 1 字
 * - 英文：每个单词算 1 字（用空格分隔）
 * - 空格、换行符、标点不计入字数
 */

/**
 * 计算文本的字数（模拟 Microsoft Word 的字数统计）
 * 
 * @param text 输入文本
 * @returns 字数（不是字符数！）
 */
export function countWords(text: string): number {
    if (!text) return 0

    // 处理英文和数字：将连续的英文字母和数字视为一个"单词"
    // 先用正则替换掉英文+数字组成的单词，同时计数
    let englishWordCount = 0
    const textWithoutEnglish = text.replace(/[a-zA-Z0-9]+/g, () => {
        englishWordCount++
        return '' // 移除英文单词，剩下的就是中文和其他字符
    })

    // 统计中文字符数量
    // 使用 Unicode 范围匹配常用汉字 + 扩展 A/B 区
    const chineseMatches = textWithoutEnglish.match(/[\u4e00-\u9fa5\u3400-\u4dbf\u20000-\u2a6df]/g)
    const chineseCount = chineseMatches ? chineseMatches.length : 0

    return englishWordCount + chineseCount
}

/**
 * 计算文本的字符数（包括所有字符）
 * 这相当于 JavaScript 的 string.length
 * 
 * @param text 输入文本
 * @returns 字符数
 */
export function countCharacters(text: string): number {
    return text?.length || 0
}

/**
 * 计算文本的字符数（不含空格）
 * 
 * @param text 输入文本
 * @returns 字符数（不含空格）
 */
export function countCharactersNoSpaces(text: string): number {
    if (!text) return 0
    return text.replace(/\s/g, '').length
}
