// #1029 F1-A: pruebas de caracterización (RED esperado hasta F2).
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiasPendientes, diaQueBloquea, type DiaPendienteUI } from './dias-pendientes'

const hoy = '2026-11-25'
const ayer = '2026-11-24'
const d = (fecha: string, obligatorio = true): DiaPendienteUI => ({
  fecha, obligatorio, operaciones: obligatorio ? 3 : 0,
})
const props = { estado: 'ok' as const, fecha: hoy, hoy, deshabilitado: false, onElegir: vi.fn(), onReintentar: vi.fn() }

describe('#1029 F1-A: selector de días pendientes', () => {
  it('oculta pregunta de selección cuando solamente hoy está pendiente', () => {
    render(<DiasPendientes {...props} dias={[d(hoy)]} />)
    expect(screen.queryByText('¿Qué día vas a cerrar?')).not.toBeInTheDocument()
  })
  it('muestra selector cuando existe un día anterior pendiente', () => {
    render(<DiasPendientes {...props} dias={[d(ayer), d(hoy)]} />)
    expect(screen.getByText('¿Qué día vas a cerrar?')).toBeInTheDocument()
    expect(screen.getByTestId(`dia-pendiente-${ayer}`)).toBeInTheDocument()
    expect(diaQueBloquea([d(ayer), d(hoy)], hoy)?.fecha).toBe(ayer)
  })
  it('mantiene aviso de error, no lo oculta como selector innecesario', () => {
    render(<DiasPendientes {...props} estado="error" dias={[d(hoy)]} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo revisar')
  })
})
