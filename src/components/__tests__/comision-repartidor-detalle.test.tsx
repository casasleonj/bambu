// @tests #622 — «Ver entregas y cálculo»: nombre del pedido, parciales y pedidos que se completan otro día.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react'
import { ComisionRepartidorDetalle, diaCorto } from '../comision-repartidor-detalle'
import type { ComisionRepartidor, FuenteComision, PedidoComision, UnidadesReparto } from '@/lib/comision-repartidor-calculo'

afterEach(cleanup)
const u = (agua = 0, hielo = 0, botellon = 0): UnidadesReparto => ({ agua, hielo, botellon })
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const pedidoBase = (o: Partial<PedidoComision> & { id: string }): PedidoComision => ({
  numero: 1042, href: `/pedidos/${o.id}`, nombre: 'Cliente Prueba', creadoDia: '2026-11-04',
  unidades: u(3), pedido: u(10), entregadoActual: u(3), detalle: 'POR_DIA', completoAqui: false,
  dias: [{ dia: HOY, unidades: u(3), propia: true }], alDia: u(3), pendiente: u(7), ...o,
})
const calculo = (fuentes: FuenteComision[]): ComisionRepartidor => {
  const agua = fuentes.reduce((s, f) => s + f.unidades.agua, 0)
  return { entregasAgua: agua, entregasHielo: 0, entregasBotellon: 0, comAgua: agua * 400, comHielo: 0, comBotellon: 0, total: agua * 400,
    tarifas: { agua: 400, hielo: 250, botellon: 200 }, porOrigen: { embarque: agua * 400, sinEmbarque: 0 }, fuentes, revisiones: [] }
}
const embarque = (pedidos: PedidoComision[] | undefined, o: Partial<FuenteComision> = {}): FuenteComision => ({
  id: 'e1', numero: 12, href: '/embarques/e1', origen: 'EMBARQUE_VIVO',
  unidades: pedidos ? pedidos.reduce((s, p) => u(s.agua + p.unidades.agua), u()) : u(18), pedidos, ...o,
})
const abrir = (c: ComisionRepartidor) => { const r = render(<ComisionRepartidorDetalle calculo={c} />); return r }

describe('#622 detalle por pedido', () => {
  it('parcial: muestra lo entregado en esta comisión (3), no lo pedido (10); lleva 3 de 10 y pendiente 7', () => {
    abrir(calculo([embarque([pedidoBase({ id: 'p1' })])]))
    const fila = screen.getByTestId('comision-pedido-p1')
    expect(fila).toHaveTextContent('Parcial')
    expect(fila).toHaveTextContent('En esta comisión: agua 3')
    expect(fila).toHaveTextContent('Lleva agua 3 de 10')
    expect(fila).toHaveTextContent('Pendiente de entregar: agua 7')
    expect(fila).not.toHaveTextContent('En esta comisión: agua 10')
    expect(within(fila).getByRole('link', { name: '#1042' })).toHaveAttribute('href', '/pedidos/p1')
  })

  it('negocio primero y cliente entre paréntesis; sin negocio solo el cliente', () => {
    abrir(calculo([embarque([pedidoBase({ id: 'p1', nombre: 'Hotel Sol', cliente: 'Carla Pérez' }), pedidoBase({ id: 'p2', numero: 1043, nombre: 'Mario Ruiz' })])]))
    expect(screen.getByTestId('comision-pedido-p1')).toHaveTextContent('Hotel Sol (Carla Pérez)')
    expect(screen.getByTestId('comision-pedido-p2')).toHaveTextContent('Mario Ruiz')
    expect(screen.getByTestId('comision-pedido-p2')).not.toHaveTextContent('(')
  })

  it('se completó hoy: etiqueta «Completó hoy», lo de ayer aparece aparte y el aviso explica que se completó', () => {
    const p = pedidoBase({ id: 'p1', unidades: u(5), entregadoActual: u(10), alDia: u(10), pendiente: u(0), completoAqui: true, creadoDia: '2026-11-04',
      dias: [{ dia: '2026-11-04', unidades: u(5), propia: false }, { dia: HOY, unidades: u(5), propia: true }] })
    abrir(calculo([embarque([p])]))
    const fila = screen.getByTestId('comision-pedido-p1')
    expect(fila).toHaveTextContent('Completó hoy')
    expect(fila).toHaveTextContent('En esta comisión: agua 5')
    const dias = screen.getByTestId('comision-dias-p1')
    expect(dias).toHaveTextContent('4 nov · 5')
    expect(dias).toHaveTextContent(`${diaCorto(HOY)} · 5 ← esta comisión`)
    expect(dias).toHaveTextContent('Total agua 10 de 10')
    expect(fila).toHaveTextContent('Con esta entrega se completó el pedido (agua 10 de 10)')
    expect(fila).not.toHaveTextContent('Pendiente de entregar')
  })

  it('el cierre de un día anterior: 5 de 10 a ese día, no figura completo y avisa que se completó después', () => {
    const p = pedidoBase({ id: 'p1', unidades: u(5), entregadoActual: u(10), alDia: u(5), pendiente: u(5), completadoDespues: '2026-11-06',
      dias: [{ dia: '2026-11-05', unidades: u(5), propia: true }] })
    abrir(calculo([embarque([p])]))
    const fila = screen.getByTestId('comision-pedido-p1')
    expect(fila).toHaveTextContent('Parcial')
    expect(fila).not.toHaveTextContent('Completó')
    expect(fila).toHaveTextContent('Se completó después (6 nov)')
    expect(fila).toHaveTextContent('Pendiente de entregar: agua 5')
    expect(screen.getByTestId('comision-dias-p1')).not.toHaveTextContent('6 nov')
  })

  it('completó un día que no es hoy: la etiqueta dice la fecha, no «hoy»', () => {
    const p = pedidoBase({ id: 'p1', unidades: u(5), entregadoActual: u(5), pedido: u(5), alDia: u(5), pendiente: u(0), completoAqui: true,
      dias: [{ dia: '2020-01-03', unidades: u(5), propia: true }] })
    abrir(calculo([embarque([p])]))
    expect(screen.getByTestId('comision-pedido-p1')).toHaveTextContent('Completó el 3 ene')
  })

  it('dos personas el mismo día: lo de la otra persona se marca aparte', () => {
    const p = pedidoBase({ id: 'p1', entregadoActual: u(7), alDia: u(7), pendiente: u(3),
      dias: [{ dia: HOY, unidades: u(3), propia: true }, { dia: HOY, unidades: u(4), propia: false }] })
    abrir(calculo([embarque([p])]))
    expect(screen.getByTestId('comision-dias-p1')).toHaveTextContent('· 4 (otra persona)')
  })

  it('sin detalle por día verificable y registro histórico: no inventa el reparto', () => {
    const sin = pedidoBase({ id: 'p1', detalle: 'SIN_DETALLE', dias: undefined, alDia: undefined, pendiente: undefined, entregadoActual: u(4) })
    const hist = pedidoBase({ id: 'p2', numero: 1044, detalle: 'HISTORICO', dias: undefined, alDia: undefined, pendiente: undefined, entregadoDia: '2026-10-30', unidades: u(6), pedido: u(6), entregadoActual: u(6) })
    abrir(calculo([embarque([sin, hist])]))
    expect(screen.getByTestId('comision-pedido-p1')).toHaveTextContent('Sin detalle por día verificable')
    expect(screen.getByTestId('comision-pedido-p1')).toHaveTextContent('entregadas hasta ahora: agua 4')
    expect(screen.queryByTestId('comision-dias-p1')).toBeNull()
    expect(screen.getByTestId('comision-pedido-p2')).toHaveTextContent('Entrega completa registrada el 30 oct')
    expect(screen.getByTestId('comision-pedido-p2')).toHaveTextContent('Completo')
  })

  it('«Ventas en ruta (sin pedido)» solo si hay unidades; los pedidos más esa fila suman la fuente', () => {
    const con = embarque([pedidoBase({ id: 'p1', unidades: u(4), pedido: u(4), entregadoActual: u(4), alDia: u(4), pendiente: u(0) })], { sinPedido: u(2), unidades: u(6) })
    const { unmount } = abrir(calculo([con]))
    expect(screen.getByTestId('comision-sin-pedido-e1')).toHaveTextContent('Ventas en ruta (sin pedido)')
    expect(screen.getByTestId('comision-sin-pedido-e1')).toHaveTextContent('agua 2')
    unmount()
    abrir(calculo([embarque([pedidoBase({ id: 'p1' })], { sinPedido: u() })]))
    expect(screen.queryByTestId('comision-sin-pedido-e1')).toBeNull()
  })

  it('lista larga: 5 pedidos y «Ver los N restantes»', () => {
    const muchos = Array.from({ length: 9 }, (_, i) => pedidoBase({ id: `p${i}`, numero: 2000 + i, nombre: `Cliente ${i}` }))
    abrir(calculo([embarque(muchos)]))
    expect(screen.getAllByTestId(/^comision-pedido-/)).toHaveLength(5)
    fireEvent.click(screen.getByTestId('ver-restantes'))
    expect(screen.getAllByTestId(/^comision-pedido-/)).toHaveLength(9)
  })

  it('cierres anteriores sin detalle por pedido: conserva el enlace de siempre y avisa que es un registro anterior', () => {
    abrir(calculo([embarque(undefined)]))
    expect(screen.getByRole('link', { name: /Ver embarque #12 · Agua 18/ })).toHaveAttribute('href', '/embarques/e1')
    expect(screen.getByText(/Este registro es anterior y no trae el detalle por cliente/)).toBeInTheDocument()
    expect(screen.queryByTestId(/^comision-pedido-/)).toBeNull()
  })

  it('no cambia el cálculo: tarifas, totales y aviso «Por conciliar» siguen igual', () => {
    const c = calculo([embarque([pedidoBase({ id: 'p1' })])])
    c.revisiones = [{ embarqueId: 'e1', motivo: 'Un pedido necesita conciliación.' }]
    abrir(c)
    expect(screen.getByText(/Agua: 3 unidades/)).toBeInTheDocument()
    expect(screen.getByText(/Por conciliar antes de pagar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar embarque' })).toHaveAttribute('href', '/embarques/e1')
  })

  it('diaCorto', () => { expect(diaCorto('2026-11-04')).toBe('4 nov'); expect(diaCorto('2026-12-31')).toBe('31 dic') })
})
