import { MoneyDisplay } from '@/components/money-display'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { ResponsableFiado } from '@/lib/fiados-actores'
import { iniciales, totalesEntregados } from './fiados-actores-vista'
import type { Pedido } from './types'

const fechaHora = (iso: string, soloDia = false) => {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit' })
  return soloDia ? `${dia} · hora sin verificar`
    : `${dia} · ${d.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' })}`
}
const COLORES = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-violet-600', 'bg-slate-500']
const color = (id: string) => COLORES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORES.length]

function Persona({ r }: { r: ResponsableFiado }) {
  return <span className="inline-flex items-center gap-1.5 font-semibold">
    <span aria-hidden className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${color(r.id)}`}>{iniciales(r.nombre)}</span>{r.nombre}</span>
}
function Evento({ icono, titulo, desconocido, children, extra, hora }: {
  icono: string; titulo: string; desconocido?: boolean; children: React.ReactNode; extra?: React.ReactNode; hora?: string
}) {
  return <li className="relative flex gap-3 py-2">
    <span aria-hidden className="z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full border-4 border-gray-50 bg-white text-base">{icono}</span>
    <div className={`flex-1 rounded-xl border px-3 py-2 ${desconocido ? 'border-dashed bg-gray-50' : 'bg-white'}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{titulo}</p>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-sm">{children}{hora && <span className="text-xs text-gray-500">{hora}</span>}</div>
      {extra && <p className="mt-0.5 text-xs text-gray-500">{extra}</p>}
    </div></li>
}
const SIN_REGISTRO = <b className="font-medium text-gray-500">Sin registro</b>

/** #614: entregado por producto + quién creó, entregó y recibió cada pago. Solo hechos acreditados. */
export function FiadosActoresDetalle({ p, userRole }: { p: Pedido; userRole?: string }) {
  const a = p.actores
  if (!a) return <p role="status" className="mt-2 rounded-lg border border-dashed p-2 text-xs text-gray-500" data-testid={`fiado-actores-sin-datos-${p.id}`}>
    {p.actoresError ? 'No se pudo cargar quién entregó y cobró.' : 'Sin datos de responsables para este pedido.'}</p>
  const t = totalesEntregados(a)
  const compartido = a.responsablesEntrega.length > 1
  return <div className="mt-3" data-testid={`fiado-actores-${p.id}`}>
    {compartido && <p className="mb-2 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800">
      👥 Entrega compartida · el saldo es del pedido, no de una sola persona.</p>}
    {a.entregas.length > 0 && <>
      <div className="flex flex-wrap gap-2">
        <span className="flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-1.5 text-white">
          <span aria-hidden>📦</span><span><b className="text-lg">{t.total}</b><small className="block text-[11px] leading-none text-gray-300">{t.completo ? 'entregadas en total' : 'con cantidades verificadas'}</small></span></span>
        {t.porProducto.map(l => { const { label, Icon } = getProductoIconConfig(l.producto)
          return <span key={l.producto} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-1.5">
            <Icon size={20} /><span><b className="text-lg">{l.cantidad}</b><small className="block text-[11px] leading-none text-gray-500">{label}</small></span></span> })}
      </div>
      <p className="mt-1 text-xs italic text-gray-500">Cantidad física entregada en el pedido. No indica cuáles unidades siguen sin pagarse.{!t.completo && ' Hay entregas sin cantidades registradas.'}</p></>}
    <ul className="mt-2" aria-label={`Historial del pedido ${p.numero}`}>
      <Evento icono="✍️" titulo="Creó el pedido" desconocido={!a.creadoPor} hora={fechaHora(a.createdAt)}>
        {a.creadoPor ? <span className="font-semibold">{a.creadoPor}</span> : SIN_REGISTRO}</Evento>
      <Evento icono="🔐" titulo="Autorizó el fiado" desconocido extra="El sistema aún no guarda este dato.">{SIN_REGISTRO}</Evento>
      {a.entregas.length === 0 && <Evento icono="🚚" titulo="Entregó" desconocido extra="Entrega registrada sin detalle de fecha ni responsable.">{SIN_REGISTRO}</Evento>}
      {a.entregas.map(e => <Evento key={e.id} icono="🚚" titulo="Entregó" desconocido={!e.responsable} hora={fechaHora(e.fecha, e.soloDia)}
        extra={e.cantidades ? e.cantidades.map(l => `${getProductoIconConfig(l.producto).label} ${l.cantidad}`).join(' · ') : 'Cantidades sin registrar'}>
        {e.responsable ? <Persona r={e.responsable} /> : SIN_REGISTRO}</Evento>)}
      {a.pagos.map(g => <Evento key={g.id} icono="💵" titulo="Recibió un pago" desconocido={!g.recibidoPor} hora={fechaHora(g.fecha)}
        extra={<><b><MoneyDisplay value={g.monto} userRole={userRole} /></b> · {g.metodo.toLowerCase()}{!g.recibidoPor && ' · quién lo recibió: oficina o dato anterior'}</>}>
        {g.recibidoPor ? <Persona r={g.recibidoPor} /> : SIN_REGISTRO}</Evento>)}
    </ul></div>
}
