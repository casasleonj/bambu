// #630 F1-B0. PostgreSQL aislado: comparación de solo lectura y fixtures sintéticos.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testPrisma as db, resetAndSeed, disconnect } from './setup'
import { compararEntregasDelDia630 } from '@/lib/comparacion-entregas-630'

const momento = (fecha: string) => new Date(fecha + 'T12:00:00-05:00')

describe('#630 F1-B0 · contraste con consulta oficial sobre PostgreSQL aislado', () => {
  let clienteId: string
  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (await db.cliente.create({
      data: { nombre: 'B0 sintético', telefono: randomUUID() },
    })).id
  })
  afterAll(disconnect)

  async function crearPedido(creacion: string, cantidad: number, estado: 'EN_RUTA' | 'ANULADO' = 'EN_RUTA') {
    return db.pedido.create({ data: {
      clienteId, fecha: momento(creacion), canal: 'DOMICILIO', origen: 'PEDIDO',
      estado, estadoEntrega: estado,
      estadoPago: estado === 'ANULADO' ? 'ANULADO' : 'PENDIENTE',
      total: estado === 'ANULADO' ? 0 : 23000,
      saldo: estado === 'ANULADO' ? 0 : 23000,
      totalPagado: 0, cPacaAguaEnt: cantidad,
    } })
  }
  async function registrarEntrega(id: string, fecha: string, cantidad: number) {
    await db.historial.create({ data: {
      entidad: 'Pedido', registroId: id, accion: 'UPDATE',
      datos: JSON.stringify({
        accion: 'ENTREGA',
        consultaEntrega: { version: 1, eventoEntregaId: randomUUID(),
          fecha: momento(fecha).toISOString(), precisionFecha: 'INSTANTE',
          repartidorId: null, cantidades: [{ producto: 'PACA_AGUA', cantidad }] },
      }),
    } })
  }

  it('muestra divergencia por parcial con residual, sin modificar pedido o historial', async () => {
    const p = await crearPedido('2033-04-11', 10)
    await registrarEntrega(p.id, '2033-04-12', 4)
    const antes = await db.pedido.findUniqueOrThrow({ where: { id: p.id } })
    const cantidadHistorial = await db.historial.count({ where: { registroId: p.id } })
    const resultado = await compararEntregasDelDia630(db, '2033-04-12')
    const agua = resultado.porProducto.find(x => x.producto === 'PACA_AGUA')!
    const detalle = resultado.diagnostico.pedidos.find(x => x.pedidoId === p.id)!
    expect(detalle.lineas[0]).toMatchObject({ conEvidenciaEnDia: 4, residualSinFecha: 6 })
    expect(agua).toMatchObject({ oficial: 0, conFechaAtribuible: 4,
      diferenciaOficialMenosAtribuible: -4, calidad: 'REQUIERE_REVISION' })
    expect(await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).toEqual(antes)
    expect(await db.historial.count({ where: { registroId: p.id } })).toBe(cantidadHistorial)
  })

  it('parciales completas en dos días no cuentan doble ni mueven fecha de creación', async () => {
    const p = await crearPedido('2033-05-11', 10)
    await registrarEntrega(p.id, '2033-05-12', 4)
    await registrarEntrega(p.id, '2033-05-13', 6)
    const martes = await compararEntregasDelDia630(db, '2033-05-12')
    const miercoles = await compararEntregasDelDia630(db, '2033-05-13')
    expect(martes.porProducto[0]).toMatchObject({
      oficial: 4, conFechaAtribuible: 4, residualSinFecha: 0,
      calidad: 'COINCIDENCIA_NUMERICA_NO_CERTIFICADA',
    })
    expect(miercoles.porProducto[0]).toMatchObject({
      oficial: 6, conFechaAtribuible: 6, residualSinFecha: 0,
    })
  })

  it('anulación conserva salida histórica en revisión, sin agregarla a venta oficial', async () => {
    const p = await crearPedido('2033-06-11', 3, 'ANULADO')
    await registrarEntrega(p.id, '2033-06-12', 3)
    const c = await compararEntregasDelDia630(db, '2033-06-12')
    expect(c.porProducto[0]).toMatchObject({
      oficial: 0, conFechaAtribuible: 0, conFechaEnRevision: 3,
      calidad: 'REQUIERE_REVISION',
    })
  })

  it('rechaza fechas inválidas sin escribir información', async () => {
    await expect(compararEntregasDelDia630(db, '2033-02-30')).rejects.toThrow('FECHA_SOMBRA_INVALIDA')
  })
})
