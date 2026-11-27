import { describe,it,expect } from 'vitest'
import { resumirRepartoHistorico, valorarJornadaReparto, type JornadaReparto } from '../comision-reparto-historico'
import type { VersionTarifa } from '../comision-tarifa-version'
import type { FuenteComision } from '../comision-repartidor-calculo'

const trabajadorId='repartidor-sintetico'
const fecha=(s:string)=>new Date(s+'T00:00:00Z')
const plan=(agua:string,hielo='300',botellon='500',usaMoto=true,tipoPago='COMISION')=>({version:1,rol:'REPARTIDOR',tipoPago,usaMoto,comPacaAgua:'300',comPacaHielo:'300',comBotellon:'300',comRepartAgua:agua,comRepartHielo:hielo,comRepartBotellon:botellon})
const v=(id:number,dia:string,datos:unknown,global=false):VersionTarifa=>({id:BigInt(id),ambito:global?'COM_REPARTIDOR':'TRABAJADOR',trabajadorId:global?null:trabajadorId,fechaVigencia:fecha(dia),registradoAt:fecha(dia),datos})
const f=(agua:number,hielo=0,botellon=0,id='pedido-parcial',origen:FuenteComision['origen']='SIN_EMBARQUE'):FuenteComision=>({id,href:'/pedidos/'+id,origen,unidades:{agua,hielo,botellon}})
const j=(dia:string,...fuentes:FuenteComision[]):JornadaReparto=>({dia,fuentes,revisiones:[]})
const d1='2026-11-26',d2='2026-11-27'
describe('#1010 F2B.2A reparto histórico (diagnóstico)',()=>{
  it('100×300 + 50×330 = 46500; un mismo pedido parcial no se elimina por identidad repetida',()=>{
    const jornadas=[j(d1,f(100)),j(d2,f(50))]
    const r=resumirRepartoHistorico(trabajadorId,d1,d2,jornadas,[v(1,d1,plan('300')),v(2,d2,plan('330'))],{fuentes:[f(150)],revisiones:[]})
    expect(r).toMatchObject({liquidable:false,fuentesCuadran:true,totalCandidato:46500})
    expect(r.jornadas.map(x=>[x.trabajadorVersionId,x.calculo?.total])).toEqual([['1',30000],['2',16500]])
  })
  it('aplica fallback general por jornada y mantiene botellón a 200, sin usar el precio de venta',()=>{
    const versiones=[v(1,d1,plan('0','0','0')),v(2,d1,{version:1,valor:'250'},true),v(3,d2,{version:1,valor:'330'},true)]
    const jornadas=[j(d1,f(1,2,3)),j(d2,f(2,1,1))]
    const r=resumirRepartoHistorico(trabajadorId,d1,d2,jornadas,versiones,{fuentes:[f(3,3,4)],revisiones:[]})
    expect(r.totalCandidato).toBe(250*3+330*3+200*4)
    expect(r.jornadas.map(x=>x.generalVersionId)).toEqual(['2','3'])
  })
  it('no extrapola jornadas anteriores ni inventa fallback sin evidencia',()=>{
    const r=resumirRepartoHistorico(trabajadorId,d1,d2,[j(d1,f(1)),j(d2,f(1))],[v(1,d2,plan('330'))],{fuentes:[f(2)],revisiones:[]})
    expect(r.totalCandidato).toBeNull()
    expect(r.bloqueos).toEqual([{dia:d1,estado:'SIN_EVIDENCIA'}])
    expect(valorarJornadaReparto(trabajadorId,j(d1,f(1)),[v(1,d1,plan('0','0'))]).estado).toBe('SIN_EVIDENCIA')
  })
  it('distingue ausencia observada de configuración general (fallback 200) de una versión dañada',()=>{
    const t=v(1,d1,plan('0','0','0'))
    const a=valorarJornadaReparto(trabajadorId,j(d1,f(3)),[t,v(2,d1,{version:1,valor:null},true)])
    expect(a.calculo?.total).toBe(600)
    for(const valor of ['200basura','Infinity','3.333','']) {
      expect(valorarJornadaReparto(trabajadorId,j(d1,f(3)),[t,v(2,d1,{version:1,valor},true)]).estado).toBe('NO_INTERPRETABLE')
    }
  })
  it('usa elegibilidad histórica y no la modalidad actual; dinero en centavos',()=>{
    const r=resumirRepartoHistorico(trabajadorId,d1,d2,[j(d1,f(3)),j(d2,f(3))],[v(1,d1,plan('0.10')),v(2,d2,plan('330','330','330',false,'FIJO'))],{fuentes:[f(6)],revisiones:[]})
    expect(r.totalCandidato).toBe(.3)
    expect(r.jornadas.map(x=>x.estado)).toEqual(['CANDIDATA','NO_ELEGIBLE'])
  })
  it('no publica un total parcial ante conciliaciones o discrepancias de fuente aunque la suma de unidades coincida',()=>{
    const versiones=[v(1,d1,plan('300'))]
    const a=resumirRepartoHistorico(trabajadorId,d1,d1,[j(d1,f(10))],versiones,{fuentes:[f(10,0,0,'otro')],revisiones:[]})
    expect(a).toMatchObject({totalCandidato:null,fuentesCuadran:false,liquidable:false})
    const b=resumirRepartoHistorico(trabajadorId,d1,d1,[{...j(d1,f(10)),revisiones:[{embarqueId:'e',motivo:'Parcial sin evidencia'}]}],versiones,{fuentes:[f(10)],revisiones:[]})
    expect(b).toMatchObject({totalCandidato:null,conciliable:false})
  })
  it('rechaza huecos, duplicados y períodos inválidos o sin límite',()=>{
    expect(()=>resumirRepartoHistorico(trabajadorId,d1,d2,[j(d1),j(d1)],[],{fuentes:[],revisiones:[]})).toThrow()
    expect(()=>resumirRepartoHistorico(trabajadorId,'2026-02-30',d2,[],[],{fuentes:[],revisiones:[]})).toThrow()
    expect(()=>resumirRepartoHistorico(trabajadorId,'2026-01-01','2026-02-01',[],[],{fuentes:[],revisiones:[]})).toThrow()
  })
})
