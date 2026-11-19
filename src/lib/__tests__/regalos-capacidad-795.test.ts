import { describe, expect, it } from 'vitest'
import { unidadesPedido, pesoPedido, splitPedidosByCapacity } from '@/lib/embarque-auto'
import { PESOS_KG, pedidoParaCargaPendiente } from '@/lib/embarque-capacidad'
import { derivarCarga, resumenSeleccion } from '@/app/(app)/embarques/embarques-client/nuevo-embarque/derivar-carga'
import { cargaAgregada, unidadesTotales, pesoTotalKg } from '@/modules/planificador/domain/services/capacidad.service'
import { unidadesFisicasEntregadas } from '@/lib/unidades-entregadas-dia'

describe('#795 · logística física, sin multiplicar dinero por regalos', () => {
  const p = { cPacaAguaPed: 60, items: [{ producto: 'PACA_AGUA', cantPedido: 60, cantRegaloPedido: 3 }] }
  it('planificador, autoembarque y carga agregada usan la misma cantidad física', () => {
    expect(unidadesPedido(p)).toBe(63)
    expect(pesoPedido(p)).toBe(63 * PESOS_KG.PACA_AGUA)
    expect(cargaAgregada([p]).PACA_AGUA).toBe(63)
    expect(unidadesTotales([p])).toBe(63)
    expect(pesoTotalKg([p])).toBe(63 * PESOS_KG.PACA_AGUA)
  })
  it('el regalo puede hacer necesario otro viaje, no queda fuera de la capacidad', () => {
    const segundo = { cPacaAguaPed: 2 }
    expect(splitPedidosByCapacity([p, segundo], 64)).toEqual([[p], [segundo]])
  })
  it('el viaje siguiente carga 50+2 pendientes; no vuelve a cargar las 11 ya entregadas', () => {
    const parcial = { ...p, items: [{ ...p.items[0], cantEntrega: 10, cantRegaloEntrega: 1 }] }
    expect(derivarCarga([parcial]).PACA_AGUA).toBe(52)
    expect(resumenSeleccion([parcial]).unidades).toBe(52)
    const pendiente = pedidoParaCargaPendiente(parcial)
    expect(cargaAgregada([pendiente]).PACA_AGUA).toBe(52)
    expect(pedidoParaCargaPendiente(pendiente)).toEqual(pendiente)
    expect(parcial.items[0].cantPedido).toBe(60)
  })
  it('fallback físico del cierre conserva el regalo entregado y nunca suma otra vez el legacy', () => {
    expect(unidadesFisicasEntregadas({ cPacaAguaEnt: 10, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
      items: [{ producto: 'PACA_AGUA', cantEntrega: 10, cantRegaloEntrega: 1 }] }).agua).toBe(11)
  })
})
