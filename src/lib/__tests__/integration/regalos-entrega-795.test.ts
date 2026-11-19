import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { crearPedidoUseCase, entregarPedidoUseCase, anularPedidoUseCase } from '@/modules/pedidos'
import { SolicitarReduccionComercialUseCase } from '@/modules/pedidos/application/use-cases/ReduccionComercialUseCases'
import { leerExigibles } from '@/lib/entregas-exigibles-db'
import { leerEntregasConsulta } from '@/lib/entregas-consulta'
import { unidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'
import { calcularComisionRepartidor, comisionDeEmbarque } from '@/lib/comision-repartidor'
import { startOfDayBogota, endOfDayBogota, todayStringBogota } from '@/lib/dates'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/shared/infrastructure/transactions/PrismaTransactionManager'
import { GestionarPendienteUseCase } from '@/modules/embarques/application/use-cases/GestionarPendienteUseCase'

vi.mock('next/cache', () => ({ unstable_cache: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => fn }))

describe('#795 · entrega, exigible, cantidades físicas y comisión', () => {
  let adminId: string, trabajadorId: string
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    trabajadorId = (await db.trabajador.create({ data: { nombre: 'Repartidor prueba regalos', rol: 'REPARTIDOR', usaMoto: true,
      tipoPago: 'COMISION', comRepartAgua: 200 } })).id
    vi.stubEnv('EMBARQUE_ENTREGA_VIVA_DESDE', '2020-01-01T00:00:00Z')
  })
  afterAll(async () => { vi.unstubAllEnvs(); await disconnect() })
  const rango = () => ({ desde: startOfDayBogota(todayStringBogota()), hasta: new Date(+endOfDayBogota(todayStringBogota()) + 1) })
  async function crear() {
    const clienteId = (await db.cliente.create({ data: { nombre: 'Prueba entrega regalo', telefono: randomUUID(), direccion: 'Calle de prueba', barrio: 'Centro' } })).id
    return (await crearPedidoUseCase.execute({ clienteId, canal: 'DOMICILIO', createdById: adminId, createdByRole: 'ADMIN', offlineId: randomUUID(),
      items: [{ producto: 'PACA_AGUA', cantidad: 60, cantidadRegalo: 3, precioManual: 2300, motivoRegalo: 'Regalo acordado' }] })).pedido
  }
  const oficina = () => ({ fechaEntrega: new Date(), fechaEntregaGenerada: true, precisionFecha: 'INSTANTE' as const,
    repartidorId: trabajadorId, promesaPagoFecha: new Date(Date.now() + 86400000) })

  it('10 con precio + 1 gratis: 11 físicas, 23000 exigibles; reintento A/B/A no duplica', async () => {
    const p = await crear(), r = rango()
    const inicial = await unidadesEntregadasDelDia(db, r)
    const A = { pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), oficina: oficina(),
      itemsEntregados: [{ producto: 'PACA_AGUA' as const, cantidad: 10, cantidadRegalo: 1 }] }
    await entregarPedidoUseCase.execute(A)
    expect((await leerExigibles(db, { id: p.id })).get(p.id)).toBe(23000)
    expect((await unidadesEntregadasDelDia(db, r)).agua - inicial.agua).toBe(11)
    const hechos = await leerEntregasConsulta(db, { ids: [p.id] })
    expect(hechos.flatMap(e => e.cantidades ?? [])).toEqual([{ producto: 'PACA_AGUA', cantidad: 11, cantidadRegalo: 1 }])
    expect(hechos.every(e => !e.incompleto)).toBe(true)
    const com = await calcularComisionRepartidor(db, trabajadorId, r.desde, new Date(+r.hasta - 1), { agua: 200, hielo: 200, botellon: 200 }, { detallePedidos: true })
    expect(com.fuentes.find(f => f.id === p.id)?.unidades.agua).toBe(11)
    expect(com.revisiones).toEqual([])
    await entregarPedidoUseCase.execute({ ...A, offlineId: randomUUID(), itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 0, cantidadRegalo: 1 }] })
    expect((await entregarPedidoUseCase.execute(A)).deduped).toBe(true)
    const fila = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true, entregasExigibles: true } })
    expect([fila.items[0].cantEntrega, fila.items[0].cantRegaloEntrega]).toEqual([10, 2])
    expect(fila.entregasExigibles).toHaveLength(2)
    expect(fila.entregasExigibles.reduce((s, e) => s + Number(e.valorEntregado), 0)).toBe(23000)
    expect((await unidadesEntregadasDelDia(db, r)).agua - inicial.agua).toBe(12)
    await expect(entregarPedidoUseCase.execute({ ...A, itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10, cantidadRegalo: 2 }] }))
      .rejects.toThrow('ENTREGA_IDEMPOTENCIA_CONFLICTO')
  })

  it('cliente antiguo sin desglose y regalo inexistente se rechazan sin entregar ni cobrar', async () => {
    const p = await crear()
    for (const itemsEntregados of [
      [{ producto: 'PACA_AGUA' as const, cantidad: 10 }],
      [{ producto: 'PACA_HIELO' as const, cantidad: 0, cantidadRegalo: 1 }],
    ]) {
      await expect(entregarPedidoUseCase.execute({ pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), oficina: oficina(), itemsEntregados }))
        .rejects.toThrow(/REGALO_/)
    }
    const fila = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true, pagos: true, entregasExigibles: true } })
    expect([fila.items[0].cantEntrega, fila.items[0].cantRegaloEntrega]).toEqual([0, 0])
    expect(fila.pagos).toHaveLength(0)
    expect(fila.entregasExigibles).toHaveLength(0)
  })

  it('gestionar pendientes cumple solo las 50 con precio; las 2 gratuitas siguen pendientes en el pedido', async () => {
    const p = await crear()
    const entrega = (cantidad: number, cantidadRegalo: number) => entregarPedidoUseCase.execute({
      pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), oficina: oficina(),
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad, cantidadRegalo }],
    })
    await entrega(10, 1)
    const gestion = await new GestionarPendienteUseCase().execute({
      pedidoId: p.id, producto: 'PACA_AGUA', cantidad: 50, modoInicial: 'DOMICILIO', usuarioId: adminId, offlineId: randomUUID(),
    })
    await entrega(50, 0)
    const obligacion = await db.obligacionPendiente.findUniqueOrThrow({ where: { id: gestion.obligacionId } })
    expect([obligacion.cantidadOriginal, obligacion.cantidadCumplida, obligacion.estado]).toEqual([50, 50, 'CUMPLIDA'])
    const pendiente = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true } })
    expect(pendiente.estadoEntrega).toBe('PENDIENTE')
    expect([pendiente.items[0].cantEntrega, pendiente.items[0].cantRegaloEntrega]).toEqual([60, 1])
    expect((await leerExigibles(db, { id: p.id })).get(p.id)).toBe(138000)
    await entrega(0, 2)
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).estadoEntrega).toBe('ENTREGADO')
    expect((await db.obligacionPendiente.findUniqueOrThrow({ where: { id: gestion.obligacionId } })).cantidadCumplida).toBe(50)
    expect((await leerExigibles(db, { id: p.id })).get(p.id)).toBe(138000)
  })

  it('en vehículo registra 60 ENTREGA + 3 PROMOCION, jamás 63 ENTREGA más 3 PROMOCION', async () => {
    const p = await crear()
    const emb = await db.embarque.create({ data: { trabajadorId, fecha: new Date(), estado: 'EN_RUTA', numeroDia: 1 } })
    await db.pedido.update({ where: { id: p.id }, data: { embarqueId: emb.id, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA', promesaPagoFecha: new Date(Date.now() + 86400000) } })
    const comando = { pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), embarqueEntregaId: emb.id,
      itemsEntregados: [{ producto: 'PACA_AGUA' as const, cantidad: 60, cantidadRegalo: 3 }] }
    await entregarPedidoUseCase.execute(comando)
    expect((await entregarPedidoUseCase.execute(comando)).deduped).toBe(true)
    const movimientos = await db.embarqueMovimiento.findMany({ where: { embarqueId: emb.id } })
    expect(movimientos.map(m => [m.tipo, m.cantidad]).sort()).toEqual([['ENTREGA', 60], ['PROMOCION', 3]])
    expect(movimientos.find(m => m.tipo === 'PROMOCION')?.userId).toBe(adminId)
    const hechos = await leerEntregasConsulta(db, { ids: [p.id] })
    expect(hechos.flatMap(e => e.cantidades ?? []).reduce((s, l) => s + l.cantidad, 0)).toBe(63)
    expect(hechos.every(e => !e.incompleto)).toBe(true)
    const comision = await comisionDeEmbarque(db, emb.id)
    expect(comision.entregasAgua).toBe(63)
    expect(comision.total).toBe(12600)
    expect(comision.revisiones).toEqual([])
    expect((await leerExigibles(db, { id: p.id })).get(p.id)).toBe(138000)
  })

  it('reducir 50 con precio no completa el pedido si aún faltan 3 gratuitas, ni les asigna deuda', async () => {
    const p = await crear()
    await entregarPedidoUseCase.execute({ pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), oficina: oficina(),
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10, cantidadRegalo: 0 }] })
    await db.user.update({ where: { id: adminId }, data: { puedeAutorizarReduccionComercial: true } })
    await new SolicitarReduccionComercialUseCase().execute({ pedidoId: p.id, producto: 'PACA_AGUA', cantidadReducida: 50,
      motivo: 'Reducción aceptada de lo pendiente con precio', aceptadoPor: 'Cliente de prueba', medio: 'PRESENCIAL', actorId: adminId, offlineId: randomUUID() })
    let fila = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true, factura: true } })
    expect(fila.estadoEntrega).toBe('PENDIENTE')
    expect([fila.items[0].cantPedido, fila.items[0].cantRegaloPedido]).toEqual([10, 3])
    expect(Number(fila.total)).toBe(23000)
    expect(Number(fila.factura?.total)).toBe(23000)
    await entregarPedidoUseCase.execute({ pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), oficina: oficina(),
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 0, cantidadRegalo: 3 }] })
    fila = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true, factura: true } })
    expect(fila.estadoEntrega).toBe('ENTREGADO')
    expect(Number(fila.total)).toBe(23000)
    expect((await leerExigibles(db, { id: p.id })).get(p.id)).toBe(23000)
  })

  it('anular una venta con regalo compensa únicamente el dinero recibido y conserva la evidencia', async () => {
    const clienteId = (await db.cliente.create({ data: { nombre: 'Prueba anulación regalo', telefono: randomUUID() } })).id
    const { pedido: p } = await crearPedidoUseCase.execute({ clienteId, canal: 'PUNTO', origen: 'VENTA_RAPIDA',
      createdById: adminId, createdByRole: 'ADMIN', offlineId: randomUUID(), pagos: [{ metodo: 'EFECTIVO', monto: 138000 }],
      items: [{ producto: 'PACA_AGUA', cantidad: 60, cantidadRegalo: 3, precioManual: 2300, motivoRegalo: 'Regalo acordado' }] })
    const cmd = { pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), motivo: 'Anulación de prueba' }
    await anularPedidoUseCase.execute(cmd)
    expect((await anularPedidoUseCase.execute(cmd)).deduped).toBe(true)
    const notas = await db.notaCredito.findMany({ where: { pedidoId: p.id } })
    expect(notas).toHaveLength(1)
    expect(Number(notas[0].monto)).toBe(138000)
    const fila = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true, pagos: true, factura: true } })
    expect(fila.items[0].regaloAutorizadoPorId).toBe(adminId)
    expect(fila.items[0].cantRegaloEntrega).toBe(3)
    expect(fila.pagos).toHaveLength(1)
    expect(fila.factura?.estado).toBe('ANULADA')
    expect(Number(fila.saldo)).toBe(0)
  })

  it('modo anterior, dos viajes: 10+1 y 50+2 concilian 11/52 y comisionan 63 una sola vez', async () => {
    vi.stubEnv('EMBARQUE_ENTREGA_VIVA_DESDE', '')
    try {
      const p = await crear()
      const cerrar = new CerrarEmbarqueUseCase(new PrismaEmbarqueRepository(), new PrismaGastoEmbarqueRepository(),
        new PrismaEmbarqueProductoRepository(), new PrismaTransactionManager(), adminId, 'ADMIN')
      const crearViaje = (cantidad: number, numeroDia: number) => db.embarque.create({ data: {
        trabajadorId, fecha: new Date(), estado: 'EN_RUTA', numeroDia, baseDinero: 0,
        productos: { create: { producto: 'PACA_AGUA', cargadas: cantidad } },
        movimientos: { create: { tipo: 'CARGA', producto: 'PACA_AGUA', cantidad, origen: 'ALMACEN', destino: 'VEHICULO' } },
      } })
      const e1 = await crearViaje(11, 20)
      await db.pedido.update({ where: { id: p.id }, data: { embarqueId: e1.id, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' } })
      await entregarPedidoUseCase.execute({ pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), embarqueEntregaId: e1.id,
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10, cantidadRegalo: 1 }] })
      expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).embarqueId).toBeNull()
      const resultado1 = await cerrar.execute({ id: e1.id, pedidos: [], dineroEntregado: 0, offlineId: randomUUID() })
      expect(resultado1.discrepanciaTotal).toBe(0)
      const e2 = await crearViaje(52, 21)
      await db.pedido.update({ where: { id: p.id }, data: { embarqueId: e2.id, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' } })
      const B = { pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), embarqueEntregaId: e2.id,
        itemsEntregados: [{ producto: 'PACA_AGUA' as const, cantidad: 50, cantidadRegalo: 2 }] }
      await entregarPedidoUseCase.execute(B)
      expect((await entregarPedidoUseCase.execute(B)).deduped).toBe(true)
      const resultado2 = await cerrar.execute({ id: e2.id, pedidos: [{ pedidoId: p.id, entregado: 'COMPLETO', pagos: [] }], dineroEntregado: 0, offlineId: randomUUID() })
      expect(resultado2.discrepanciaTotal).toBe(0)
      const c1 = await comisionDeEmbarque(db, e1.id), c2 = await comisionDeEmbarque(db, e2.id)
      expect(c1.entregasAgua).toBe(11)
      expect(c2.entregasAgua).toBe(52)
      expect(c1.total + c2.total).toBe(12600)
      expect([...c1.revisiones, ...c2.revisiones]).toEqual([])
      const mov1 = await db.embarqueMovimiento.findMany({ where: { embarqueId: e1.id, tipo: { in: ['ENTREGA', 'PROMOCION'] } } })
      const mov2 = await db.embarqueMovimiento.findMany({ where: { embarqueId: e2.id, tipo: { in: ['ENTREGA', 'PROMOCION'] } } })
      expect(mov1.map(m => [m.tipo, m.cantidad]).sort()).toEqual([['ENTREGA', 10], ['PROMOCION', 1]])
      expect(mov2.map(m => [m.tipo, m.cantidad]).sort()).toEqual([['ENTREGA', 50], ['PROMOCION', 2]])
      const r = rango()
      const soloTrabajador = await calcularComisionRepartidor(db, trabajadorId, r.desde, new Date(+r.hasta - 1), { agua: 200, hielo: 200, botellon: 200 })
      expect(soloTrabajador.fuentes.filter(f => f.id === e1.id || f.id === e2.id).reduce((s, f) => s + f.unidades.agua, 0)).toBe(63)
      expect(soloTrabajador.fuentes.some(f => f.origen === 'SIN_EMBARQUE' && f.id === p.id)).toBe(false)
    } finally { vi.stubEnv('EMBARQUE_ENTREGA_VIVA_DESDE', '2020-01-01T00:00:00Z') }
  })
  it('apagar la proyección de fiados no pierde la deduplicación A/B/A de regalos', async () => {
    vi.stubEnv('FIADO_ENTREGA_PARCIAL', 'false')
    try {
      const p = await crear()
      const A = { pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), oficina: oficina(),
        itemsEntregados: [{ producto: 'PACA_AGUA' as const, cantidad: 10, cantidadRegalo: 0 }] }
      await entregarPedidoUseCase.execute(A)
      await entregarPedidoUseCase.execute({ ...A, offlineId: randomUUID(), itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 0, cantidadRegalo: 1 }] })
      expect((await entregarPedidoUseCase.execute(A)).deduped).toBe(true)
      const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id } })
      expect([item.cantEntrega, item.cantRegaloEntrega]).toEqual([10, 1])
      expect(await db.entregaExigible.count({ where: { pedidoId: p.id } })).toBe(2)
    } finally { vi.stubEnv('FIADO_ENTREGA_PARCIAL', 'true') }
  })
  it('una primera entrega solo gratuita conserva el modo vivo al apagar el flag y concilia al cerrar', async () => {
    const p = await crear()
    const emb = await db.embarque.create({ data: { trabajadorId, fecha: new Date(), estado: 'EN_RUTA', numeroDia: 22, baseDinero: 0,
      productos: { create: { producto: 'PACA_AGUA', cargadas: 1 } } } })
    await db.pedido.update({ where: { id: p.id }, data: { embarqueId: emb.id, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA' } })
    await entregarPedidoUseCase.execute({ pedidoId: p.id, actorId: adminId, offlineId: randomUUID(), embarqueEntregaId: emb.id,
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 0, cantidadRegalo: 1 }] })
    vi.stubEnv('EMBARQUE_ENTREGA_VIVA_DESDE', '')
    try {
      const cerrar = new CerrarEmbarqueUseCase(new PrismaEmbarqueRepository(), new PrismaGastoEmbarqueRepository(),
        new PrismaEmbarqueProductoRepository(), new PrismaTransactionManager(), adminId, 'ADMIN')
      const resultado = await cerrar.execute({ id: emb.id, pedidos: [], dineroEntregado: 0, offlineId: randomUUID() })
      expect(resultado.discrepanciaTotal).toBe(0)
      const comision = await comisionDeEmbarque(db, emb.id)
      expect(comision.entregasAgua).toBe(1)
      expect(comision.total).toBe(200)
      expect(comision.revisiones).toEqual([])
      expect(await db.embarqueMovimiento.count({ where: { embarqueId: emb.id, tipo: 'ENTREGA' } })).toBe(0)
    } finally { vi.stubEnv('EMBARQUE_ENTREGA_VIVA_DESDE', '2020-01-01T00:00:00Z') }
  })
})
