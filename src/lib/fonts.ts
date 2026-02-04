import fs from 'fs'
import path from 'path'
import { ImageResponse } from '@vercel/og'

// 字体文件可能的路径（按优先级尝试）
const POSSIBLE_FONT_PATHS = [
    path.join(process.cwd(), 'src/assets/fonts/NotoSansSC-Regular.ttf'),
    path.join(process.cwd(), '.next/server/src/assets/fonts/NotoSansSC-Regular.ttf'),
]

// 缓存字体数据（只加载一次）
let fontDataCache: Buffer | null = null
let fontInitialized = false

/**
 * 加载字体文件
 */
function loadFontData(): Buffer | null {
    if (fontDataCache) {
        return fontDataCache
    }

    console.log('[Fonts] Searching for font file...')

    for (const fontPath of POSSIBLE_FONT_PATHS) {
        console.log('[Fonts] Trying:', fontPath)
        if (fs.existsSync(fontPath)) {
            fontDataCache = fs.readFileSync(fontPath)
            console.log('[Fonts] ✅ Font loaded:', fontPath, `(${(fontDataCache.length / 1024 / 1024).toFixed(2)} MB)`)
            return fontDataCache
        }
    }

    console.error('[Fonts] ❌ Font file not found')
    return null
}

/**
 * 初始化字体配置（预加载字体到内存）
 */
export async function initializeFonts(): Promise<void> {
    if (fontInitialized) {
        return
    }

    loadFontData()
    fontInitialized = true
}

/**
 * 获取字体名称
 */
export function getFontFamily(): string {
    return 'NotoSansSC'
}

/**
 * 使用 @vercel/og 生成文字标签图片（PNG Buffer）
 * 这个方案使用纯 WebAssembly，不依赖任何原生模块或系统库
 * 在本地和 Vercel 环境都能正常工作
 */
export async function createLabelSVG(
    width: number,
    barHeight: number,
    fontSize: number,
    padding: number,
    labelText: string
): Promise<Buffer> {
    const fontData = loadFontData()

    if (!fontData) {
        console.error('[Fonts] Cannot create label image without font')
        // 返回一个空的黑色图片
        return createFallbackImage(width, barHeight)
    }

    try {
        // 使用 @vercel/og 的 ImageResponse 生成图片
        const response = new ImageResponse(
            {
                type: 'div',
                props: {
                    style: {
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'black',
                        paddingLeft: padding,
                        paddingRight: padding,
                    },
                    children: {
                        type: 'span',
                        props: {
                            style: {
                                color: 'white',
                                fontSize: fontSize,
                                fontWeight: 'bold',
                                fontFamily: 'NotoSansSC',
                            },
                            children: labelText,
                        },
                    },
                },
            },
            {
                width: width,
                height: barHeight,
                fonts: [
                    {
                        name: 'NotoSansSC',
                        data: fontData,
                        weight: 400,
                        style: 'normal',
                    },
                ],
            }
        )

        // 从 Response 获取 Buffer
        const arrayBuffer = await response.arrayBuffer()
        return Buffer.from(arrayBuffer)
    } catch (error) {
        console.error('[Fonts] Error creating label image:', error)
        return createFallbackImage(width, barHeight)
    }
}

/**
 * 创建备用的黑色图片（当字体加载失败时）
 */
async function createFallbackImage(width: number, height: number): Promise<Buffer> {
    // 使用 sharp 创建一个黑色矩形
    const sharp = (await import('sharp')).default
    return sharp({
        create: {
            width: width,
            height: height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
    })
        .png()
        .toBuffer()
}
