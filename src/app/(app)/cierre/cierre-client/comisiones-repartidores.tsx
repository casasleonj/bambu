'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ComisionRepartidorDetalle } from '@/components/comision-repartidor-detalle'
import type { ComisionRepartidor } from '@/lib/comision-repartidor-calculo'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { todayStringBogota } from '@/lib/dates'
import { ConfirmarPagoComision } from './confirmar-pago-comision'
import type { CierreData } from './types'

type Repartidor = NonNullable<CierreData['comisionesAuto']>['repartidores'][number]

/** #305: con qué se paga una comisión. Solo el efectivo se resta de la caja del día. */
export type MedioComision = 'EFECTIVO' | 'NEQUI' | 'TRANSFERENCIA' | 'DAVIPLATA'
export const MEDIOS_COMISION: { valor: MedioComision; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'NEQUI', etiqueta: 'Nequi' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'DAVIPLATA', etiqueta: 'Daviplata' },
]
const etiquetaMedio = (m: MedioComision) => MEDIOS_COMISION.find((x) => x.valor === m)?.etiqueta ?? m

interface IntentoComision {
  trabajadorId: string
  fecha: string
  fechaPagoReal: string
  montoEsperado: number
  metodo: MedioComision
  concepto: 'PRODUCCION' | 'REPARTO'
  offlineId: string
}

function respuestaPago(valor: unknown): { monto: number; metodo: MedioComision; fechaPagoReal: string | null } | null {
  if (!valor || typeof valor !== 'object' || !('pago' in valor)) return null
  const p = valor.pago
  if (!p || typeof p !== 'object' || !('monto' in p) || typeof p.monto !== 'number' || !Number.isFinite(p.monto) || p.monto <= 0 || !('metodo' in p)
    || !MEDIOS_COMISION.some(m => m.valor === p.metodo) || !('fechaPagoReal' in p)
    || (p.fechaPagoReal !== null && typeof p.fechaPagoReal !== 'string')) return null
  return { monto: p.monto, metodo: p.metodo as MedioComision, fechaPagoReal: p.fechaPagoReal }
}

function respuestaError(valor: unknown): { mensaje: string | null; codigo: string | null } {
  const vacio = { mensaje: null, codigo: null }
  if (!valor || typeof valor !== 'object' || !('error' in valor)) return vacio
  const e = valor.error
  if (!e || typeof e !== 'object') return vacio
  return { mensaje: 'message' in e && typeof e.message === 'string' ? e.message : null,
    codigo: 'code' in e && typeof e.code === 'string' ? e.code : null }
}

/** Quiénes se muestran: los que tienen comisión, algo pagado o algo por conciliar ese día. */
export const visiblesDeComision = (lista: Repartidor[]): Repartidor[] =>
  lista.filter((r) => r.total > 0 || r.pagado > 0 || (r.revisiones?.length ?? 0) > 0)

/**
 * Comisión de cada repartidor en el día (#499). La cifra la calcula el servidor; aquí solo se
 * ve y se confirma el día real del pago. El cierre resta el efectivo atribuido a su día.
 * Lo pendiente al cerrar no bloquea: se paga con la nómina.
 */
export function ComisionesRepartidores({
  fecha,
  repartidores,
  puedePagar,
  diaCerrado,
  onPagado,
  tipo = 'repartidor',
  mostrarAviso = true,
}: {
  fecha: string
  repartidores: Repartidor[]
  puedePagar: boolean
  diaCerrado: boolean
  onPagado: () => void
  /** #645: el sellador se paga con el mismo bloque; cambia solo el texto de la confirmación. */
  tipo?: 'repartidor' | 'sellador'
  /** #646: «Pagos al personal» muestra un solo aviso para todos los bloques; suelto cada bloque muestra el suyo. */
  mostrarAviso?: boolean
}) {
  const [pagando, setPagando] = useState<string | null>(null)
  const [revision, setRevision] = useState<{ r: Repartidor; medio: MedioComision; fechaInicial: string; fechaTrabajo: string; concepto: IntentoComision['concepto']; incierto: boolean } | null>(null)
  const [errorPago, setErrorPago] = useState<string | null>(null)
  const [medios, setMedios] = useState<Record<string, MedioComision>>({})
  const medioDe = (id: string): MedioComision => medios[id] ?? 'EFECTIVO'
  // Un mismo toque reintentado (por una falla de red) reusa la clave y no paga dos veces.
  const claves = useRef(new Map<string, IntentoComision>())
  const conceptoActual: IntentoComision['concepto'] = tipo === 'sellador' ? 'PRODUCCION' : 'REPARTO'
  const llaveDe = (id: string, trabajo = fecha, concepto = conceptoActual) => `${id}|${trabajo}|${concepto}`

  const visibles = visiblesDeComision(repartidores)
  if (visibles.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="comisiones-vacio">Sin comisión de repartidores este día.</p>
  }

  const pagar = (r: Repartidor) => {
    if (r.revisiones?.length) return
    const intento = claves.current.get(llaveDe(r.trabajadorId))
    setErrorPago(null)
    setRevision({ r: intento ? { ...r, pendiente: intento.montoEsperado } : r,
      medio: intento?.metodo ?? medioDe(r.trabajadorId), fechaInicial: intento?.fechaPagoReal ?? todayStringBogota(),
      fechaTrabajo: fecha, concepto: conceptoActual, incierto: !!intento })
  }

  const confirmarPago = async (fechaPagoReal: string) => {
    if (!revision || pagando) return
    const { r, medio, fechaTrabajo, concepto } = revision
    const llave = llaveDe(r.trabajadorId, fechaTrabajo, concepto)
    const intento = claves.current.get(llave) ?? { trabajadorId: r.trabajadorId, fecha: fechaTrabajo, fechaPagoReal,
      offlineId: `cp-${crypto.randomUUID()}`, montoEsperado: r.pendiente, metodo: medio,
      concepto }
    claves.current.set(llave, intento)
    setRevision(actual => actual ? { ...actual, incierto: true } : null)
    setPagando(r.trabajadorId)
    setErrorPago(null)
    try {
      const res = await fetch('/api/nomina/dia/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intento),
      })
      const cuerpo: unknown = await res.json().catch(() => null)
      if (res.ok) {
        const pago = respuestaPago(cuerpo)
        if (!pago || pago.monto !== intento.montoEsperado || pago.metodo !== intento.metodo || pago.fechaPagoReal !== intento.fechaPagoReal) {
          setErrorPago('No pudimos comprobar el resultado. Reintenta el mismo pago para consultarlo sin duplicarlo.')
          return
        }
        claves.current.delete(llave)
        setRevision(null)
        toast.success(`Pago registrado: ${formatCurrency(pago.monto)} a ${r.nombre} por ${etiquetaMedio(pago.metodo)}.`)
        onPagado()
      } else {
        const error = respuestaError(cuerpo)
        setErrorPago(error.mensaje ?? 'No pudimos comprobar el resultado. Reintenta el mismo pago.')
        if (res.status < 500) {
          claves.current.delete(llave)
          setRevision(actual => actual ? { ...actual, incierto: false } : null)
        }
        // Una actualización a «cerrado» desmontaría el formulario y borraría su explicación.
        // Un pendiente cambiado sí necesita refrescar sus cifras, como antes.
        if (error.codigo === 'MONTO_CAMBIO') onPagado()
      }
    } catch {
      setErrorPago('Sin respuesta de la conexión: no sabemos si se guardó. Reintenta el mismo pago; no se vuelve a descontar.')
    } finally {
      setPagando(null)
    }
  }

  const esSellador = tipo === 'sellador'
  return (
    <div className="space-y-2" data-testid={esSellador ? 'comisiones-selladores' : 'comisiones-repartidores'}>
      {visibles.map((r) => {
        const porConciliar = !!r.revisiones?.length
        return (
          <div key={r.trabajadorId} className="rounded-xl border border-slate-200 bg-white p-3" data-testid={`comision-${r.trabajadorId}`}>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${esSellador ? 'bg-violet-100' : 'bg-blue-100'}`}>{esSellador ? '🧴' : '🚚'}</span>
              <div className="min-w-[10rem] flex-1">
                <p className="font-bold text-slate-800">{r.nombre}</p>
                <p className="text-xs text-slate-500">
                  {esSellador ? 'Sellador · comisión por lo producido' : 'Repartidor · comisión por entregas'}
                  {' · '}{porConciliar ? 'subtotal identificado' : 'del día'} {formatCurrency(r.total)}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-1 pl-12 sm:w-auto sm:flex-col sm:items-end sm:pl-0">
                {r.pagado > 0 && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-800" data-testid="comision-pagado">
                    Pagado {formatCurrency(r.pagado)}
                  </span>
                )}
                {r.pendiente > 0 && !porConciliar && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900" data-testid="comision-pendiente">
                    Pendiente {formatCurrency(r.pendiente)}
                  </span>
                )}
                {porConciliar && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">⚠️ Por conciliar</span>}
              </div>
            </div>
            {r.tarifas && r.fuentes && r.revisiones && <ComisionRepartidorDetalle calculo={r as ComisionRepartidor} />}
            {porConciliar && r.pendiente > 0 && (
              <p className="mt-2 text-xs text-red-800" data-testid="comision-pendiente">Pendiente identificado {formatCurrency(r.pendiente)}. Un administrador debe revisar las entregas antes de pagar.</p>
            )}
            {r.pendiente > 0 && puedePagar && !diaCerrado && !porConciliar && (
              <div className="mt-2 space-y-2" data-testid={`pago-comision-${r.trabajadorId}`}>
                <p className="text-sm font-medium text-slate-700" id={`medio-${r.trabajadorId}`}>¿Con qué le pagaste?</p>
                {/* Móvil: opciones a la vista (44 px o más). Escritorio: lista desplegable junto al botón. */}
                <div role="radiogroup" aria-labelledby={`medio-${r.trabajadorId}`} className="grid grid-cols-2 gap-2 sm:hidden">
                  {MEDIOS_COMISION.map((m) => (
                    <button
                      key={m.valor}
                      type="button"
                      role="radio"
                      aria-checked={medioDe(r.trabajadorId) === m.valor}
                      disabled={pagando === r.trabajadorId}
                      onClick={() => setMedios({ ...medios, [r.trabajadorId]: m.valor })}
                      data-testid={`comision-medio-${r.trabajadorId}-${m.valor}`}
                      className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium disabled:opacity-60 ${medioDe(r.trabajadorId) === m.valor ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-white hover:bg-muted/50'}`}
                    >
                      {m.etiqueta}{m.valor === 'EFECTIVO' && <span className="block text-[11px] font-normal text-slate-500">sale de la caja</span>}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Con qué se le paga a ${r.nombre}`}
                    className="hidden h-9 rounded-md border border-input bg-background px-2 text-sm sm:block"
                    value={medioDe(r.trabajadorId)}
                    disabled={pagando === r.trabajadorId}
                    onChange={(e) => setMedios({ ...medios, [r.trabajadorId]: e.target.value as MedioComision })}
                    data-testid={`comision-medio-select-${r.trabajadorId}`}
                  >
                    {MEDIOS_COMISION.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                  </select>
                  <Button size="sm" className="min-h-[44px] bg-green-600 hover:bg-green-700 sm:min-h-0" disabled={pagando === r.trabajadorId} onClick={() => pagar(r)} data-testid={`pagar-comision-${r.trabajadorId}`}>
                    {pagando === r.trabajadorId ? 'Pagando…' : `Pagar ${formatCurrency(r.pendiente)}${medioDe(r.trabajadorId) === 'EFECTIVO' ? '' : ` por ${etiquetaMedio(medioDe(r.trabajadorId))}`}`}
                  </Button>
                  <span className="text-[11px] text-slate-500" data-testid={`comision-aviso-medio-${r.trabajadorId}`}>
                    {medioDe(r.trabajadorId) === 'EFECTIVO' ? 'Confirmarás de qué día salió el efectivo' : 'Solo el efectivo se resta de la caja del día'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {mostrarAviso && visibles.some((r) => r.pendiente > 0 && !r.revisiones?.length) && (
        <p className="text-xs text-amber-800" data-testid="comisiones-aviso-pendiente">
          {avisoPendiente(diaCerrado, puedePagar)}
        </p>
      )}
      {revision && <ConfirmarPagoComision nombre={revision.r.nombre} monto={revision.r.pendiente} fechaTrabajo={revision.fechaTrabajo} porProduccion={revision.concepto === 'PRODUCCION'}
        medio={etiquetaMedio(revision.medio)} fechaInicial={revision.fechaInicial} ocupado={!!pagando}
        incierto={!pagando && revision.incierto} error={errorPago}
        onClose={() => { setRevision(null); if (errorPago) onPagado() }} onConfirmar={confirmarPago} />}
    </div>
  )
}

/** Texto único del aviso de lo pendiente (también lo usa «Pagos al personal»). */
export function avisoPendiente(diaCerrado: boolean, puedePagar: boolean): string {
  return diaCerrado
    ? 'Lo pendiente no salió de la caja de este día: se paga con la nómina.'
    : puedePagar
      ? 'Si cierras con comisión pendiente, ese dinero no sale de la caja de hoy: se paga con la nómina.'
      : 'Un administrador debe pagar lo pendiente. Si cierras así, se paga con la nómina.'
}
