import { NextResponse } from 'next/server'
import { SERVER_BOOT_ID } from '@/lib/server-boot'

/**
 * GET /api/system/boot-id
 * 返回服务器启动ID，用于检测服务器是否重启
 */
export async function GET() {
    return NextResponse.json({ bootId: SERVER_BOOT_ID })
}
