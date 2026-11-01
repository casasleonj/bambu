// @tests lib/deuda-trabajador-resumen — #566: lo que se le muestra al usuario como deuda del trabajador
import { describe, it, expect } from 'vitest'
import { armarDeudasTrabajador } from '../deuda-trabajador-resumen'

const fecha = (d: string) => new Date(`${d}T15:00:00.000Z`)

describe('armarDeudasTrabajador', () => {
  it('fiado no cobrado trae pedido, cliente y cifras del servidor', () => {
    const r = armarDeudasTrabajador(
      [{
        id: 'd1', trabajadorId: 't1', tipo: 'DEFICIT_EFECTIVO', montoOriginal: 125000, montoPendiente: 125000,
        descripcion: 'Fiado no cobrado: Pedido #2150 (Cliente Panadería El Trigal)', fecha: fecha('2026-10-30'),
        pedido: { id: 'p1', numero: 2150, cliente: { nombre: 'Panadería', apellido: 'El Trigal' } },
      }],
      [],
    )
    expect(r.cantidad).toBe(1)
    expect(r.totalPendiente).toBe(125000)
    expect(r.items[0]).toMatchObject({
      origen: 'DEUDA',
      concepto: 'Fiado no cobrado',
      pedido: { id: 'p1', numero: 2150, cliente: 'Panadería El Trigal' },
      total: 125000,
      pendiente: 125000,
    })
  })

  it('préstamo, adelanto y descuadre de caja se muestran como deuda sin pedido', () => {
    const base = { trabajadorId: 't1', montoOriginal: 100000, montoPendiente: 60000, fecha: fecha('2026-10-12'), pedido: null }
    const r = armarDeudasTrabajador(
      [
        { ...base, id: 'a', tipo: 'PRESTAMO', descripcion: 'Adelanto de moto' },
        { ...base, id: 'b', tipo: 'ADELANTO_NOMINA', descripcion: 'Adelanto' },
        { ...base, id: 'c', tipo: 'DEFICIT_EFECTIVO', descripcion: 'Faltante de caja del embarque #12' },
        { ...base, id: 'd', tipo: 'OTRO', descripcion: 'Otra' },
      ],
      [],
    )
    expect(r.items.map((i) => i.concepto).sort()).toEqual(['Adelanto de nómina', 'Descuadre de caja', 'Otra deuda', 'Préstamo'])
    expect(r.items.every((i) => i.pedido === null)).toBe(true)
    // el total es lo que falta por pagar, no lo prestado
    expect(r.totalPendiente).toBe(240000)
    expect(r.items.find((i) => i.id === 'a')).toMatchObject({ total: 100000, pendiente: 60000 })
  })

  it('un fiado sin pedido enlazado (texto antiguo) sigue llamándose fiado no cobrado', () => {
    const r = armarDeudasTrabajador(
      [{
        id: 'x', trabajadorId: 't1', tipo: 'DEFICIT_EFECTIVO', montoOriginal: 1000, montoPendiente: 1000,
        descripcion: 'Fiado no cobrado: Pedido #7 (Cliente Alguien)', fecha: fecha('2026-10-01'), pedido: null,
      }],
      [],
    )
    expect(r.items[0].concepto).toBe('Fiado no cobrado')
    expect(r.items[0].pedido).toBeNull()
  })

  it('el faltante de embarque no aplicado cuenta como deuda y se ordena por fecha, lo más nuevo primero', () => {
    const r = armarDeudasTrabajador(
      [{
        id: 'd1', trabajadorId: 't1', tipo: 'PRESTAMO', montoOriginal: 50000, montoPendiente: 50000,
        descripcion: 'Préstamo', fecha: fecha('2026-10-10'), pedido: null,
      }],
      [{ id: 'f1', trabajadorId: 't1', monto: 8000, motivo: 'Faltaron 2 pacas', fecha: fecha('2026-10-31') }],
    )
    expect(r.items.map((i) => i.id)).toEqual(['f1', 'd1'])
    expect(r.items[0]).toMatchObject({ origen: 'DESCUENTO_EMBARQUE', concepto: 'Faltante de embarque', detalle: 'Faltaron 2 pacas', total: 8000, pendiente: 8000 })
    expect(r.totalPendiente).toBe(58000)
    expect(r.cantidad).toBe(2)
  })

  it('sin deudas devuelve cero', () => {
    expect(armarDeudasTrabajador([], [])).toEqual({ items: [], totalPendiente: 0, cantidad: 0 })
  })
})
