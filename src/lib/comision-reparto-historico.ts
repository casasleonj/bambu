import { endOfDayBogota, parseDateParam, startOfDayBogota } from './dates'
import { leerFuentesComisionRepartidor, type TxComision } from './comision-repartidor'
import { calcularPorFuentes, tarifasRepartidor, type FuenteComision, type RevisionComision, type ComisionRepartidor } from './comision-repartidor-calculo'
import { resolverVersionTarifa, type VersionTarifa } from './comision-tarifa-version'
import type { Prisma } from '@prisma/client'

/** F2B.2A: diagnóstico no liquidable. No sustituye el motor actual ni autoriza pagos. */
export interface JornadaReparto {
  dia: string
  fuentes: FuenteComision[]
  revisiones: RevisionComision[]
}
export type EstadoJornada = 'SIN_ACTIVIDAD' | 'SIN_EVIDENCIA' | 'NO_INTERPRETABLE' | 'POR_CONCILIAR' | 'NO_ELEGIBLE' | 'CANDIDATA'
export interface JornadaValorada extends JornadaReparto {
  estado: EstadoJornada
  trabajadorVersionId: string | null
  generalVersionId: string | null
  calculo: ComisionRepartidor | null
}
const centavos = (n:number) => Math.round(n*100)
function diasDelPeriodo(desde:string,hasta:string):string[] {
  if (!desde || !hasta || parseDateParam(desde,'')!==desde || parseDateParam(hasta,'')!==hasta || desde>hasta) throw Error('Período de diagnóstico inválido')
  const dias:string[]=[]
  const d=new Date(desde+'T00:00:00Z')
  while(d.toISOString().slice(0,10)<=hasta) {
    if(dias.length>=31) throw Error('Diagnóstico limitado a 31 jornadas')
    dias.push(d.toISOString().slice(0,10))
    d.setUTCDate(d.getUTCDate()+1)
  }
  return dias
}

export function valorarJornadaReparto(trabajadorId:string,j:JornadaReparto,versiones:readonly VersionTarifa[]):JornadaValorada {
  const base={...j,trabajadorVersionId:null,generalVersionId:null,calculo:null}
  if(j.revisiones.length) return {...base,estado:'POR_CONCILIAR'}
  if(!j.fuentes.some(f=>Object.values(f.unidades).some(n=>n!==0))) return {...base,estado:'SIN_ACTIVIDAD'}
  if(j.fuentes.some(f=>Object.values(f.unidades).some(n=>!Number.isSafeInteger(n)||n<0))) return {...base,estado:'POR_CONCILIAR'}
  const t=resolverVersionTarifa(versiones,'TRABAJADOR',trabajadorId,j.dia)
  if(t.estado!=='REGISTRADA') return {...base,estado:t.estado,trabajadorVersionId:'versionId' in t?t.versionId??null:null}
  if(!('comRepartAgua' in t.datos)) return {...base,estado:'NO_INTERPRETABLE',trabajadorVersionId:t.versionId}
  const plan=t.datos
  const conTrabajador={...base,trabajadorVersionId:t.versionId}
  if(!plan.usaMoto||!['COMISION','MIXTO'].includes(plan.tipoPago)) return {...conTrabajador,estado:'NO_ELEGIBLE'}
  // Solo la tarifa general de agua/hielo es fallback. Botellón conserva 200
  // según tarifasRepartidor (#500), no se infiere del precio ni del sellador.
  const requiereGeneral=Number(plan.comRepartAgua)===0||Number(plan.comRepartHielo)===0
  const g=resolverVersionTarifa(versiones,'COM_REPARTIDOR',null,j.dia)
  let general:number|undefined
  let generalVersionId:string|null=null
  if(requiereGeneral) {
    if(g.estado!=='REGISTRADA') return {...conTrabajador,estado:g.estado,generalVersionId:'versionId' in g?g.versionId??null:null}
    generalVersionId=g.versionId
    if(!('valor' in g.datos)) return {...conTrabajador,estado:'NO_INTERPRETABLE',generalVersionId}
    const valor=g.datos.valor
    if(valor!==null) {
      // Number y parseFloat difieren con basura/sufijos. No convertir una
      // configuración dañada en una tarifa histórica aparentemente válida.
      if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(valor.trim())||!Number.isFinite(Number(valor))||Math.abs(Number(valor))>99999999.99)
        return {...conTrabajador,estado:'NO_INTERPRETABLE',generalVersionId}
      general=Number(valor)
    }
  }
  const calculo=calcularPorFuentes(j.fuentes,tarifasRepartidor(plan,general))
  if(!Number.isSafeInteger(centavos(calculo.total))) return {...conTrabajador,estado:'POR_CONCILIAR',generalVersionId}
  return {...conTrabajador,estado:'CANDIDATA',generalVersionId,calculo}
}

// Las entregas parciales del mismo pedido pueden aparecer en más de una
// jornada. Conciliar identidad + unidades agregadas, no deduplicar por pedido.
function mapaFuentes(fuentes:readonly FuenteComision[]) {
  const mapa=new Map<string,number[]>()
  for(const f of fuentes) {
    const k=JSON.stringify([f.origen,f.id])
    const u=mapa.get(k)??[0,0,0]
    mapa.set(k,[u[0]+f.unidades.agua,u[1]+f.unidades.hielo,u[2]+f.unidades.botellon])
  }
  return mapa
}

export function resumirRepartoHistorico(trabajadorId:string,desde:string,hasta:string,jornadas:readonly JornadaReparto[],versiones:readonly VersionTarifa[],periodoCanonico:{fuentes:FuenteComision[];revisiones:RevisionComision[]}) {
  const dias=diasDelPeriodo(desde,hasta)
  if(jornadas.length!==dias.length||new Set(jornadas.map(j=>j.dia)).size!==dias.length||dias.some(d=>!jornadas.some(j=>j.dia===d))) throw Error('Cobertura de jornadas incompleta o duplicada')
  const ordenadas=dias.map(d=>valorarJornadaReparto(trabajadorId,jornadas.find(j=>j.dia===d)!,versiones))
  const a=mapaFuentes(ordenadas.flatMap(j=>j.fuentes)),b=mapaFuentes(periodoCanonico.fuentes)
  const fuentesCuadran=a.size===b.size&&[...a].every(([k,u])=>JSON.stringify(u)===JSON.stringify(b.get(k)))
  const totalCentavos=ordenadas.reduce((s,j)=>s+centavos(j.calculo?.total??0),0)
  const bloqueos=ordenadas.filter(j=>!['SIN_ACTIVIDAD','NO_ELEGIBLE','CANDIDATA'].includes(j.estado))
  const conciliable=fuentesCuadran&&periodoCanonico.revisiones.length===0&&bloqueos.length===0&&Number.isSafeInteger(totalCentavos)
  return {modo:'DIAGNOSTICO_NO_LIQUIDABLE' as const, trabajadorId,desde,hasta,jornadas:ordenadas,fuentesCuadran,revisionesPeriodo:periodoCanonico.revisiones,
    totalCandidato:conciliable?totalCentavos/100:null, conciliable, bloqueos:bloqueos.map(j=>({dia:j.dia,estado:j.estado})), liquidable:false as const}
}

type TxDiagnostico=TxComision&Pick<Prisma.TransactionClient,'comisionTarifaVersion'>
/** Solo lectura. El llamador futuro debe usar una transacción RepeatableRead
 * y una ventana limitada; no se invoca desde rutas, Cierre ni nómina. */
export async function diagnosticarRepartoHistorico(tx:TxDiagnostico,trabajadorId:string,desde:string,hasta:string) {
  const dias=diasDelPeriodo(desde,hasta)
  if(!trabajadorId) throw Error('Trabajador requerido')
  const versiones=await tx.comisionTarifaVersion.findMany({where:{fechaVigencia:{lte:new Date(hasta+'T00:00:00Z')},OR:[{ambito:'TRABAJADOR',trabajadorId},{ambito:'COM_REPARTIDOR',trabajadorId:null}]},take:10001,orderBy:[{fechaVigencia:'asc'},{id:'asc'}]})
  if(versiones.length>10000) throw Error('Historial demasiado extenso para este diagnóstico')
  const jornadas:JornadaReparto[]=[]
  for(const dia of dias) {
    const fuentes=await leerFuentesComisionRepartidor(tx,trabajadorId,startOfDayBogota(dia),endOfDayBogota(dia))
    jornadas.push({dia,...fuentes})
  }
  const periodo=await leerFuentesComisionRepartidor(tx,trabajadorId,startOfDayBogota(desde),endOfDayBogota(hasta))
  return resumirRepartoHistorico(trabajadorId,desde,hasta,jornadas,versiones,periodo)
}
