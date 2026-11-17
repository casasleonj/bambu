// @tests #829 — la búsqueda de la pestaña Alertas tolera tildes, prefijos, apellido y negocio (misma regla que la lista de Pedidos, #788).
import { describe, expect, it } from 'vitest'
import { calcularAlertas, type PedidoBase } from '@/lib/alertas-detector'
import type { AlertaRow } from '@/lib/alertas-config'
import { coincideAlertaBusqueda } from '@/lib/alertas-busqueda'

const fila = (o: Partial<AlertaRow>): AlertaRow => ({
  clienteId: 'c1', nombreCli: 'Cliente', telefonoCli: '3000000000', alertas: [], severidadMasAlta: 'BAJA', ...o,
})
const maximo = fila({ clienteId: 'm', nombreCli: 'Máximo', apellidoCli: 'Rojas', telefonoCli: '3101110001' })
const carlos = fila({ clienteId: 'k', nombreCli: 'Carlos', apellidoCli: 'Duarte', nombreNegocioCli: 'Punti Frío', telefonoCli: '3101110002' })
const lucia = fila({ clienteId: 'l', nombreCli: 'Lucía', apellidoCli: 'Núñez', telefonoCli: '3101110005' })

describe('#829 coincideAlertaBusqueda', () => {
  it.each([
    ['Máximo', maximo], ['maximo', maximo], ['MAX', maximo], ['rojas', maximo], ['rojas maximo', maximo],
    ['lucia', lucia], ['nunez', lucia],
    ['PUN', carlos], ['punti frio', carlos], ['duarte', carlos],
  ])('«%s» encuentra la fila esperada', (q, f) => {
    expect(coincideAlertaBusqueda(f, q)).toBe(true)
  })

  it('conserva el teléfono', () => {
    expect(coincideAlertaBusqueda(carlos, '3101110002')).toBe(true)
    expect(coincideAlertaBusqueda(maximo, '3101110002')).toBe(false)
  })

  it('no mezcla clientes', () => {
    expect(coincideAlertaBusqueda(lucia, 'maximo')).toBe(false)
    expect(coincideAlertaBusqueda(maximo, 'xyzzqk')).toBe(false)
  })

  it('una búsqueda vacía o en blanco no filtra nada (muestra todo)', () => {
    expect(coincideAlertaBusqueda(maximo, '')).toBe(true)
    expect(coincideAlertaBusqueda(maximo, '   ')).toBe(true)
  })

  it('tolera filas sin apellido ni negocio (datos antiguos)', () => {
    expect(coincideAlertaBusqueda(fila({ nombreCli: 'Pedro' }), 'pedro')).toBe(true)
    expect(coincideAlertaBusqueda(fila({ nombreCli: 'Pedro' }), 'punti')).toBe(false)
  })
})

describe('#829 el detector conserva apellido y negocio en la fila', () => {
  const pedido = (n: number): PedidoBase => ({
    id: `p${n}`, numero: n, clienteId: 'k', nombreCli: 'Carlos', apellidoCli: 'Duarte', nombreNegocioCli: 'Punti Frío',
    telefonoCli: '3101110002', fecha: new Date().toISOString(), total: 10000, saldo: 0,
    estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE', disputaAbierta: false,
  } as PedidoBase)
  it('dos pedidos del mismo cliente el mismo día generan una fila con apellido y negocio', () => {
    const filas = calcularAlertas([pedido(1), pedido(2)])
    expect(filas.length).toBeGreaterThan(0)
    expect(filas[0]).toMatchObject({ nombreCli: 'Carlos', apellidoCli: 'Duarte', nombreNegocioCli: 'Punti Frío' })
  })
})
