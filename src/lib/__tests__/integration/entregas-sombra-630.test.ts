// #630 F1-A: pruebas con PostgreSQL aislado y pedidos sintéticos. Nunca ejecutar contra producción.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testPrisma as db, resetAndSeed, disconnect } from './setup'
import { consultarEntregasSombraDelDia } from '@/lib/entregas-sombra-630'
import { unidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'
import { startOfDayInBogota } from '@/lib/date-helpers'

const lunes = '2032-04-12'
const martes = '2032-04-13'
const t = (dia: string, hora = '12:00:00') => new Date(`${dia}T${hora}-05:00`)
const rango = (dia: string) => {
  const desde = startOfDayInBogota(dia)
  return { desde, hasta: new Date(+desde + 86_400_000) }
}

describe('#630 F1-A: lector sombra utiliza hechos existentes sin alterar fuentes', () => {
  let clienteId: string
  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (await db.cliente.create({
      data: { nombre: 'Prueba sombra #630', telefono: randomUUID() },
    })).id
  })
  afterAll(disconnect)

  async function crearPedido(unidades: number, estadoEntrega: 'EN_RUTA' | 'ENTREGADO' | 'ANULADO' = 'EN_RUTA') {
    return db.pedido.create({
      data: {
        clienteId, fecha: t(lunes), canal: 'DOMICILIO', origen: 'PEDIDO',
        estado: estadoEntrega, estadoEntrega,
        estadoPago: estadoEntrega === 'ANULADO' ? 'ANULADO' : 'PENDIENTE',
        total: estadoEntrega === 'ANULADO' ? 0 : 23000,
        saldo: estadoEntrega === 'ANULADO' ? 0 : 23000,
        totalPagado: 0, cPacaAguaEnt: unidades,
      },
    })
  }

  async function evento(pedidoId: string, dia: string, cantidad: number) {
    return db.historial.create({
      data: {
        entidad: 'Pedido', registroId: pedidoId, accion: 'UPDATE',
        datos: JSON.stringify({
          accion: 'ENTREGA', consultaEntrega: {
            version: 1, eventoEntregaId: randomUUID(), fecha: t(dia).toISOString(),
            precisionFecha: 'INSTANTE', repartidorId: null,
            cantidades: [{ producto: 'PACA_AGUA', cantidad }],
          },
        }),
      },
    })
  }

  it('conserva parcial martes 4 y residual 6 sin atribuir; no modifica el cálculo oficial', async () => {
    const p = await crearPedido(10)
    await evento(p.id, martes, 4)
    const antes = await unidadesEntregadasDelDia(db, rango(martes))
    const historialAntes = await db.historial.count({ where: { registroId: p.id } })
    const sombra = await consultarEntregasSombraDelDia(db, martes)
    const linea = sombra.pedidos.find(x => x.pedidoId === p.id)?.lineas.find(x => x.producto === 'PACA_AGUA')
    expect(sombra.modo).toBe('SOLO_LECTURA')
    expect(linea).toMatchObject({
      conEvidenciaEnDia: 4, residualSinFecha: 6, excesoFrenteAcumulado: 0, estado: 'SIN_FECHA',
    })
    expect(await unidadesEntregadasDelDia(db, rango(martes))).toEqual(antes)
    expect(await db.historial.count({ where: { registroId: p.id } })).toBe(historialAntes)
  })

  it('un evento efectivo posterior no se traslada a la fecha de creación del pedido', async () => {
    const p = await crearPedido(10)
    await evento(p.id, martes, 4)
    await evento(p.id, '2032-04-14', 6)
    const martesResultado = await consultarEntregasSombraDelDia(db, martes)
    const linea = martesResultado.pedidos.find(x => x.pedidoId === p.id)?.lineas.find(x => x.producto === 'PACA_AGUA')
    expect(linea?.porDia).toEqual([
      { dia: martes, cantidad: 4 }, { dia: '2032-04-14', cantidad: 6 },
    ])
    expect(linea).toMatchObject({
      conEvidenciaEnDia: 4, conEvidenciaOtrosDias: 6, residualSinFecha: 0, estado: 'CONCILIADO',
    })
  })

  it('pedido anulado tras entregar conserva rastro, pero exige revisión de compensación', async () => {
    const p = await crearPedido(3, 'ANULADO')
    await evento(p.id, martes, 3)
    const sombra = await consultarEntregasSombraDelDia(db, martes)
    const linea = sombra.pedidos.find(x => x.pedidoId === p.id)?.lineas.find(x => x.producto === 'PACA_AGUA')
    expect(linea?.conEvidenciaEnDia).toBe(3)
    expect(linea?.estado).toBe('REVISAR_ANULACION')
    expect(linea?.alertas).toContain('ESTADO_ACTUAL_ANULADO_REVISAR_COMPENSACION')
  })

  it('rechaza fechas inválidas antes de leer datos reales', async () => {
    await expect(consultarEntregasSombraDelDia(db, '2032-02-30')).rejects.toThrow('FECHA_SOMBRA_INVALIDA')
    await expect(consultarEntregasSombraDelDia(db, '2032-04-12T12:00')).rejects.toThrow('FECHA_SOMBRA_INVALIDA')
  })
})
