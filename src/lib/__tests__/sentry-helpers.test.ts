import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Sentry
vi.mock('@sentry/nextjs', () => {
  const captureException = vi.fn()
  const captureMessage = vi.fn()
  const addBreadcrumb = vi.fn()
  const withScope = vi.fn((fn: (scope: any) => any) =>
    fn({
      setTag: vi.fn(),
      setExtra: vi.fn(),
      setUser: vi.fn(),
      setLevel: vi.fn(),
    }),
  )
  return {
    captureException,
    captureMessage,
    addBreadcrumb,
    withScope,
  }
})

import * as Sentry from '@sentry/nextjs'
import { captureApiError, addApiBreadcrumb, withSentryScope } from '@/lib/sentry-helpers'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('captureApiError', () => {
  it('captures with endpoint, rol, userId tags', () => {
    const err = new Error('boom')
    captureApiError(err, {
      endpoint: 'produccion.POST',
      rol: 'ADMIN',
      userId: 'user_123',
    })
    expect(Sentry.withScope).toHaveBeenCalled()
    expect(Sentry.captureException).toHaveBeenCalledWith(err)
  })

  it('derives feature tag from endpoint (produccion.POST → produccion)', () => {
    const setTagMock = vi.fn()
    vi.mocked(Sentry.withScope).mockImplementationOnce((fn: any) =>
      fn({
        setTag: setTagMock,
        setExtra: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
      }),
    )
    captureApiError(new Error('x'), { endpoint: 'produccion.POST' })
    expect(setTagMock).toHaveBeenCalledWith('feature', 'produccion')
    expect(setTagMock).toHaveBeenCalledWith('endpoint', 'produccion.POST')
  })

  it('handles non-Error values by wrapping in Error', () => {
    captureApiError('plain string', { endpoint: 'x.y' })
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
    const passed = vi.mocked(Sentry.captureException).mock.calls[0][0] as Error
    expect(passed.message).toBe('plain string')
  })

  it('attaches extras as Sentry context', () => {
    const setExtraMock = vi.fn()
    vi.mocked(Sentry.withScope).mockImplementationOnce((fn: any) =>
      fn({
        setTag: vi.fn(),
        setExtra: setExtraMock,
        setUser: vi.fn(),
        setLevel: vi.fn(),
      }),
    )
    captureApiError(new Error('x'), {
      endpoint: 'produccion.POST',
      extra: { turno: 'NOCHE', attempt: 2 },
    })
    expect(setExtraMock).toHaveBeenCalledWith('turno', 'NOCHE')
    expect(setExtraMock).toHaveBeenCalledWith('attempt', 2)
  })

  it('respects custom severity level', () => {
    const setLevelMock = vi.fn()
    vi.mocked(Sentry.withScope).mockImplementationOnce((fn: any) =>
      fn({
        setTag: vi.fn(),
        setExtra: vi.fn(),
        setUser: vi.fn(),
        setLevel: setLevelMock,
      }),
    )
    captureApiError(new Error('x'), { endpoint: 'x', level: 'warning' })
    expect(setLevelMock).toHaveBeenCalledWith('warning')
  })

  it('skips rol/userId if not provided', () => {
    const setTagMock = vi.fn()
    const setUserMock = vi.fn()
    vi.mocked(Sentry.withScope).mockImplementationOnce((fn: any) =>
      fn({
        setTag: setTagMock,
        setExtra: vi.fn(),
        setUser: setUserMock,
        setLevel: vi.fn(),
      }),
    )
    captureApiError(new Error('x'), { endpoint: 'produccion.GET' })
    // Should not call setTag for rol (only endpoint and feature)
    const tagCalls = setTagMock.mock.calls.map(c => c[0])
    expect(tagCalls).not.toContain('rol')
    // Should not call setUser
    expect(setUserMock).not.toHaveBeenCalled()
  })
})

describe('addApiBreadcrumb', () => {
  it('adds breadcrumb with message and data', () => {
    addApiBreadcrumb('Iniciando POST produccion', { turno: 'MANANA' })
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Iniciando POST produccion',
        data: { turno: 'MANANA' },
      }),
    )
  })
})

describe('withSentryScope', () => {
  it('returns the function result on success', async () => {
    const result = await withSentryScope({ endpoint: 'x' }, async () => 42)
    expect(result).toBe(42)
  })

  it('captures and re-throws on error', async () => {
    const err = new Error('wrapped')
    await expect(
      withSentryScope({ endpoint: 'produccion.POST', rol: 'ADMIN' }, async () => {
        throw err
      }),
    ).rejects.toThrow('wrapped')
    expect(Sentry.captureException).toHaveBeenCalledWith(err)
  })
})
