import { describe, expect, it } from 'vitest'
import { getClientIp } from '@/lib/rate-limit'
import { NextRequest } from 'next/server'

describe('getClientIp', () => {
    const createReq = (headers: Record<string, string>, ip?: string) => {
        const url = 'http://localhost:3000/api/test'
        return {
            headers: {
                get: (name: string) => headers[name.toLowerCase()] || null
            },
            ip: ip
        } as unknown as NextRequest
    }

    it('should prioritize req.ip if present', () => {
        const req = createReq({
            'x-forwarded-for': '1.1.1.1',
            'x-real-ip': '2.2.2.2'
        }, '3.3.3.3')

        expect(getClientIp(req)).toBe('3.3.3.3')
    })

    it('should use x-real-ip if req.ip is missing', () => {
        const req = createReq({
            'x-forwarded-for': '1.1.1.1',
            'x-real-ip': '2.2.2.2'
        })

        expect(getClientIp(req)).toBe('2.2.2.2')
    })

    it('should use first IP in x-forwarded-for if req.ip and x-real-ip are missing', () => {
        const req = createReq({
            'x-forwarded-for': '1.1.1.1, 8.8.8.8'
        })

        expect(getClientIp(req)).toBe('1.1.1.1')
    })

    it('should handle x-forwarded-for with spaces', () => {
        const req = createReq({
            'x-forwarded-for': ' 1.1.1.1 , 8.8.8.8'
        })

        expect(getClientIp(req)).toBe('1.1.1.1')
    })

    it('should fallback to 127.0.0.1 if no headers or ip property are present', () => {
        const req = createReq({})

        expect(getClientIp(req)).toBe('127.0.0.1')
    })

    it('should prefer x-real-ip over x-forwarded-for if both are present but req.ip is missing', () => {
        const req = createReq({
            'x-forwarded-for': '1.1.1.1',
            'x-real-ip': '2.2.2.2'
        })

        expect(getClientIp(req)).toBe('2.2.2.2')
    })
})
