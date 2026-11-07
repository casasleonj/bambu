// Investigación / futura regresión #656 y #673. Solo datos sintéticos.
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
vi.mock('next/cache',()=>({unstable_cache:(fn:unknown)=>fn,revalidateTag:vi.fn()}))
const mockAuth=vi.fn()
vi.mock('@/lib/auth',()=>({auth:()=>mockAuth()}))
vi.mock('@/lib/realtime',()=>({publishRealtimeEvent:vi.fn().mockResolvedValue(undefined)}))
vi.mock('@/lib/notifications/notify-event',()=>({notifyEvent:vi.fn().mockResolvedValue(undefined)}))
vi.mock('@/lib/push',()=>({sendPushToUser:vi.fn().mockResolvedValue(undefined)}))
import { testPrisma as db, resetAndSeed, getAdminUser, disconnect } from './setup'
import { registrarEntregaExigible, leerExigibles } from '@/lib/entregas-exigibles-db'
import { construirResumenCierre } from '@/lib/cierre-resumen'
import { consultarPedidos } from '@/lib/pedidos-consulta.repository'
import { leerFiltrosConsulta } from '@/lib/pedidos-consulta'
import { GET as detalle } from '@/app/api/pedidos/[id]/route'
import { PrismaPedidoRepository as DashboardPedidos } from '@/modules/dashboard/infrastructure/pedido.repository'
import { calcularVentas, calcularFiados } from '@/modules/dashboard/domain/ventas.service'
import { entregarPedidoUseCase } from '@/modules/pedidos'
import { POST as pagarFiado } from '@/app/api/pedidos/pagar-fiado/route'
import { GET as consultarCierre } from '@/app/api/cierre/route'
const dia='2026-11-05', fecha=new Date(`${dia}T12:00:00-05:00`)
let clienteId:string,parcialId:string,nuevoId:string
const filtros=(extra='')=>leerFiltrosConsulta(new URLSearchParams(`desde=${dia}&hasta=${dia}&resumen=1&clienteId=${clienteId}&${extra}`))
async function casoSinHecho() {
  const c=await db.cliente.create({data:{nombre:'Fuente sintética',telefono:randomUUID()}})
  const p=await db.pedido.create({data:{clienteId:c.id,fecha,total:12000,saldo:12000,items:{create:{producto:'PACA_AGUA',cantPedido:6,cantEntrega:4,precio:2000,subtotal:12000}}}})
  const f=leerFiltrosConsulta(new URLSearchParams(`desde=${dia}&hasta=${dia}&resumen=1&clienteId=${c.id}`))
  return {p,c,f}
}
describe('Parcial: misma exigibilidad entre proyecciones',()=>{
  beforeAll(async()=>{
    await resetAndSeed();const admin=await getAdminUser()
    mockAuth.mockResolvedValue({user:{id:admin.id,role:'ADMIN'},expires:'2099-01-01'})
    clienteId=(await db.cliente.create({data:{nombre:'Parcial sintético',telefono:randomUUID()}})).id
    const p=await db.pedido.create({data:{clienteId,fecha,total:12000,saldo:12000,totalPagado:0,cPacaAguaPed:6,cPacaAguaEnt:4,precioPacaAgua:2000,items:{create:{producto:'PACA_AGUA',cantPedido:6,cantEntrega:4,precio:2000,subtotal:12000}},factura:{create:{numero:`FSYN-${randomUUID()}`,clienteId,fecha,subtotal:12000,total:12000,saldo:12000}}}})
    parcialId=p.id
    nuevoId=(await db.pedido.create({data:{clienteId,fecha,total:5000,saldo:5000,totalPagado:0,items:{create:{producto:'PACA_HIELO',cantPedido:1,cantEntrega:0,precio:5000,subtotal:5000}}}})).id
    await registrarEntregaExigible(db as never,{pedidoId:p.id,entregadoAt:fecha,eventoId:randomUUID(),huella:'sintetica-verificable',lineas:[{producto:'PACA_AGUA',cantidad:4,precioCents:200000}],pedido:{total:12000,totalPagado:0,saldo:12000}})
    await db.historial.create({data:{entidad:'Pedido',registroId:p.id,accion:'UPDATE',fecha,datos:JSON.stringify({accion:'ENTREGA_OFICINA',consultaEntrega:{version:1,fecha:fecha.toISOString(),cantidades:[{producto:'PACA_AGUA',cantidad:4}],repartidorId:null,eventoEntregaId:null}})}})
  })
  afterAll(disconnect)
  it('control: Dashboard ya valora solo lo entregado y el lector devuelve el exigible',async()=>{
    const rango={gte:new Date(`${dia}T05:00Z`),lt:new Date('2026-11-06T05:00Z')}
    const pedidos=await new DashboardPedidos(db).findByDateRange(rango.gte,rango.lt)
    expect(calcularVentas(pedidos)).toBe(8000);expect(calcularFiados(pedidos)).toBe(8000)
    expect((await leerExigibles(db,{id:parcialId})).get(parcialId)).toBe(8000)
  })
  it('Cierre no suma mercancía sin entregar como fiado',async()=>{
    const {cierre}=await construirResumenCierre(db,dia)
    expect(cierre.totalVentas).toBe(8000)
    expect(cierre.valorComercialPedidosDelDia).toBe(17000)
    expect(cierre.fiado).toBe(8000)
    expect(cierre.fiadosDelDia.map(p=>p.pedidoId)).toEqual([parcialId])
    expect(cierre.fiadosDelDia[0].saldo).toBe(8000)
  })
  it('resumen de consulta separa el exigible del saldo de entrega pendiente',async()=>{
    const r=await consultarPedidos(filtros(),'ADMIN',db)
    expect(r.resumen).toMatchObject({importe:17000,pagado:0,saldo:17000,fiado:8000,pendienteEntrega:9000})
  })
  it.each(['pago=fiado','foco=esperandoPago'])('%s incluye parcial exigible y pagina después de filtrar',async extra=>{
    const r=await consultarPedidos(filtros(`${extra}&pageSize=1`),'ADMIN',db)
    expect(r.total).toBe(1);expect(r.pedidos[0].id).toBe(parcialId)
    expect(r.pedidos[0].exigible).toBe(8000)
    expect(r.pedidos.some(p=>p.id===nuevoId)).toBe(false)
  })
  it('el detalle devuelve exigible, sin cambiar valor comercial o factura',async()=>{
    const res=await detalle(new NextRequest(`http://localhost/api/pedidos/${parcialId}`),{params:Promise.resolve({id:parcialId})})
    expect(res.status).toBe(200)
    const body=await res.json(),p=body.pedido??body.data?.pedido
    expect(p).toMatchObject({total:12000,saldo:12000,exigible:8000})
  })
  it('cobra lo entregado, conserva el remanente y refleja entrega y pago final sin duplicar',async()=>{
    const pagar=async(monto:number,offlineId=randomUUID())=>pagarFiado(new NextRequest('http://localhost/api/pedidos/pagar-fiado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clienteId,monto,metodo:'NEQUI',offlineId})}))
    const clave=randomUUID()
    expect((await pagar(8000,clave)).status).toBe(200)
    expect((await pagar(8000,clave)).status).toBe(200)
    const parcial=await consultarPedidos(filtros(),'ADMIN',db)
    expect(parcial.resumen).toMatchObject({importe:17000,pagado:8000,saldo:9000,fiado:0,pendienteEntrega:9000})
    expect(parcial.pedidos.find(p=>p.id===parcialId)).toMatchObject({exigible:0,estadoEntrega:'PENDIENTE'})
    await db.pedido.update({where:{id:parcialId},data:{estado:'EN_RUTA',estadoEntrega:'EN_RUTA'}})
    await entregarPedidoUseCase.execute({pedidoId:parcialId,itemsEntregados:[{producto:'PACA_AGUA',cantidad:2}],offlineId:randomUUID()})
    const completo=await consultarPedidos(filtros(),'ADMIN',db)
    expect(completo.pedidos.find(p=>p.id===parcialId)).toMatchObject({exigible:4000,estadoEntrega:'ENTREGADO',saldo:4000})
    expect((await pagar(4000)).status).toBe(200)
    const final=await consultarPedidos(filtros(),'ADMIN',db)
    expect(final.pedidos.find(p=>p.id===parcialId)).toMatchObject({total:12000,totalPagado:12000,saldo:0,exigible:0})
    const f=await db.factura.findUniqueOrThrow({where:{pedidoId:parcialId}})
    expect(Number(f.total)).toBe(12000);expect(Number(f.saldo)).toBe(0)
    expect(await db.pago.count({where:{pedidoId:parcialId}})).toBe(2)
    expect(await db.abono.count({where:{pedidoId:parcialId,origenCobro:'ESPEJO_PAGO'}})).toBe(2)
  })
  it('un parcial sin fuente exigible queda por conciliar, no se inventa una deuda desde el acumulado',async()=>{
    const {p,f}=await casoSinHecho()
    const r=await consultarPedidos(f,'ADMIN',db)
    expect(r.pedidos[0]).toMatchObject({id:p.id,exigible:0})
    expect(r.resumen).toMatchObject({exigiblesPorConciliar:1,fiado:0})
    const {cierre}=await construirResumenCierre(db,dia)
    expect(cierre.parcialesPorConciliar).toContainEqual({pedidoId:p.id,numero:p.numero})
  })
  it('flag OFF conserva deuda de completos y no transforma un parcial antiguo en deuda entregada',async()=>{
    const {f}=await casoSinHecho()
    vi.stubEnv('FIADO_ENTREGA_PARCIAL','false')
    try{const r=await consultarPedidos(f,'ADMIN',db);expect(r.resumen?.fiado).toBe(0);expect(r.resumen?.exigiblesPorConciliar).toBe(1)}finally{vi.unstubAllEnvs()}
  })
  it.each(['ANULADO','CANCELADO']as const)('%s no aporta ventas ni deuda aunque conserve una entrega anterior',async estado=>{
    const {p,f}=await casoSinHecho()
    await db.pedido.update({where:{id:p.id},data:{estado,estadoEntrega:estado,estadoPago:'ANULADO'}})
    const r=await consultarPedidos({...f,registro:'todos'},'ADMIN',db)
    expect(r.resumen).toMatchObject({importe:0,pagado:0,saldo:0,fiado:0,exigiblesPorConciliar:0})
    const pedido=(await new DashboardPedidos(db).findByDateRange(new Date(`${dia}T05:00Z`),new Date('2026-11-06T05:00Z'))).find(x=>x.id===p.id)!
    expect(calcularVentas([pedido])).toBe(0)
  })
  it('el GET de un cierre consolidado conserva sus cifras y no les aplica la nueva definición',async()=>{
    const fechaGuardada=new Date('2026-09-01T05:00Z')
    const original=await db.cierreDia.create({data:{fecha:fechaGuardada,totalVentas:99000,fiado:7000,reporte:{_version:'2.1',nota:'Snapshot sintético'}}})
    const res=await consultarCierre(new NextRequest('http://localhost/api/cierre?fecha=2026-09-01'))
    expect(res.status).toBe(200)
    const body=await res.json()
    expect(body.status).toBe('CERRADO');expect(body.cierre).toMatchObject({totalVentas:99000,fiado:7000,_version:'2.1'})
    expect(body.cierre.valorComercialPedidosDelDia).toBeUndefined()
    expect(await db.cierreDia.findUniqueOrThrow({where:{id:original.id}})).toEqual(original)
  })
})
