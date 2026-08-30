// @tests unit/EstadoOperativo (Fase 5) — panel de excepciones abiertas
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EstadoOperativo, derivarExcepciones } from '../estado-operativo'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

describe('derivarExcepciones', () => {
  it('devuelve [] cuando no hay excepciones', () => {
    expect(derivarExcepciones({})).toEqual([])
    expect(derivarExcepciones({ deudas: [], productos: [], recovery: [] })).toEqual([])
  })

  it('mapea una discrepancia física (devueltas/cambios/rotas > 0)', () => {
    const res = derivarExcepciones({
      productos: [{ producto: 'PACA_AGUA', cargadas: 10, devueltas: 2, cambios: 0, rotas: 0 }],
    })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ tipo: 'PHYSICAL_MISMATCH', cta: 'fisico' })
    expect(res[0].titulo).toContain('Paca Agua')
    expect(res[0].descripcion).toContain('2 devueltas')
  })

  it('ignora productos sin desviación', () => {
    const res = derivarExcepciones({
      productos: [{ producto: 'PACA_AGUA', cargadas: 10, devueltas: 0, cambios: 0, rotas: 0 }],
    })
    expect(res).toEqual([])
  })

  it('mapea sobrantes y faltantes de recovery como PHYSICAL_MISMATCH', () => {
    const res = derivarExcepciones({
      recovery: [
        { id: 'r1', tipo: 'FALTANTE', producto: 'BOTELLON', cantidad: 3 },
        { id: 'r2', tipo: 'SOBRANTE', producto: 'PACA_HIELO', cantidad: 1 },
      ],
    })
    expect(res).toHaveLength(2)
    expect(res[0].titulo).toContain('Faltante')
    expect(res[1].titulo).toContain('Sobrante')
    expect(res.every((e) => e.tipo === 'PHYSICAL_MISMATCH')).toBe(true)
  })

  it('mapea un ResponsibilityCase FALTANTE_CAJA abierto como MONEY_MISMATCH con CTA a trabajador', () => {
    const res = derivarExcepciones({
      responsibilityCases: [
        { id: 'rc1', tipo: 'FALTANTE_CAJA', descripcion: 'Faltó plata en la caja', montoEstimado: 12000, estado: 'ABIERTA' },
      ],
    })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ tipo: 'MONEY_MISMATCH', cta: 'trabajador' })
    expect(res[0].descripcion).toContain('pendiente de resolución autorizada')
  })

  it('mapea un ResponsibilityCase DISCREPANCIA_INVENTARIO como PHYSICAL_MISMATCH con CTA a Físico', () => {
    const res = derivarExcepciones({
      responsibilityCases: [
        { id: 'rc2', tipo: 'DISCREPANCIA_INVENTARIO', descripcion: 'Faltan 3 botellones', montoEstimado: null, estado: 'EN_INVESTIGACION' },
      ],
    })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ tipo: 'PHYSICAL_MISMATCH', cta: 'fisico' })
  })

  it('mapea deuda con montoPendiente > 0 como MONEY_MISMATCH y omite deudas saldadas', () => {
    const res = derivarExcepciones({
      deudas: [
        { id: 'd1', montoOriginal: 5000, montoPendiente: 5000, tipo: 'FALTANTE_CAJA', descripcion: 'faltante' },
        { id: 'd2', montoOriginal: 1000, montoPendiente: 0, tipo: 'FALTANTE_CAJA', descripcion: 'saldada' },
      ],
    })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ tipo: 'MONEY_MISMATCH', cta: 'trabajador' })
  })

  it('combina fuentes: 1 recovery + 1 deuda → 2 filas', () => {
    const res = derivarExcepciones({
      recovery: [{ id: 'r1', tipo: 'FALTANTE', producto: 'BOTELLON', cantidad: 2 }],
      deudas: [{ id: 'd1', montoOriginal: 2000, montoPendiente: 2000, tipo: 'FALTANTE_CAJA', descripcion: 'faltante' }],
    })
    expect(res).toHaveLength(2)
  })
})

describe('EstadoOperativo', () => {
  it('no renderiza nada si no hay excepciones', async () => {
    const { container } = render(
      <EstadoOperativo
        embarqueId="e1"
        deudas={[]}
        productos={[]}
        trabajadorId="t1"
        onGoFisico={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renderiza las filas con CTA cuando hay deuda (money mismatch)', async () => {
    render(
      <EstadoOperativo
        embarqueId="e1"
        deudas={[{ id: 'd1', montoOriginal: 5000, montoPendiente: 5000, tipo: 'FALTANTE_CAJA', descripcion: 'faltante' }]}
        productos={[]}
        trabajadorId="t1"
      />,
    )
    expect(await screen.findByTestId('estado-operativo')).toBeTruthy()
    expect(screen.getByText('Deuda del trabajador')).toBeTruthy()
    expect(screen.getByTestId('estado-operativo-cta-trabajador')).toBeTruthy()
  })
})
