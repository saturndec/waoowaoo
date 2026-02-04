/**
 * 本地文件服务API
 * 
 * 仅在 STORAGE_TYPE=local 时使用
 * 提供本地文件的HTTP访问服务
 */

import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs/promises'
import * as path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads'

// MIME类型映射
const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.json': 'application/json',
    '.txt': 'text/plain',
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    return MIME_TYPES[ext] || 'application/octet-stream'
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path: pathSegments } = await params

        // 解码路径（因为URL编码过）
        const decodedPath = decodeURIComponent(pathSegments.join('/'))
        const filePath = path.join(process.cwd(), UPLOAD_DIR, decodedPath)

        // 安全检查：确保路径不会逃逸出上传目录
        const normalizedPath = path.normalize(filePath)
        const uploadDirPath = path.normalize(path.join(process.cwd(), UPLOAD_DIR))

        if (!normalizedPath.startsWith(uploadDirPath)) {
            console.error(`[Files API] 路径逃逸尝试: ${decodedPath}`)
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }

        // 读取文件
        const buffer = await fs.readFile(filePath)
        const mimeType = getMimeType(filePath)

        // 返回文件内容
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': mimeType,
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'public, max-age=31536000', // 1年缓存
            },
        })

    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return NextResponse.json({ error: 'File not found' }, { status: 404 })
        }

        console.error('[Files API] 读取文件失败:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
