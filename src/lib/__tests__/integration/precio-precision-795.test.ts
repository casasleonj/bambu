import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { crearPedidoUseCase, previewPedidoUseCase, entregarPedidoUseCase } from '@/modules/pedidos'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PedidoId } from '@/modules/pedidos/domain/value-objects/PedidoId'
import { leerExigibles } from '@/lib/entregas-exigibles-db'
import { valorEntregadoPedidoCentavos } from '@/lib/valor-entregado-pedido'
import { SolicitarCorreccionPrecioUseCase } from '@/modules/pedidos/application/use-cases/CorreccionPrecioUseCases'
import { SolicitarReduccionComercialUseCase } from '@/modules/pedidos/application/use-cases/ReduccionComercialUseCases'

// El test usa PostgreSQL real, pero no un request de Next. Se omite solo su caché.
vi.mock('next/cache', () => ({
  unstable_cache: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => fn,
}))

describe('#795 precio preciso persiste y concilia pedido/factura/entregas/fiado', () => {
  let clienteId: string, adminId: string
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await db.cliente.create({data: {nombre:'Prueba precisión 795',telefono:randomUUID(),direccion:'Calle de prueba',barrio:'Centro'}})).id
  })
  afterAll(disconnect)

  const items = [{producto:'PACA_AGUA' as const,cantidad:63,precioManual:2190.47619}]
  const repo = new PrismaPedidoRepository()

  async function crear(pagos: Array<{metodo:'EFECTIVO';monto:number}> = []) {
    return crearPedidoUseCase.execute({clienteId,canal:'PUNTO',origen:'PEDIDO',items,pagos,
      createdById:adminId,createdByRole:'ADMIN',offlineId:randomUUID()})
  }

  it('preview, commit, fila, columnas legacy y factura comparten138000 exactos', async () => {
    const preview = await previewPedidoUseCase.execute({clienteId,canal:'PUNTO',items,actorId:adminId})
    expect(preview.calculation.total).toBe(138000)
    const {pedido} = await crear()
    const persisted = await db.pedido.findUniqueOrThrow({where:{id:pedido.id},include:{items:true,factura:true}})
    expect(Number(persisted.items[0].precio)).toBe(2190.47619)
    expect(Number(persisted.precioPacaAgua)).toBe(2190.47619)
    expect(Number(persisted.items[0].subtotal)).toBe(138000)
    expect(Number(persisted.total)).toBe(138000)
    expect(Number(persisted.factura?.total)).toBe(138000)
    const reloaded = await repo.findById(PedidoId.from(pedido.id))
    expect(reloaded?.items[0].precio.toDecimal()).toBe(2190.47619)
    expect(reloaded?.items[0].subtotalPedido.toDecimal()).toBe(138000)
  })

  it('63 parciales y replay A/B/A no acumulan centavos ni repiten cantidades', async () => {
    const {pedido} = await crear()
    const comandos: Parameters<typeof entregarPedidoUseCase.execute>[0][] = []
    for(let n=0;n<63;n++) {
      const comando = {pedidoId:pedido.id,actorId:adminId,offlineId:randomUUID(),
        itemsEntregados:[{producto:'PACA_AGUA' as const,cantidad:1}],
        oficina:{fechaEntrega:new Date(),fechaEntregaGenerada:true,promesaPagoFecha:new Date(Date.now()+86400000)}}
      comandos.push(comando)
      await entregarPedidoUseCase.execute(comando)
      const raw = await db.pedido.findUniqueOrThrow({where:{id:pedido.id},include:{items:true}})
      const exigible = (await leerExigibles(db,{id:pedido.id})).get(pedido.id)
      expect(exigible).toBe(valorEntregadoPedidoCentavos(raw)/100)
      expect(raw.items[0].cantEntrega).toBe(n+1)
    }
    expect((await entregarPedidoUseCase.execute(comandos[0])).deduped).toBe(true)
    const raw = await db.pedido.findUniqueOrThrow({where:{id:pedido.id},include:{items:true,entregasExigibles:true,factura:true}})
    expect(raw.entregasExigibles).toHaveLength(63)
    expect(raw.entregasExigibles.reduce((sum,e)=>sum+Math.round(Number(e.valorEntregado)*100),0)).toBe(13800000)
    expect(Number(raw.saldo)).toBe(138000)
    expect(Number(raw.factura?.saldo)).toBe(138000)
    expect(raw.estadoEntrega).toBe('ENTREGADO')
  })

  it('prepago exacto no deja deuda ni excedente al completar las63unidades', async () => {
    const {pedido} = await crear([{metodo:'EFECTIVO',monto:138000}])
    await entregarPedidoUseCase.execute({pedidoId:pedido.id,actorId:adminId,offlineId:randomUUID(),
      itemsEntregados:[{producto:'PACA_AGUA',cantidad:63}],oficina:{fechaEntrega:new Date(),fechaEntregaGenerada:true}})
    const raw = await db.pedido.findUniqueOrThrow({where:{id:pedido.id},include:{factura:true,pagos:true}})
    expect(Number(raw.totalPagado)).toBe(138000)
    expect(Number(raw.saldo)).toBe(0)
    expect(raw.estadoPago).toBe('PAGADO')
    expect(Number(raw.factura?.saldo)).toBe(0)
    expect(raw.pagos).toHaveLength(1)
    expect((await leerExigibles(db,{id:pedido.id})).get(pedido.id)).toBe(0)
  })

  it('corrección y reducción autorizadas mantienen precio preciso, snapshots e importe de factura', async () => {
    const cliente = await db.cliente.create({data:{nombre:'Prueba correcciones 795',telefono:randomUUID()}})
    const {pedido} = await crearPedidoUseCase.execute({clienteId:cliente.id,canal:'PUNTO',items,
      createdById:adminId,createdByRole:'ADMIN',offlineId:randomUUID()})
    const corregido = await new SolicitarCorreccionPrecioUseCase().execute({pedidoId:pedido.id,
      producto:'PACA_AGUA',precioNuevo:2190.476191,motivo:'Precio preciso acordado',actorId:adminId,actorRol:'ADMIN',offlineId:randomUUID()})
    expect(corregido.estado).toBe('APLICADA')
    let raw = await db.pedido.findUniqueOrThrow({where:{id:pedido.id},include:{items:true,factura:true}})
    expect(Number(raw.items[0].precio)).toBe(2190.476191)
    expect(Number(raw.total)).toBe(138000)
    const snapshot = await db.pedidoCorreccionPrecio.findUniqueOrThrow({where:{id:corregido.id}})
    expect(Number(snapshot.precioAnterior)).toBe(2190.47619)
    expect(Number(snapshot.precioNuevo)).toBe(2190.476191)
    // Habilitación solo en la base aislada de prueba para ejercitar el rol real.
    await db.user.update({where:{id:adminId},data:{puedeAutorizarReduccionComercial:true}})
    const reducido = await new SolicitarReduccionComercialUseCase().execute({pedidoId:pedido.id,
      producto:'PACA_AGUA',cantidadReducida:1,motivo:'Cliente acepta reducir una unidad',
      aceptadoPor:'Cliente de prueba',medio:'PRESENCIAL',actorId:adminId,offlineId:randomUUID()})
    expect(reducido.estado).toBe('APLICADA')
    raw = await db.pedido.findUniqueOrThrow({where:{id:pedido.id},include:{items:true,factura:true}})
    expect(Number(raw.total)).toBe(135809.52)
    expect(Number(raw.items[0].subtotal)).toBe(135809.52)
    expect(Number(raw.factura?.total)).toBe(135809.52)
    const reduccion = await db.pedidoReduccionComercial.findUniqueOrThrow({where:{id:reducido.id}})
    expect(Number(reduccion.precio)).toBe(2190.476191)
    expect(Number(reduccion.monto)).toBe(2190.48)
  })
})
