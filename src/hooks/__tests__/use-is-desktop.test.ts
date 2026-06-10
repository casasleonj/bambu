// @tests useIsDesktop hook — Fase 4 §6.4
// Verifica que el hook de detección de breakpoint funciona.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsDesktop } from '@/hooks/use-is-desktop'

describe('Fase 4 §6.4: useIsDesktop', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('min-width: 768') ? true : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('FIX: retorna true cuando el viewport es >= 768px (desktop)', () => {
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)
  })

  it('FIX: acepta breakpoint custom', () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: query.includes('min-width: 1024') ? true : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const { result } = renderHook(() => useIsDesktop(1024))
    expect(result.current).toBe(true)
  })

  it('FIX: retorna false en móvil (< 768px)', () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
  })
})
