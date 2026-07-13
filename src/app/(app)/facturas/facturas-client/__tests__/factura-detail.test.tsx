import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FacturaDetail } from '../factura-detail'
import type { Factura, EmpresaConfig } from '../types'

const empresaConfig: EmpresaConfig = {
  nombre: 'Agua Bambú',
  nit: '123456789',
  direccion: 'Calle 1',
  telefono: '3000000000',
  email: 'test@example.com',
}

function buildFactura(overrides: Partial<Factura> = {}): Factura {
  return {
    id: 'factura-1',
    numero: 'F-001',
    fecha: '2026-07-13T00:00:00.000Z',
    total: 100000,
    saldo: 0,
    estado: 'PAGADA',
    pedidoId: 'pedido-1',
    montoPagado: 100000,
    cliente: {
      id: 'cliente-1',
      nombre: 'Juan',
      apellido: 'Pérez',
      telefono: '3000000000',
      nombreNegocio: null,
    },
    pedido: {
      id: 'pedido-1',
      numero: 1,
      items: [
        {
          id: 'item-1',
          producto: 'PACA_AGUA',
          cantPedido: 1,
          cantEntrega: 1,
          precio: 100000,
          subtotal: 100000,
        },
      ],
    },
    ...overrides,
  }
}

describe('FacturaDetail — estado ANULADA', () => {
  it('renderiza "Anulada" en gris en el card de Saldo/Estado', async () => {
    render(
      <FacturaDetail
        factura={buildFactura({ estado: 'ANULADA', saldo: 0, montoPagado: 0 })}
        empresaConfig={empresaConfig}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Anulada')).toBeInTheDocument()
    })

    const estadoLabel = screen.getByText('Estado')
    expect(estadoLabel).toBeInTheDocument()
  })

  it('no renderiza "PAGADA" en el card de Saldo/Estado', async () => {
    render(
      <FacturaDetail
        factura={buildFactura({ estado: 'ANULADA', saldo: 0, montoPagado: 0 })}
        empresaConfig={empresaConfig}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Anulada')).toBeInTheDocument()
    })

    expect(screen.queryByText('PAGADA')).not.toBeInTheDocument()
  })

  it('oculta la barra de progreso', async () => {
    render(
      <FacturaDetail
        factura={buildFactura({ estado: 'ANULADA', saldo: 0, montoPagado: 0 })}
        empresaConfig={empresaConfig}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Anulada')).toBeInTheDocument()
    })

    expect(screen.queryByText('Progreso de pago')).not.toBeInTheDocument()
  })

  it('no muestra el botón Registrar Abono', async () => {
    render(
      <FacturaDetail
        factura={buildFactura({ estado: 'ANULADA', saldo: 50000, montoPagado: 50000 })}
        empresaConfig={empresaConfig}
        onRegistrarAbono={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Anulada')).toBeInTheDocument()
    })

    expect(screen.queryByText('Registrar Abono')).not.toBeInTheDocument()
  })
})

describe('FacturaDetail — estado PAGADA (sanity)', () => {
  it('renderiza "PAGADA" en el card de Saldo/Estado cuando no está anulada', async () => {
    render(
      <FacturaDetail
        factura={buildFactura({ estado: 'PAGADA', saldo: 0, montoPagado: 100000 })}
        empresaConfig={empresaConfig}
      />
    )

    await waitFor(() => {
      // El badge del header y el card del saldo ambos dicen "PAGADA"
      const pagadas = screen.getAllByText('PAGADA')
      expect(pagadas.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('muestra la barra de progreso', async () => {
    render(
      <FacturaDetail
        factura={buildFactura({ estado: 'PAGADA', saldo: 0, montoPagado: 100000 })}
        empresaConfig={empresaConfig}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Progreso de pago')).toBeInTheDocument()
    })
  })
})
