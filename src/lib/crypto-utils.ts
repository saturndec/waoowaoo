/**
 * API Key 加密/解密工具
 * 
 * 使用 AES-256-GCM 算法，密钥从 NEXTAUTH_SECRET 派生
 * 确保用户在网页上输入的 API Key 在数据库中加密存储
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32
const SALT = 'waoowaoo-api-key-salt-v1' // 固定盐值

/**
 * 从环境变量派生加密密钥
 * 优先使用 API_ENCRYPTION_KEY（开源版本固定值）
 * 后备使用 NEXTAUTH_SECRET
 */
function deriveEncryptionKey(): Buffer {
    // 优先使用专用的加密密钥（开源版本建议使用固定值）
    const secret = process.env.API_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET

    if (!secret) {
        throw new Error('API_ENCRYPTION_KEY 或 NEXTAUTH_SECRET 未配置，无法加密 API Key')
    }

    // 使用 PBKDF2 派生 32 字节密钥
    // 10万次迭代，足够安全且性能可接受
    return crypto.pbkdf2Sync(secret, SALT, 100000, KEY_LENGTH, 'sha256')
}

/**
 * 加密 API Key
 * 
 * @param plaintext 明文 API Key（用户输入）
 * @returns 加密后的字符串（格式：iv:authTag:encrypted，全部 hex 编码）
 * 
 * @example
 * const encrypted = encryptApiKey('sk-or-v1-abc123...')
 * // 返回: "a1b2c3d4e5f6....:d7e8f9a0b1c2....:1234567890ab...."
 */
export function encryptApiKey(plaintext: string): string {
    if (!plaintext || plaintext.trim() === '') {
        throw new Error('API Key 不能为空')
    }

    const key = deriveEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ])

    const authTag = cipher.getAuthTag()

    // 格式: iv:authTag:encrypted (hex 编码)
    return [
        iv.toString('hex'),
        authTag.toString('hex'),
        encrypted.toString('hex')
    ].join(':')
}

/**
 * 解密 API Key
 * 
 * @param ciphertext 加密后的字符串（encryptApiKey 的返回值）
 * @returns 明文 API Key
 * 
 * @example
 * const decrypted = decryptApiKey('a1b2c3d4e5f6....:d7e8f9a0b1c2....:1234567890ab....')
 * // 返回: "sk-or-v1-abc123..."
 */
export function decryptApiKey(ciphertext: string): string {
    if (!ciphertext || ciphertext.trim() === '') {
        throw new Error('加密数据不能为空')
    }

    const parts = ciphertext.split(':')
    if (parts.length !== 3) {
        throw new Error('加密数据格式错误')
    }

    const [ivHex, authTagHex, encryptedHex] = parts

    const key = deriveEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ])

    return decrypted.toString('utf8')
}

/**
 * 批量加密 API Key 对象
 * 
 * @param apiKeys 对象，key 为服务名，value 为对象（包含 apiKey 等字段）
 * @returns 加密后的字符串（JSON 格式）
 * 
 * @example
 * const encrypted = encryptApiKeyObject({
 *   google: { apiKey: 'abc123' },
 *   fal: { apiKey: 'xyz789' }
 * })
 */
export function encryptApiKeyObject(apiKeys: Record<string, any>): string {
    const encrypted: Record<string, any> = {}

    for (const [provider, config] of Object.entries(apiKeys)) {
        if (config && typeof config === 'object') {
            encrypted[provider] = { ...config }

            // 加密所有包含 'key' 或 'secret' 的字段
            for (const [key, value] of Object.entries(config)) {
                if (typeof value === 'string' && value.trim() !== '') {
                    const lowerKey = key.toLowerCase()
                    if (lowerKey.includes('key') || lowerKey.includes('secret')) {
                        encrypted[provider][key] = encryptApiKey(value)
                    }
                }
            }
        }
    }

    return JSON.stringify(encrypted)
}

/**
 * 批量解密 API Key 对象
 * 
 * @param encryptedJson 加密后的 JSON 字符串
 * @returns 解密后的对象
 */
export function decryptApiKeyObject(encryptedJson: string): Record<string, any> {
    if (!encryptedJson || encryptedJson.trim() === '') {
        return {}
    }

    try {
        const encrypted = JSON.parse(encryptedJson)
        const decrypted: Record<string, any> = {}

        for (const [provider, config] of Object.entries(encrypted)) {
            if (config && typeof config === 'object') {
                decrypted[provider] = { ...config }

                // 解密所有包含 'key' 或 'secret' 的字段
                for (const [key, value] of Object.entries(config as Record<string, any>)) {
                    if (typeof value === 'string' && value.trim() !== '') {
                        const lowerKey = key.toLowerCase()
                        if (lowerKey.includes('key') || lowerKey.includes('secret')) {
                            try {
                                decrypted[provider][key] = decryptApiKey(value)
                            } catch (error) {
                                console.error(`解密 ${provider}.${key} 失败:`, error)
                                // 如果解密失败，保持原值（可能是明文）
                                decrypted[provider][key] = value
                            }
                        }
                    }
                }
            }
        }

        return decrypted
    } catch (error) {
        console.error('解密 API Key 对象失败:', error)
        return {}
    }
}
