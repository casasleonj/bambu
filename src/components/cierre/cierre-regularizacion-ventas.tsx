'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { RegularizacionVentas } from '@/lib/cierre-ventas-provisional'

const motivos: Record<string,string> = {
  REVERSA_AMBIGUA:'Fecha o evidencia de anulación sin verificar',
  CUMPLIMIENTO_NO_VERIFICADO:'Entregas sin evidencia completa',
  VENTA_PREVIA_SIN_DETALLE_DE_CIERRE:'Cierre anterior sin detalle de la venta',
  NOTA_SIN_REVERSA_IDENTIFICADA:'Nota sin origen comercial identificado',
  REVERSA_YA_REGISTRADA:'Ajuste del pedido registrado en otro cierre',
}

export function ListaVentasProvisionales({ fecha, refreshKey, onElegir }: { fecha:string; refreshKey:number; onElegir:(f:string)=>void }) {
  const [lista,setLista]=useState<{fecha:string;pendientes:number}[]|null>(null)
  const [error,setError]=useState(false)
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    const ctrl = new AbortController()
    setError(false)
    fetch('/api/cierre/regularizacion-ventas',{signal:ctrl.signal,cache:'no-store'})
      .then(async r=>{ if(!r.ok)throw Error(); const j=await r.json(); if(!Array.isArray(j.pendientes))throw Error(); if(!ctrl.signal.aborted)setLista(j.pendientes) })
      .catch(()=>{if(!ctrl.signal.aborted){setLista(null);setError(true)}})
    return ()=>ctrl.abort()
  },[fecha,refreshKey,retry])
  if(error)return <div role="status" className="rounded-lg border p-3 text-sm">No se pudo verificar si hay ventas de otros cierres por regularizar. <Button size="sm" variant="outline" onClick={()=>setRetry(n=>n+1)}>Reintentar</Button></div>
  if(!lista?.length)return null
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm" data-testid="lista-ventas-provisionales">
    <h3 className="font-semibold text-amber-900">Cajas cerradas con ventas pendientes</h3>
    <p className="text-amber-800">La caja de hoy puede cerrarse; administración debe revisar estos días.</p>
    <div className="mt-2 flex flex-wrap gap-2">{lista.map(x=><Button key={x.fecha} variant="outline" size="sm" disabled={x.fecha===fecha} onClick={()=>onElegir(x.fecha)}>{x.fecha} · {x.pendientes} por regularizar</Button>)}</div>
  </section>
}

function CasoRegularizacion({ caso, r, fecha, onCambio }: { caso:RegularizacionVentas['casos'][number]; r:RegularizacionVentas; fecha:string; onCambio:()=>void }) {
  const resuelto=caso.revision?.operacion==='RESOLVER'
  const [monto,setMonto]=useState('')
  const [referencia,setReferencia]=useState('')
  const [confirmado,setConfirmado]=useState(false)
  const [ocupado,setOcupado]=useState(false)
  const [error,setError]=useState('')
  const vivo=useRef(true), enCurso=useRef(false)
  useEffect(()=>{vivo.current=true;return()=>{vivo.current=false}},[])
  const centavos=/^\d{1,8}([.,]\d{1,2})?$/.test(monto.trim())?Math.round(Number(monto.trim().replace(',','.'))*100):-1
  const valido=confirmado&&referencia.trim().length>=15&&(resuelto||centavos>=0)
  async function enviar() {
    if(!valido||enCurso.current)return
    enCurso.current=true;setOcupado(true);setError('')
    try {
      const res=await fetch('/api/cierre/regularizacion-ventas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        fecha,casoId:caso.id,huella:r.huella,revisionEsperada:caso.revision?.id??null,
        operacion:resuelto?'REVOCAR':'RESOLVER',centavos:resuelto?0:centavos,referencia:referencia.trim(),confirmoEvidencia:true,
      })})
      const j=await res.json()
      if(!res.ok)throw Error(j.error?.message??'No se pudo regularizar.')
      if(vivo.current){setConfirmado(false);onCambio()}
    }catch(e){if(vivo.current)setError(e instanceof Error?e.message:'No se pudo regularizar.')}
    finally{enCurso.current=false;if(vivo.current)setOcupado(false)}
  }
  return <details className="mt-2 rounded border bg-white p-3">
    <summary className="cursor-pointer font-semibold">{resuelto?'Retirar regularización':'Regularizar venta'}</summary>
    <div className="mt-3 space-y-3">
      {!resuelto&&<><p>Verifica qué importe de ventas anteriores falta descontar en este cierre. Si no se reconoció una venta previamente o ya se descontó, registra cero solo con evidencia. No uses el valor de la nota crédito ni un valor estimado.</p>
        <label className="block">Ajuste pendiente de restar<input inputMode="decimal" className="mt-1 block min-h-11 w-full rounded border px-2" value={monto} onChange={e=>setMonto(e.target.value)} placeholder="COP"/></label></>}
      <label className="block">{resuelto?'Motivo documentado para retirar':'Referencia documental y explicación'}<textarea rows={3} maxLength={500} className="mt-1 block w-full rounded border p-2" value={referencia} onChange={e=>setReferencia(e.target.value)} placeholder="Reporte, fecha, fila y motivo (sin datos personales)"/></label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmado} onChange={e=>setConfirmado(e.target.checked)}/>{resuelto?'Confirmo que debe volver a quedar pendiente.':'Verifiqué la evidencia y el importe que faltaba ajustar.'}</label>
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      <Button type="button" disabled={!valido||ocupado} onClick={()=>void enviar()}>{ocupado?'Guardando…':resuelto?'Retirar regularización':'Registrar regularización'}</Button>
    </div>
  </details>
}
export function CierreRegularizacionVentas({r,fecha,onCambio}: {r:RegularizacionVentas;fecha:string;onCambio?:()=>void}) {
  return <section className="rounded-xl border border-amber-200 p-4 text-sm" data-testid="regularizacion-ventas">
    <h3 className="font-semibold">{r.pendientes?'Caja registrada · ventas provisionales':'Ventas regularizadas'}</h3>
    <p className="mt-1 text-slate-600">El cierre original no cambia. La regularización de ventas queda registrada aparte; no altera los cobros, el arqueo ni el inventario.</p>
    <dl className="mt-2 space-y-1"><div className="flex justify-between gap-3"><dt>Subtotal guardado</dt><dd>{formatCurrency(r.subtotalOriginal)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Ajustes posteriores</dt><dd>{formatCurrency(-r.ajustePosterior)}</dd></div>
      <div className="flex justify-between gap-3 font-bold"><dt>{r.pendientes?'Subtotal identificado (no definitivo)':'Ventas netas regularizadas'}</dt><dd>{formatCurrency(r.subtotalIdentificado)}</dd></div></dl>
    {r.casos.map(c=><div key={c.id} className="mt-3 border-t pt-3">
      <p>{c.numero==null?'Pedido sin número':`Pedido #${c.numero}`} · {motivos[c.motivo]??c.motivo}</p>
      {c.revision?.operacion==='RESOLVER'?<p className="text-slate-700">Ajuste registrado: {formatCurrency(c.revision.centavos/100)} · {c.revision.referencia} · {c.revision.fecha.slice(0,10)}</p>:<p className="font-semibold text-amber-800">Pendiente de evidencia</p>}
      {onCambio&&<CasoRegularizacion key={c.revision?.id??c.id} caso={c} r={r} fecha={fecha} onCambio={onCambio}/>}
    </div>)}
  </section>
}
