import { describe, expect, it } from 'vitest'
import { armarPayload, completa, datosIniciales, pendientes, resumenRegalos, saldoEntregadoTrasEntrega, validar, type PedidoParaEntrega } from '../logica'

const ahora = new Date('2026-11-18T15:00:00Z')
const pedido: PedidoParaEntrega = { id: 'p', numero: 1, nombreCliente: 'Cliente prueba', clienteId: 'c', canal: 'PUNTO',
  total: 138000, totalPagado: 0, items: [{ producto: 'PACA_AGUA', cantPedido: 60, cantEntrega: 0, cantRegaloPedido: 3, cantRegaloEntrega: 0, precio: 2300 }] }

describe('#795 · captura de entrega con precio y regalo', () => {
  it('10 + 1 son 11 físicas, 23000 de valor y deuda; el payload no los convierte en 11 cobradas', () => {
    const d = { ...datosIniciales(pedido, ahora), alcance: 'MENOS' as const, cantidades: { PACA_AGUA: 10 }, regalos: { PACA_AGUA: 1 }, promesa: '2026-11-19' }
    expect(resumenRegalos(pedido, d)).toEqual({ fisicas: 11, valor: 23000 })
    expect(saldoEntregadoTrasEntrega(pedido, d, true)).toBe(23000)
    expect(armarPayload(pedido, d, 'clave-test', ahora).itemsEntregados).toEqual([{ producto: 'PACA_AGUA', cantidad: 10, cantidadRegalo: 1 }])
    expect(validar(pedido, d, ahora, true)).toEqual({})
    expect(completa(pedido, d)).toBe(false)
  })
  it('completar solo lo comercial deja visibles los tres regalos pendientes', () => {
    const p = { ...pedido, items: [{ ...pedido.items[0], cantEntrega: 60 }] }
    expect(pendientes(p)).toEqual([{ producto: 'PACA_AGUA', pendiente: 0, pendienteRegalo: 3 }])
    const d = { ...datosIniciales(p, ahora), alcance: 'COMPLETA' as const }
    expect(armarPayload(p, d, 'clave-test', ahora).itemsEntregados).toEqual([{ producto: 'PACA_AGUA', cantidad: 0, cantidadRegalo: 3 }])
    expect(resumenRegalos(p, d)).toEqual({ fisicas: 3, valor: 0 })
    expect(completa(p, d)).toBe(true)
  })
  it.each([-1, 1.5, 4, NaN, Infinity])('no guarda una cantidad gratuita inválida %s', regalo => {
    const d = { ...datosIniciales(pedido, ahora), alcance: 'MENOS' as const, cantidades: { PACA_AGUA: 10 }, regalos: { PACA_AGUA: regalo } }
    expect(validar(pedido, d, ahora, true).cantidades).toBeTruthy()
  })
  it('un pedido normal no adquiere controles ni campos de regalo por defecto', () => {
    const p = { ...pedido, items: [{ producto: 'PACA_AGUA', cantPedido: 60, cantEntrega: 0, precio: 2300 }] }
    const d = { ...datosIniciales(p, ahora), alcance: 'COMPLETA' as const }
    expect(resumenRegalos(p, d)).toBeNull()
    expect(armarPayload(p, d, 'clave-test', ahora).itemsEntregados).toEqual([{ producto: 'PACA_AGUA', cantidad: 60 }])
  })
})
