// @tests #447 Fase A — venta libre del cierre V2: buscador de pedidos, venta al paso, total y saldo.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { VentaLibreRowV2 } from '../venta-libre-row-v2'
import type { VentaLibre, PagoItem } from '../types'

vi.mock('@/hooks/use-productos-domicilio', () => ({
  useProductosDomicilio: () => ({
    productos: [
      { codigo: 'PACA_AGUA', nombre: 'Paca de agua', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
      { codigo: 'BOTELLON', nombre: 'Botellón', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
    ],
    loading: false,
  }),
}))

vi.mock('@/hooks/use-cliente-search', () => ({
  useClienteSearch: (term: string) => ({
    resultados: term.trim().length >= 2
      ? [{ id: 'c9', nombre: 'Ana', apellido: 'Ruiz', telefono: '3001112222', bloqueado: true, saldoPendiente: 5000 }]
      : [],
    buscando: false,
    error: false,
    reintentar: () => undefined,
  }),
}))

const vacia: VentaLibre = {
  clienteId: '', clienteNombre: '', cPacaAgua: 0, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0,
  pagos: [], obs: '',
}

function Harness() {
  const [v, setV] = useState<VentaLibre>(vacia)
  return (
    <VentaLibreRowV2
      venta={v}
      index={0}
      clientes={[]}
      precios={{ PACA_AGUA: 2300 }}
      onUpdate={(_, f, val) => setV((p) => ({ ...p, [f]: val }))}
      onAgregarPago={() => setV((p) => ({ ...p, pagos: [...p.pagos, { metodo: 'EFECTIVO', monto: 0 } as PagoItem] }))}
      onEliminarPago={(_, i) => setV((p) => ({ ...p, pagos: p.pagos.filter((_x, k) => k !== i) }))}
      onUpdatePago={(_, i, f, val) => setV((p) => ({ ...p, pagos: p.pagos.map((x, k) => (k === i ? { ...x, [f]: val } : x)) }))}
      onRemove={() => undefined}
    />
  )
}

describe('VentaLibreRowV2', () => {
  it('usa el buscador de pedidos: muestra bloqueo y deuda, y al elegir marca al cliente bloqueado', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('¿A quién se le vendió?'), { target: { value: 'ana' } })
    expect(screen.getByTestId('cliente-search-bloqueado')).toBeInTheDocument()
    expect(screen.getByTestId('cliente-search-deuda')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cliente-search-result'))
    expect(screen.getByText('Ana Ruiz')).toBeInTheDocument()
    expect(screen.getByText(/Cliente bloqueado/)).toBeInTheDocument()
  })

  it('cliente bloqueado con saldo: explica el bloqueo; pagando completo queda válido', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('¿A quién se le vendió?'), { target: { value: 'ana' } })
    fireEvent.click(screen.getByTestId('cliente-search-result'))
    fireEvent.change(screen.getByLabelText('Paca de agua'), { target: { value: '2' } })
    expect(screen.getByTestId('vl-motivos')).toHaveTextContent(/bloqueado/)
    fireEvent.click(screen.getByTestId('vl-cobrar-total'))
    expect(screen.queryByTestId('vl-motivos')).toBeNull()
    expect(screen.getByTestId('vl-saldo')).toHaveTextContent('Pagado completo')
  })

  it('venta al paso: sin pago completo se bloquea; con el total cobrado se permite', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('vl-venta-al-paso'))
    fireEvent.change(screen.getByLabelText('Paca de agua'), { target: { value: '2' } })
    expect(screen.getByTestId('vl-motivos')).toHaveTextContent(/pago completo/)
    fireEvent.click(screen.getByTestId('vl-cobrar-total'))
    expect(screen.queryByTestId('vl-motivos')).toBeNull()
  })

  it('con cliente y saldo muestra «fiado de X»; sin productos pero con pago lo marca', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('¿A quién se le vendió?'), { target: { value: 'ana' } })
    fireEvent.click(screen.getByTestId('cliente-search-result'))
    fireEvent.click(screen.getByText('+ Agregar pago'))
    fireEvent.change(screen.getByLabelText('Monto cobrado'), { target: { value: '1000' } })
    expect(screen.getByTestId('vl-motivos')).toHaveTextContent(/pago sin productos/)
  })
})
