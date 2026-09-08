import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoPeekRiesgo } from '../pedido-peek-riesgo'
import { GUIA_ALERTAS } from '@/lib/alertas-config'

type Caso = { id: string; alertaTipo: string; severidad: string; status: string }
const caso = (o: Partial<Caso> = {}): Caso => ({ id: 'c1', alertaTipo: 'MONTO_ANOMALO', severidad: 'ALTA', status: 'ABIERTO', ...o })

describe('PedidoPeekRiesgo — riesgo/excepciones en el peek (Fase 7-i)', () => {
  it('sin casos → no renderiza nada', () => {
    const { container } = render(<PedidoPeekRiesgo casos={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('usa el texto oficial de la regla (GUIA_ALERTAS), no texto propio', () => {
    render(<PedidoPeekRiesgo casos={[caso()]} />)
    const g = GUIA_ALERTAS.MONTO_ANOMALO
    expect(screen.getByTestId('peek-caso-c1')).toHaveTextContent(g.nombre)
    fireEvent.click(screen.getByText('Qué significa'))
    expect(screen.getByText(g.definicion)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(g.soluciones[0].slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('la explicación viene colapsada (<details> sin open)', () => {
    render(<PedidoPeekRiesgo casos={[caso()]} />)
    const det = screen.getByText('Qué significa').closest('details')
    expect(det).not.toHaveAttribute('open')
  })

  it('tono por severidad: ALTA rojo, MEDIA ámbar, BAJA neutro', () => {
    const { rerender } = render(<PedidoPeekRiesgo casos={[caso({ alertaTipo: 'MONTO_ANOMALO' })]} />)
    expect(screen.getByTestId('peek-caso-c1').className).toContain('red')
    rerender(<PedidoPeekRiesgo casos={[caso({ alertaTipo: '3RO_PEDIDO' })]} />)
    expect(screen.getByTestId('peek-caso-c1').className).toContain('amber')
    rerender(<PedidoPeekRiesgo casos={[caso({ alertaTipo: '1ER_PEDIDO' })]} />)
    expect(screen.getByTestId('peek-caso-c1').className).toMatch(/gray|neutral/)
  })

  it('fallback neutro si el alertaTipo no tiene guía (no inventa texto)', () => {
    render(<PedidoPeekRiesgo casos={[caso({ id: 'cx', alertaTipo: 'TIPO_INEXISTENTE_XYZ', severidad: 'BAJA' })]} />)
    const box = screen.getByTestId('peek-caso-cx')
    expect(box).toHaveTextContent('TIPO INEXISTENTE XYZ')
    expect(screen.queryByText('Qué significa')).not.toBeInTheDocument()
  })

  it('señal ≠ acusación ≠ bloqueo: footer explícito, sin botones de resolución', () => {
    render(<PedidoPeekRiesgo casos={[caso()]} />)
    expect(screen.getByText(/señal para revisión.*no una acusación ni un bloqueo/i)).toBeInTheDocument()
    // no hay botones de acción sobre el caso (resolver/asignar/cambiar estado)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('cross-link "Ver en Casos" navega a /casos (acceso, no fusión)', () => {
    render(<PedidoPeekRiesgo casos={[caso()]} />)
    expect(screen.getByTestId('peek-caso-ver-casos')).toHaveAttribute('href', '/casos')
  })
})

describe('PedidoPeekRiesgo — guardrail de fuente (G7)', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/(app)/pedidos/pedido-hub/pedido-peek-riesgo.tsx'), 'utf-8')

  it('consume GUIA_ALERTAS de alertas-config, no define reglas propias', () => {
    expect(src).toMatch(/from '@\/lib\/alertas-config'/)
    expect(src).toMatch(/GUIA_ALERTAS\[/)
  })

  it('no define definiciones/soluciones ni calcula riesgo', () => {
    const sinComentarios = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    expect(sinComentarios).not.toMatch(/definicion:\s*['"]/)
    expect(sinComentarios).not.toMatch(/soluciones:\s*\[/)
    expect(sinComentarios).not.toMatch(/fetch\(|useEffect/)
  })

  it('no embebe el editor de Caso (CasoGuiaModal) — sólo navega', () => {
    expect(src).not.toMatch(/CasoGuiaModal|onStatusChange|resolver.*caso/i)
  })
})
