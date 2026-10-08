import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspaceDinero, type WorkspaceDineroProps } from '../workspace-dinero'

const base = (over: Partial<WorkspaceDineroProps> = {}): WorkspaceDineroProps => ({
  total: 7500,
  saldoProyectado: 7500,
  pagos: [],
  pagoCompleto: null,
  esAnonima: true,
  onPagarCompleto: vi.fn(),
  onSetPagos: vi.fn(),
  ...over,
})

describe('WorkspaceDinero (P0)', () => {
  it('"Pagado en efectivo" cobra el total completo', () => {
    const props = base()
    render(<WorkspaceDinero {...props} />)
    fireEvent.click(screen.getByTestId('dinero-pagar-completo-EFECTIVO'))
    expect(props.onPagarCompleto).toHaveBeenCalledWith('EFECTIVO')
  })

  it('venta anónima con saldo → aviso de deudor requerido', () => {
    render(<WorkspaceDinero {...base()} />)
    expect(screen.getByTestId('dinero-deudor-requerido')).toBeInTheDocument()
    expect(screen.queryByTestId('dinero-pago-parcial')).not.toBeInTheDocument()
  })

  it('cliente real puede elegir pago parcial', () => {
    const props = base({ esAnonima: false })
    render(<WorkspaceDinero {...props} />)
    fireEvent.click(screen.getByTestId('dinero-pago-parcial'))
    expect(props.onSetPagos).toHaveBeenCalledWith([{ metodo: 'EFECTIVO', monto: 0 }])
  })

  it('recibido en efectivo muestra el cambio y no altera el monto aplicado', () => {
    const props = base({ pagos: [{ metodo: 'EFECTIVO', monto: 7500 }], pagoCompleto: 'EFECTIVO', saldoProyectado: 0 })
    render(<WorkspaceDinero {...props} />)
    fireEvent.change(screen.getByTestId('dinero-recibido'), { target: { value: '10000' } })
    expect(screen.getByTestId('dinero-cambio')).toHaveTextContent(/2[.,]500/)
    expect(screen.getByTestId('dinero-aplicado')).toHaveTextContent(/7[.,]500/)
    expect(screen.getByTestId('dinero-saldo')).toHaveTextContent('Pagado')
    expect(props.onSetPagos).not.toHaveBeenCalled()
  })

  it('pago combinado: agregar un método propone el restante', () => {
    const props = base({ esAnonima: false, pagos: [{ metodo: 'EFECTIVO', monto: 5000 }], saldoProyectado: 2500 })
    render(<WorkspaceDinero {...props} />)
    fireEvent.click(screen.getByTestId('dinero-agregar-NEQUI'))
    expect(props.onSetPagos).toHaveBeenCalledWith([
      { metodo: 'EFECTIVO', monto: 5000 },
      { metodo: 'NEQUI', monto: 2500 },
    ])
  })
})
