/**
 * 图片黑边标签处理工具
 * 用于给图片添加/更新顶部的黑边文字标签
 */

import sharp from 'sharp'
import { uploadToCOS, getSignedUrl, generateUniqueKey } from '@/lib/cos'
import { initializeFonts, createLabelSVG } from '@/lib/fonts'

/**
 * 更新图片的黑边标签（裁剪旧标签 + 添加新标签）
 * 
 * @param imageUrl - 原始图片 URL 或 COS key
 * @param newLabelText - 新的标签文本
 * @param options - 可选配置
 * @returns 更新后的 COS key
 */
export async function updateImageLabel(
    imageUrl: string,
    newLabelText: string,
    options?: {
        /** 是否生成新的 key（默认覆盖原 key） */
        generateNewKey?: boolean
        /** 新 key 的前缀（仅当 generateNewKey=true 时有效） */
        keyPrefix?: string
    }
): Promise<string> {
    await initializeFonts()

    // 获取原始 COS key（用于覆盖上传）
    let originalKey: string
    if (imageUrl.startsWith('http')) {
        // 从URL中提取key，例如 https://xxx.cos.xxx/images/xxx.jpg?signature... -> images/xxx.jpg
        const urlObj = new URL(imageUrl)
        originalKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname
    } else if (imageUrl.startsWith('/api/files/')) {
        // 🔧 本地模式修复：从 /api/files/xxx 提取 key
        originalKey = decodeURIComponent(imageUrl.replace('/api/files/', ''))
    } else {
        originalKey = imageUrl
    }

    // 获取签名 URL 用于下载
    let signedUrl: string
    if (imageUrl.startsWith('http')) {
        signedUrl = imageUrl
    } else if (imageUrl.startsWith('/')) {
        // 🔧 本地模式修复：相对路径需要补全完整 URL
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
        signedUrl = `${baseUrl}${imageUrl}`
    } else {
        signedUrl = getSignedUrl(imageUrl, 3600)
        // 🔧 本地模式修复：如果返回的是相对路径，需要补全
        if (signedUrl.startsWith('/')) {
            const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
            signedUrl = `${baseUrl}${signedUrl}`
        }
    }

    // 下载图片
    const response = await fetch(signedUrl)
    if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())

    // 获取图片元数据
    const meta = await sharp(buffer).metadata()
    const w = meta.width || 2160
    const h = meta.height || 2160

    // 计算标签条高度（与生成时一致：高度的 4%）
    const fontSize = Math.floor(h * 0.04)
    const pad = Math.floor(fontSize * 0.5)
    const barH = fontSize + pad * 2

    // 裁剪掉顶部的旧标签条
    const croppedBuffer = await sharp(buffer)
        .extract({ left: 0, top: barH, width: w, height: h - barH })
        .toBuffer()

    // 创建新的 SVG 标签条
    const svg = await createLabelSVG(w, barH, fontSize, pad, newLabelText)

    // 添加新标签条到图片顶部
    const processed = await sharp(croppedBuffer)
        .extend({ top: barH, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .composite([{ input: svg, top: 0, left: 0 }])
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer()

    // 决定使用原始 key 还是生成新 key
    const finalKey = options?.generateNewKey
        ? generateUniqueKey(options.keyPrefix || 'labeled-image', 'jpg')
        : originalKey

    await uploadToCOS(processed, finalKey)
    return finalKey
}

/**
 * 批量更新角色形象的标签
 * 用于从资产中心复制角色到项目时更新标签
 */
export async function updateCharacterAppearanceLabels(
    appearances: Array<{
        imageUrl: string | null
        imageUrls: string | null
        changeReason: string
    }>,
    characterName: string
): Promise<Array<{ imageUrl: string | null; imageUrls: string | null }>> {
    const results: Array<{ imageUrl: string | null; imageUrls: string | null }> = []

    for (const appearance of appearances) {
        try {
            // 获取图片 URLs
            let imageUrls: string[] = []
            if (appearance.imageUrls) {
                try {
                    imageUrls = JSON.parse(appearance.imageUrls)
                } catch { }
            } else if (appearance.imageUrl) {
                imageUrls = [appearance.imageUrl]
            }

            if (imageUrls.length === 0) {
                results.push({ imageUrl: null, imageUrls: null })
                continue
            }

            // 更新每张图片的标签
            const newLabelText = `${characterName} - ${appearance.changeReason}`
            const newImageUrls = await Promise.all(
                imageUrls.map(async (url) => {
                    if (!url) return null
                    try {
                        // 生成新的 key，避免覆盖资产中心的原图
                        return await updateImageLabel(url, newLabelText, {
                            generateNewKey: true,
                            keyPrefix: `project-char-copy`
                        })
                    } catch (e) {
                        console.error(`Failed to update label for image:`, e)
                        return url // 失败时保留原 URL
                    }
                })
            )

            const firstUrl = newImageUrls.find(u => u !== null) || null
            results.push({
                imageUrl: firstUrl,
                imageUrls: JSON.stringify(newImageUrls)
            })
        } catch (e) {
            console.error('Failed to update appearance labels:', e)
            results.push({ imageUrl: appearance.imageUrl, imageUrls: appearance.imageUrls })
        }
    }

    return results
}

/**
 * 批量更新场景图片的标签
 * 用于从资产中心复制场景到项目时更新标签
 */
export async function updateLocationImageLabels(
    images: Array<{
        imageUrl: string | null
    }>,
    locationName: string
): Promise<Array<{ imageUrl: string | null }>> {
    const results: Array<{ imageUrl: string | null }> = []

    for (const image of images) {
        if (!image.imageUrl) {
            results.push({ imageUrl: null })
            continue
        }

        try {
            // 生成新的 key，避免覆盖资产中心的原图
            const newImageUrl = await updateImageLabel(image.imageUrl, locationName, {
                generateNewKey: true,
                keyPrefix: `project-loc-copy`
            })
            results.push({ imageUrl: newImageUrl })
        } catch (e) {
            console.error('Failed to update location image label:', e)
            results.push({ imageUrl: image.imageUrl })
        }
    }

    return results
}
