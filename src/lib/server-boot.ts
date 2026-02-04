// 服务器启动时生成的唯一ID，用于检测服务器重启
// 每次服务器重启，这个值都会变化
export const SERVER_BOOT_ID = `boot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

console.log(`[Server] Boot ID: ${SERVER_BOOT_ID}`)
