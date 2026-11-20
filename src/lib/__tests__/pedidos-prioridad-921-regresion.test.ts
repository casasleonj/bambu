// #921: contrato de regresión de horarios vigente antes de introducir prioridades financieras.
// Estos tests no afirman que el ordenamiento de #921 esté implementado.
import { describe, expect, it } from 'vitest'
import { clasificarFranja, ordenarPorFranja } from '../pedidos-franja'

const bog = (hora: string, dia = '2026-11-20') => new Date(`${dia}T${hora}:00-05:00`)
const pedido = (id: string, hora: string | null, fecha = '2026-11-20', estadoEntrega = 'PENDIENTE') => ({
  id, fechaEntrega: bog('08:00', fecha), estadoEntrega, entregaNoAntesDe: hora,
})

describe('#921 contrato existente de compromisos horarios', () => {
  it('el pedido pagado para mañana no se vuelve urgente hoy por tener hora', () => {
    expect(clasificarFranja(pedido('futuro', '09:00', '2026-11-21'), bog('08:30')))
      .toEqual({ franja: 'normal', minutosFaltantes: null })
  })

  it('a 60 minutos de la promesa entra en ya_toca; a 61 todavía no', () => {
    expect(clasificarFranja(pedido('limite', '10:00'), bog('09:00')).franja).toBe('ya_toca')
    expect(clasificarFranja(pedido('antes', '10:01'), bog('09:00')).franja).toBe('normal')
  })

  it('un compromiso vencido precede a otro de hoy y no muta la entrada', () => {
    const entrada = [pedido('sin-hora', null), pedido('mas-tarde', '15:00'), pedido('vencido', '08:00')]
    const resultado = ordenarPorFranja(entrada, bog('09:30'), x => x)
    expect(resultado.map(x => x.id)).toEqual(['vencido', 'sin-hora', 'mas-tarde'])
    expect(entrada.map(x => x.id)).toEqual(['sin-hora', 'mas-tarde', 'vencido'])
  })

  it('entregado no vuelve a entrar en franja urgente aunque la hora haya vencido', () => {
    expect(clasificarFranja(pedido('cerrado', '08:00', '2026-11-20', 'ENTREGADO'), bog('09:30')))
      .toEqual({ franja: 'normal', minutosFaltantes: null })
  })
})
