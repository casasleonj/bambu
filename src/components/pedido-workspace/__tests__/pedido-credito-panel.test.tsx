import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoCreditoPanel, type PedidoCreditoPanelProps } from '../pedido-credito-panel'

const credito = { limite: 4, abiertos: 4, saldoAbierto: 86000, saldoOperacion: 30000, abiertosDespues: 5, saldoDespues: 116000, bloqueado: true, causa: 'LIMITE' as const }

function base(over: Partial<PedidoCreditoPanelProps> = {}): PedidoCreditoPanelProps {
  return {
    credito, excepcionAplicada: false, excepcionNoAplica: undefined, vista: null,
    solicitando: false, error: null, total: 30000,
    onSolicitar: vi.fn(), onReiniciar: vi.fn(), onCobrarAhora: vi.fn(), ...over,
  }
}

describe('PedidoCreditoPanel (P0-3, maqueta 1)', () => {
  it('no se muestra si no hay crédito o el cliente no está bloqueado', () => {
    const { container, rerender } = render(<PedidoCreditoPanel {...base({ credito: undefined })} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<PedidoCreditoPanel {...base({ credito: { ...credito, bloqueado: false } })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('A · bloqueado: muestra los números del servidor, "Cobrar ahora" y "Pedir excepción"', () => {
    render(<PedidoCreditoPanel {...base()} />)
    const tabla = screen.getByTestId('credito-tabla')
    expect(tabla).toHaveTextContent('4 fiados')
    expect(tabla).toHaveTextContent('5 de 4')
    expect(tabla).toHaveTextContent('Exceso')
    expect(screen.getByTestId('credito-cobrar-ahora')).toHaveTextContent(/Cobrar ahora/)
    expect(screen.getByTestId('credito-pedir-excepcion')).toBeInTheDocument()
  })

  it('cliente bloqueado por deuda vencida: el texto lo dice (no habla de límite)', () => {
    render(<PedidoCreditoPanel {...base({ credito: { ...credito, causa: 'CLIENTE_BLOQUEADO' } })} />)
    expect(screen.getByTestId('credito-panel')).toHaveTextContent(/bloqueado por deuda vencida/i)
  })

  it('"Cobrar ahora" lleva a la zona de cobro', () => {
    const onCobrarAhora = vi.fn()
    render(<PedidoCreditoPanel {...base({ onCobrarAhora })} />)
    fireEvent.click(screen.getByTestId('credito-cobrar-ahora'))
    expect(onCobrarAhora).toHaveBeenCalled()
  })

  it('el motivo es obligatorio para enviar; envía motivo y nota', () => {
    const onSolicitar = vi.fn()
    render(<PedidoCreditoPanel {...base({ onSolicitar })} />)
    fireEvent.click(screen.getByTestId('credito-pedir-excepcion'))
    expect(screen.getByTestId('credito-enviar')).toBeDisabled()
    fireEvent.change(screen.getByTestId('credito-motivo'), { target: { value: '  paga el viernes ' } })
    fireEvent.change(screen.getByTestId('credito-nota'), { target: { value: 'cliente de años' } })
    fireEvent.click(screen.getByTestId('credito-enviar'))
    expect(onSolicitar).toHaveBeenCalledWith('paga el viernes', 'cliente de años')
  })

  it('muestra el error de la solicitud (p. ej. sin conexión)', () => {
    render(<PedidoCreditoPanel {...base({ error: 'Sin conexión: pedir una excepción necesita internet.' })} />)
    fireEvent.click(screen.getByTestId('credito-pedir-excepcion'))
    expect(screen.getByTestId('credito-error')).toHaveTextContent(/Sin conexión/)
  })

  it('B · pendiente: dice que se avisó, muestra el motivo y sigue ofreciendo cobrar', () => {
    render(<PedidoCreditoPanel {...base({ vista: { id: 'e1', estado: 'PENDIENTE', motivoSolicitud: 'paga el viernes' } })} />)
    expect(screen.getByTestId('credito-estado-pendiente')).toHaveTextContent(/pendiente/i)
    expect(screen.getByTestId('credito-panel')).toHaveTextContent('paga el viernes')
    expect(screen.getByTestId('credito-cobrar-ahora')).toBeInTheDocument()
    expect(screen.queryByTestId('credito-pedir-excepcion')).not.toBeInTheDocument()
  })

  it('C · autorizada y vigente: banner verde con quién autorizó y hasta cuánto', () => {
    render(<PedidoCreditoPanel {...base({
      credito: { ...credito, bloqueado: false },
      excepcionAplicada: true,
      vista: { id: 'e1', estado: 'AUTORIZADA', motivoSolicitud: 'm', autorizadoPorNombre: 'Ana', saldoAutorizado: 30000 },
    })} />)
    expect(screen.getByTestId('credito-estado-autorizada')).toHaveTextContent('Ana')
    expect(screen.getByTestId('credito-panel')).toHaveTextContent(/hoy/i)
    expect(screen.queryByTestId('credito-pedir-excepcion')).not.toBeInTheDocument()
  })

  it('rechazada: muestra la nota y permite pedir otra (reinicia la solicitud)', () => {
    const onReiniciar = vi.fn()
    render(<PedidoCreditoPanel {...base({
      onReiniciar,
      vista: { id: 'e1', estado: 'RECHAZADA', motivoSolicitud: 'm', rechazadoPorNombre: 'Ana', notaRechazo: 'primero paga lo vencido' },
    })} />)
    expect(screen.getByTestId('credito-estado-rechazada')).toHaveTextContent('primero paga lo vencido')
    fireEvent.click(screen.getByTestId('credito-pedir-excepcion'))
    expect(onReiniciar).toHaveBeenCalled()
  })

  it('autorizada que ya no cubre (saldo mayor): lo explica y pide una nueva', () => {
    render(<PedidoCreditoPanel {...base({
      excepcionNoAplica: { id: 'e1', motivo: 'SALDO_EXCEDE_AUTORIZADO', saldoAutorizado: 5000 },
      vista: { id: 'e1', estado: 'AUTORIZADA', motivoSolicitud: 'm' },
    })} />)
    expect(screen.getByTestId('credito-no-cubre')).toHaveTextContent(/hasta/i)
    expect(screen.getByTestId('credito-pedir-excepcion')).toBeInTheDocument()
  })

  it('autorizada que venció: lo dice', () => {
    render(<PedidoCreditoPanel {...base({
      excepcionNoAplica: { id: 'e1', motivo: 'VENCIDA', saldoAutorizado: 5000 },
      vista: { id: 'e1', estado: 'AUTORIZADA', motivoSolicitud: 'm' },
    })} />)
    expect(screen.getByTestId('credito-no-cubre')).toHaveTextContent(/venció/i)
  })
})
