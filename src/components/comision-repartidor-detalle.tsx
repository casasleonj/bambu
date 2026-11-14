import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { ComisionRepartidor, FuenteComision, PedidoComision, UnidadesReparto } from '@/lib/comision-repartidor-calculo'
import { ListaLimitada } from '@/components/ui/desplegable'
import { diaCorto } from '@/lib/dia-corto'

export { diaCorto }
const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const NOMBRES = [['agua', 'agua'], ['hielo', 'hielo'], ['botellon', 'botellón']] as const
const hay = (u: UnidadesReparto) => u.agua > 0 || u.hielo > 0 || u.botellon > 0
const unidadesTexto = (u: UnidadesReparto) => NOMBRES.filter(([k]) => u[k] > 0).map(([k, n]) => `${n} ${u[k]}`).join(', ')
/** Con un solo producto basta el número («5»); con varios se nombran. */
const unidadesChip = (u: UnidadesReparto) => NOMBRES.filter(([k]) => u[k] > 0).length === 1 ? String(u.agua + u.hielo + u.botellon) : unidadesTexto(u)
const progreso = (alDia: UnidadesReparto, pedido: UnidadesReparto) =>
  NOMBRES.filter(([k]) => pedido[k] > 0).map(([k, n]) => `${n} ${alDia[k]} de ${pedido[k]}`).join(' · ')
const cubre = (e: UnidadesReparto, p: UnidadesReparto) => hay(p) && NOMBRES.every(([k]) => e[k] >= p[k])

function EtiquetaPedido({ p }: { p: PedidoComision }) {
  if (p.completoAqui) {
    const dia = p.dias?.filter(d => d.propia).at(-1)?.dia
    return <span className="ml-1.5 rounded-full bg-green-200 px-2 py-0.5 align-middle text-[11px] font-bold text-green-900">{dia && dia !== hoyBogota() ? `Completó el ${diaCorto(dia)}` : 'Completó hoy'}</span>
  }
  const completo = p.detalle === 'POR_DIA' ? !!p.alDia && cubre(p.alDia, p.pedido) : cubre(p.entregadoActual, p.pedido)
  return completo
    ? <span className="ml-1.5 rounded-full bg-green-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-green-800">Completo</span>
    : <span className="ml-1.5 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-extrabold text-amber-900">Parcial</span>
}

function FilaPedido({ p }: { p: PedidoComision }) {
  const ultimoPropio = p.dias?.filter(d => d.propia).at(-1)?.dia
  const pendiente = p.pendiente && hay(p.pendiente) ? p.pendiente : null
  return (
    <div data-testid={`comision-pedido-${p.id}`} className="border-t border-dashed border-slate-300 py-2 first:border-t-0">
      <p className="font-semibold">
        <Link className="text-blue-800 underline" href={p.href}>#{p.numero}</Link> · {p.nombre}
        {p.cliente && <span className="font-normal text-slate-600"> ({p.cliente})</span>}
        <EtiquetaPedido p={p} />
      </p>
      <p className="text-sm">En esta comisión: <b className="text-blue-800">{unidadesTexto(p.unidades)}</b></p>
      {p.detalle === 'POR_DIA' && p.dias && (
        <div data-testid={`comision-dias-${p.id}`} className="mt-1 flex flex-wrap items-center gap-1">
          {p.dias.map((d, i) => d.propia
            ? <span key={i} className="whitespace-nowrap rounded-lg border border-blue-300 bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900">{diaCorto(d.dia)} · {unidadesChip(d.unidades)} ← esta comisión</span>
            : <span key={i} className="whitespace-nowrap rounded-lg border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">{diaCorto(d.dia)} · {unidadesChip(d.unidades)}{ultimoPropio === d.dia ? ' (otra persona)' : ''}</span>)}
          {p.alDia && <span className={`ml-1 text-[11px] font-bold ${p.completoAqui || !pendiente ? 'text-green-800' : 'text-amber-800'}`}>{pendiente ? `Lleva ${progreso(p.alDia, p.pedido)}` : `Total ${progreso(p.alDia, p.pedido)}`}</span>}
        </div>
      )}
      {p.detalle === 'POR_DIA' && pendiente && <p className="mt-0.5 text-xs text-slate-700">Pendiente de entregar: <b>{unidadesTexto(pendiente)}</b></p>}
      {p.completoAqui && p.alDia && (
        <p role="status" className="mt-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">✔ Con esta entrega se completó el pedido ({progreso(p.alDia, p.pedido)}). Lo entregado antes se cuenta en su propio día.</p>
      )}
      {p.completadoDespues && <p className="mt-1 text-xs text-slate-600">Se completó después ({diaCorto(p.completadoDespues)}). No se muestra como completo en este día.</p>}
      {p.detalle === 'HISTORICO' && <p className="mt-0.5 text-xs text-slate-600">Entrega completa registrada{p.entregadoDia ? ` el ${diaCorto(p.entregadoDia)}` : ''}; este registro anterior no trae el detalle por día.</p>}
      {p.detalle === 'SIN_DETALLE' && (
        <p className="mt-0.5 text-xs text-slate-600">Sin detalle por día verificable: no se reparte el acumulado entre días ni personas. Pedido de {unidadesTexto(p.pedido) || '—'} · entregadas hasta ahora: {unidadesTexto(p.entregadoActual) || '0'}.</p>
      )}
      {p.detalle !== 'POR_DIA' && (!ultimoPropio) && <p className="mt-0.5 text-[11px] text-slate-400">Pedido hecho el {diaCorto(p.creadoDia)}</p>}
      {p.detalle === 'POR_DIA' && ultimoPropio && p.creadoDia !== ultimoPropio && <p className="mt-0.5 text-[11px] text-slate-400">Pedido hecho el {diaCorto(p.creadoDia)}</p>}
    </div>
  )
}

function Fuente({ f }: { f: FuenteComision }) {
  const encabezado = (
    <Link className="text-blue-800 underline" href={f.href}>{f.origen === 'SIN_EMBARQUE' ? 'Pedido sin embarque' : 'Embarque'}{f.numero !== undefined ? ` #${f.numero}` : ''}</Link>
  )
  if (!f.pedidos) {
    // Cierres anteriores (y lecturas sin detalle): se conserva el enlace de siempre.
    return (
      <li>
        <Link className="inline-block py-1 text-blue-800 underline" href={f.href}>{f.origen === 'SIN_EMBARQUE' ? 'Ver pedido sin embarque' : 'Ver embarque'}{f.numero !== undefined ? ` #${f.numero}` : ''} · {([['Agua', f.unidades.agua], ['hielo', f.unidades.hielo], ['botellón', f.unidades.botellon]] as const).filter(([, n]) => n > 0).map(([nombre, n]) => `${nombre} ${n}`).join(', ')}</Link>
        {f.origen === 'EMBARQUE_LEGADO' && <span className="block text-xs text-muted-foreground">Registro histórico por pedido; no dispone de eventos de entrega.</span>}
        <span className="block text-xs text-muted-foreground">Este registro es anterior y no trae el detalle por cliente; abre el embarque para verlo.</span>
      </li>
    )
  }
  return (
    <li data-testid={`comision-fuente-${f.id}`} className="rounded-xl border border-blue-100 bg-blue-50/40 p-2">
      <p className="text-sm font-semibold">{encabezado} · en esta comisión: {unidadesTexto(f.unidades)}</p>
      <ListaLimitada items={f.pedidos} render={p => <FilaPedido key={p.id} p={p} />} />
      {f.sinPedido && hay(f.sinPedido) && (
        <p data-testid={`comision-sin-pedido-${f.id}`} className="flex justify-between gap-2 border-t border-dashed border-slate-300 py-2 text-sm text-slate-600"><span>Ventas en ruta (sin pedido)</span><span>{unidadesTexto(f.sinPedido)}</span></p>
      )}
      {f.origen === 'EMBARQUE_LEGADO' && <span className="block text-xs text-muted-foreground">Registro histórico por pedido; no dispone de eventos de entrega.</span>}
    </li>
  )
}

/** Solo presenta el cálculo del servidor. No calcula ni registra un pago. */
export function ComisionRepartidorDetalle({ calculo }: { calculo: ComisionRepartidor }) {
  const filas = [
    ['💧 Agua', calculo.entregasAgua, calculo.tarifas.agua, calculo.comAgua],
    ['🧊 Hielo', calculo.entregasHielo, calculo.tarifas.hielo, calculo.comHielo],
    ['🫙 Botellón', calculo.entregasBotellon, calculo.tarifas.botellon, calculo.comBotellon],
  ] as const
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer rounded py-2 font-medium text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2">Ver entregas y cálculo</summary>
      <div className="mt-2 space-y-2">
        {filas.filter(([, cantidad]) => cantidad > 0).map(([nombre, cantidad, tarifa, monto]) => (
          <p key={nombre} className="flex flex-wrap justify-between gap-x-3"><span>{nombre}: {cantidad} unidades × {formatCurrency(tarifa)}</span><strong>{formatCurrency(monto)}</strong></p>
        ))}
        {calculo.revisiones.length > 0 && (
          <div role="status" className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
            <p className="font-semibold">⚠️ Por conciliar antes de pagar</p>
            {calculo.revisiones.map((r, i) => <p key={`${r.embarqueId}-${i}`}>{r.motivo} {r.embarqueId && <Link className="underline" href={`/embarques/${r.embarqueId}`}>Revisar embarque</Link>}</p>)}
          </div>
        )}
        <ul className="space-y-2">
          {calculo.fuentes.filter(f => hay(f.unidades)).map(f => <Fuente key={`${f.origen}-${f.id}`} f={f} />)}
        </ul>
        <p className="text-xs text-muted-foreground">Las ventas de mostrador no acreditan reparto. Cobrar o calcular la comisión no significa que ya se pagó.</p>
      </div>
    </details>
  )
}
