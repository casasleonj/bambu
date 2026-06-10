import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MoneyDisplay, shouldMaskMoneyForRole } from '@/components/money-display'

describe('shouldMaskMoneyForRole', () => {
  it('masks for REPARTIDOR', () => {
    expect(shouldMaskMoneyForRole('REPARTIDOR')).toBe(true)
  })
  it('does not mask for ADMIN', () => {
    expect(shouldMaskMoneyForRole('ADMIN')).toBe(false)
  })
  it('does not mask for ASISTENTE', () => {
    expect(shouldMaskMoneyForRole('ASISTENTE')).toBe(false)
  })
  it('does not mask for null', () => {
    expect(shouldMaskMoneyForRole(null)).toBe(false)
  })
  it('does not mask for CONTADOR', () => {
    expect(shouldMaskMoneyForRole('CONTADOR')).toBe(false)
  })
})

describe('MoneyDisplay', () => {
  it('renders the value formatted for ADMIN', () => {
    const { container } = render(
      <MoneyDisplay value={50000} userRole="ADMIN" />,
    )
    expect(container.textContent).toContain('50.000')
  })

  it('masks the value for REPARTIDOR', () => {
    const { container } = render(
      <MoneyDisplay value={50000} userRole="REPARTIDOR" />,
    )
    expect(container.textContent).not.toContain('50.000')
    expect(container.textContent).not.toContain('50000')
  })

  it('respects forceShow=true even for REPARTIDOR', () => {
    const { container } = render(
      <MoneyDisplay value={50000} userRole="REPARTIDOR" forceShow />,
    )
    expect(container.textContent).toContain('50.000')
  })

  it('uses custom maskedText when provided', () => {
    const { container } = render(
      <MoneyDisplay value={50000} userRole="REPARTIDOR" maskedText="$ ••••" />,
    )
    expect(container.textContent).toContain('$ ••••')
  })

  it('renders 0 as a regular value', () => {
    const { container } = render(
      <MoneyDisplay value={0} userRole="ADMIN" />,
    )
    expect(container.textContent).toContain('0')
  })

  it('handles null value gracefully', () => {
    const { container } = render(
      <MoneyDisplay value={null} userRole="ADMIN" />,
    )
    expect(container.textContent).toBeDefined()
  })
})
