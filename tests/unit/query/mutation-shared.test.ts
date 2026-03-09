import { describe, expect, it, vi } from 'vitest'
import {
  requestJsonWithError,
  type MutationRequestError,
} from '@/lib/query/mutations/mutation-shared'

describe('query mutation shared compatibility with normalized error contract', () => {
  it('preserves messageKey/defaultMessage/code from backend error payload', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'INVALID_PARAMS',
              message: 'baseUrl is required',
              messageKey: 'errors.INVALID_PARAMS',
              defaultMessage: 'Invalid parameters',
            },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )

    await expect(
      requestJsonWithError('/api/user/api-config/fetch-models', { method: 'POST' }, 'fallback message'),
    ).rejects.toMatchObject({
      message: 'baseUrl is required',
      code: 'INVALID_PARAMS',
      messageKey: 'errors.INVALID_PARAMS',
      defaultMessage: 'Invalid parameters',
      status: 400,
    } satisfies Partial<MutationRequestError>)

    fetchMock.mockRestore()
  })
})
