import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { cn, formatCurrency, formatDate, formatZodError } from '@/lib/utils'

describe('cn', () => {
  it('merges simple class strings', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('filters out falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active', false && 'hidden')).toBe('base active')
  })

  it('handles object syntax', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active')
  })

  it('handles array syntax', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })

  it('returns empty string for only falsy arguments', () => {
    expect(cn(false, undefined, null, false)).toBe('')
  })

  it('resolves tailwind conflicts via twMerge', () => {
    expect(cn('px-2 py-1', 'p-3')).toBe('p-3')
  })

  it('handles mixed truthy and falsy with tailwind', () => {
    expect(cn('text-red-500', false && 'text-blue-500', 'font-bold')).toBe('text-red-500 font-bold')
  })

  it('preserves class order (no dedup for non-tailwind classes)', () => {
    expect(cn('foo', 'bar', 'foo')).toBe('foo bar foo')
  })
})

describe('formatCurrency', () => {
  it('formats zero', () => {
    const result = formatCurrency(0)
    expect(result).toContain('$')
    expect(result).toContain('0')
  })

  it('formats positive integer', () => {
    const result = formatCurrency(15000)
    expect(result).toContain('$')
    expect(result).toContain('15.000')
  })

  it('formats negative value', () => {
    const result = formatCurrency(-5000)
    expect(result).toContain('-')
    expect(result).toContain('$')
    expect(result).toContain('5.000')
  })

  it('formats large number with thousand separators', () => {
    const result = formatCurrency(123456789)
    expect(result).toContain('$')
    expect(result).toContain('.')
  })

  it('returns a string', () => {
    expect(typeof formatCurrency(100)).toBe('string')
  })

  it('is not empty', () => {
    expect(formatCurrency(100).length).toBeGreaterThan(0)
  })

  it('handles decimal values', () => {
    const result = formatCurrency(99.99)
    expect(result).toContain('$')
  })
})

describe('formatDate', () => {
  it('formats a Date object', () => {
    const result = formatDate(new Date(2024, 0, 15))
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('2024')
  })

  it('formats an ISO date string', () => {
    const result = formatDate('2024-06-15')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('2024')
  })

  it('returns es-CO formatted date', () => {
    // Jan 15, 2024 in es-CO medium format: "15 ene 2024"
    const result = formatDate(new Date(2024, 0, 15))
    expect(result).toContain('15')
    expect(result).toContain('2024')
  })

  it('handles epoch date', () => {
    const result = formatDate(new Date(0))
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles future dates', () => {
    const result = formatDate(new Date(2030, 5, 20))
    expect(result).toContain('2030')
  })

  it('handles both Date and string input types', () => {
    const result1 = formatDate(new Date(2024, 0, 15))
    const result2 = formatDate('2024-01-15')
    // both return non-empty string in es-CO medium format
    expect(result1.length).toBeGreaterThan(0)
    expect(result2.length).toBeGreaterThan(0)
    expect(result1).toContain('2024')
    expect(result2).toContain('2024')
  })
})

describe('formatZodError', () => {
  it('returns field error messages joined by comma', () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().min(18),
    })
    const result = schema.safeParse({ name: '', age: 10 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = formatZodError(result.error)
      expect(typeof message).toBe('string')
      expect(message.length).toBeGreaterThan(0)
    }
  })

  it('includes form-level errors', () => {
    const schema = z.object({
      name: z.string(),
    }).refine(() => false, { message: 'Custom form error' })

    const result = schema.safeParse({ name: 'test' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = formatZodError(result.error)
      expect(message).toContain('Custom form error')
    }
  })

  it('returns default message for empty errors', () => {
    const schema = z.object({
      name: z.string(),
    }).refine(() => false, { message: '' })

    const result = schema.safeParse({ name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      // formErrors with empty string gets filtered by .filter(Boolean)
      const message = formatZodError(result.error)
      // empty refine message is '' which gets filtered out, returns default
      expect(message).toBe('Error de validación')
    }
  })

  it('handles multiple field errors', () => {
    const schema = z.object({
      name: z.string().min(3),
      email: z.string().email(),
      age: z.number().min(18),
    })
    const result = schema.safeParse({ name: 'ab', email: 'not-email', age: 5 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = formatZodError(result.error)
      expect(typeof message).toBe('string')
      expect(message.length).toBeGreaterThan(0)
      expect(message).toContain(',')
    }
  })

  it('returns a string', () => {
    const schema = z.string().min(1)
    const result = schema.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(typeof formatZodError(result.error)).toBe('string')
    }
  })
})
