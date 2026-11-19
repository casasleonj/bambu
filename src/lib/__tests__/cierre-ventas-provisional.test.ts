import { describe,expect,it } from 'vitest'
import { prepararVentasProvisional, proyectarRegularizacion } from '@/lib/cierre-ventas-provisional'
const casos=[{pedidoId:'a',numero:1,motivo:'REVERSA_AMBIGUA'},{pedidoId:'b',numero:2,motivo:'VENTA_PREVIA_SIN_DETALLE_DE_CIERRE'}]
const base={fecha:'2026-11-19',totalVentas:649500,ventasPorConciliar:casos}
describe('#885 cierre provisional',()=>{
 it('solo permite diferir reversas comerciales, no precios de ventas ni errores de stock',()=>{
  expect(prepararVentasProvisional({...base,ventasPorConciliar:[]})).toBeNull()
  expect(prepararVentasProvisional({...base,ventasPorConciliar:[{pedidoId:'x',motivo:'PRECIO_ENTREGA_NO_VERIFICADO'}]})).toBeNull()
  expect(prepararVentasProvisional({...base,unidadesError:true})).toBeNull()
  expect(prepararVentasProvisional({...base,unidadesAproximadas:[{unidades:{agua:1}}]})).toBeNull()
  expect(prepararVentasProvisional({...base,ventasPorConciliar:[casos[0],casos[0]]})).toBeNull()
 })
 it('la autorización es estable al ordenar y cambia al modificar el subtotal o los casos',()=>{
  const p=prepararVentasProvisional(base)!
  expect(prepararVentasProvisional({...base,ventasPorConciliar:[...casos].reverse()})?.huella).toBe(p.huella)
  expect(prepararVentasProvisional({...base,totalVentas:649501})?.huella).not.toBe(p.huella)
  expect(prepararVentasProvisional({...base,ventasPorConciliar:[casos[0]]})?.huella).not.toBe(p.huella)
 })
 it('no certifica una regularización parcial; cero explícito es distinto de ausente',()=>{
  const p=prepararVentasProvisional(base)!
  const r=new Map()
  expect(proyectarRegularizacion(p,r).totalCertificado).toBeNull()
  const rev=(id:string,centavos:number)=>({id,version:1,actor:'admin',fecha:'2026-11-20T00:00:00Z',huella:p.huella,casoId:id,operacion:'RESOLVER',centavos,referencia:'Informe original verificado'})
  r.set(p.casos[0].id,rev(p.casos[0].id,4600000))
  expect(proyectarRegularizacion(p,r)).toMatchObject({pendientes:1,subtotalIdentificado:603500,totalCertificado:null})
  r.set(p.casos[1].id,rev(p.casos[1].id,0))
  expect(proyectarRegularizacion(p,r)).toMatchObject({pendientes:0,totalCertificado:603500,subtotalOriginal:649500})
  r.set(p.casos[0].id,{...rev(p.casos[0].id,0),version:2,operacion:'REVOCAR'})
  expect(proyectarRegularizacion(p,r).totalCertificado).toBeNull()
 })
})
