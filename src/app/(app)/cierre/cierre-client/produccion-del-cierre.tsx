'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { Desplegable } from '@/components/ui/desplegable'
import { todayStringBogota } from '@/lib/dates'
import { motivoFechaProduccionInvalida } from '@/lib/produccion-fecha'
import { cn } from '@/lib/utils'
import type { CierreData } from './types'

const TURNOS: { valor: string; etiqueta: string; icono: string }[] = [
  { valor: 'MANANA', etiqueta: 'Mañana', icono: '☀️' },
  { valor: 'TARDE', etiqueta: 'Tarde', icono: '🌤️' },
  { valor: 'NOCHE', etiqueta: 'Noche', icono: '🌙' },
  { valor: 'JORNADA', etiqueta: 'Jornada completa', icono: '🕗' },
]
const etiquetaTurno = (t: string) => TURNOS.find((x) => x.valor === t)?.etiqueta ?? t

interface Sellador { id: string; nombre: string }

interface Props {
  fecha: string
  diaCerrado: boolean
  producciones: NonNullable<CierreData['producciones']>
  /** Stock esperado del día SIN la producción que se va a registrar: inicial + producido − vendido − pérdidas. */
  esperadoPrevio: { agua: number; hielo: number; botellon: number }
  botellonesVendidos: number
  sinProduccion: boolean
  onSinProduccionChange: (v: boolean) => void
  onGuardada: () => void
}

const VACIO = {
  trabajadorId: '', turno: 'MANANA', prodAgua: 0, prodHielo: 0, finAgua: 0, finHielo: 0, botellones: 0, finBotellones: 0,
  filtAgua: 0, mermaAgua: 0, consAgua: 0, filtHielo: 0, mermaHielo: 0, consHielo: 0, obs: '',
}

/**
 * Producción dentro del cierre (#645, 2c-2): lo que se registra aquí es el MISMO registro de la sección Producción.
 * Una cifra por producto (se guarda como conteo A = conteo B); el doble conteo sigue en la sección Producción.
 * La fecha es la del cierre (cierre atrasado): hoy y hasta 7 días atrás, solo días sin cerrar.
 */
export function ProduccionDelCierre({ fecha, diaCerrado, producciones, esperadoPrevio, botellonesVendidos, sinProduccion, onSinProduccionChange, onGuardada }: Props) {
  const [selladores, setSelladores] = useState<Sellador[]>([])
  const [form, setForm] = useState(VACIO)
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorSelladores, setErrorSelladores] = useState(false)
  const [intentosSelladores, setIntentosSelladores] = useState(0)
  // La misma clave en cada reintento del mismo borrador: una falla de red no duplica la producción.
  const claveRef = useRef<string | null>(null)

  const hoy = todayStringBogota()
  const motivoFecha = motivoFechaProduccionInvalida(fecha, hoy)
  const hayProducciones = producciones.length > 0
  const mostrarForm = !diaCerrado && !motivoFecha && !sinProduccion && (!hayProducciones || abierto)

  useEffect(() => {
    if (!mostrarForm || selladores.length > 0) return
    const ctrl = new AbortController()
    void (async () => {
      try {
        const res = await fetch('/api/trabajadores?rol=SELLADOR&activo=true', { signal: ctrl.signal })
        const json = await res.json()
        setSelladores((json.trabajadores ?? []).map((t: { id: string; nombre: string }) => ({ id: t.id, nombre: t.nombre })))
        setErrorSelladores(false)
      } catch {
        if (!ctrl.signal.aborted) setErrorSelladores(true)
      }
    })()
    return () => ctrl.abort()
  }, [mostrarForm, selladores.length, intentosSelladores])

  const set = useCallback(<K extends keyof typeof VACIO>(k: K, v: (typeof VACIO)[K]) => setForm((f) => ({ ...f, [k]: v })), [])
  const num = (v: string) => Math.max(0, Math.trunc(Number(v) || 0))

  const perdidasAgua = form.filtAgua + form.mermaAgua + form.consAgua
  const perdidasHielo = form.filtHielo + form.mermaHielo + form.consHielo
  const esperadoAgua = esperadoPrevio.agua + form.prodAgua - perdidasAgua
  const esperadoHielo = esperadoPrevio.hielo + form.prodHielo - perdidasHielo
  const difAgua = form.finAgua - esperadoAgua
  const difHielo = form.finHielo - esperadoHielo
  // #618: botellones llenos: Inicial + Llenados − Vendidos (sin pérdidas) contra el conteo final
  const esperadoBotellon = esperadoPrevio.botellon + form.botellones
  const difBotellon = form.finBotellones - esperadoBotellon
  const hayDiferencia = difAgua !== 0 || difHielo !== 0 || difBotellon !== 0
  const falta = !form.trabajadorId
  const faltaObs = hayDiferencia && form.obs.trim() === ''

  const guardar = async () => {
    if (falta || faltaObs || guardando) return
    setError(null)
    setGuardando(true)
    claveRef.current ??= crypto.randomUUID()
    try {
      const res = await fetch('/api/produccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trabajadorId: form.trabajadorId, turno: form.turno, fecha, offlineId: claveRef.current,
          botellonesLlenados: form.botellones, stockFinBotellones: form.finBotellones, obs: form.obs.trim() || undefined,
          items: [
            { producto: 'PACA_AGUA', conteoA: form.prodAgua, conteoB: form.prodAgua, stockFinFisico: form.finAgua, filtradas: form.filtAgua, rotas: form.mermaAgua, consumoInterno: form.consAgua },
            { producto: 'PACA_HIELO', conteoA: form.prodHielo, conteoB: form.prodHielo, stockFinFisico: form.finHielo, filtradas: form.filtHielo, rotas: form.mermaHielo, consumoInterno: form.consHielo },
          ],
        }),
      })
      if (res.ok) {
        toast.success('Producción registrada')
        claveRef.current = null
        setForm(VACIO)
        setAbierto(false)
        onGuardada()
      } else {
        const cuerpo = await res.json().catch(() => null)
        setError(cuerpo?.error?.message ?? 'No se pudo registrar la producción')
        if (res.status !== 500) claveRef.current = null
      }
    } catch {
      setError('Sin conexión: no se guardó nada. Vuelve a intentarlo; no se duplicará.')
    } finally {
      setGuardando(false)
    }
  }

  const campo = (etiqueta: string, valor: number, onChange: (v: number) => void, id: string, ayuda?: string, error?: boolean) => (
    <div className="text-[11px] font-semibold text-slate-600">
      <label htmlFor={id}>{etiqueta}</label>
      <Input id={id} type="number" min="0" inputMode="numeric" value={valor || ''} onChange={(e) => onChange(num(e.target.value))}
        className={cn('mt-1 h-11 bg-white text-base font-bold text-slate-900', error && 'border-red-300 bg-red-50')} disabled={guardando} />
      {ayuda && <p className="mt-0.5 text-[11px] font-normal text-slate-500">{ayuda}</p>}
    </div>
  )

  const campoPerdida = (etiqueta: string, valor: number, onChange: (v: number) => void, id: string) => (
    <div className="text-[11px] font-semibold text-slate-600">
      <label htmlFor={id}>{etiqueta}</label>
      <Input id={id} type="number" min="0" inputMode="numeric" value={valor || ''} onChange={(e) => onChange(num(e.target.value))} className="mt-1 h-10 bg-white text-base font-bold text-slate-900" disabled={guardando} />
    </div>
  )

  /** Estado de cada producto: «Falta llenar» mientras no se ha tocado y no hay nada que cuadrar. */
  const estado = (tocado: boolean, dif: number): 'ok' | 'no' | 'espera' => (!tocado ? (dif === 0 ? 'ok' : 'espera') : dif === 0 ? 'ok' : 'no')
  const tocadoAgua = form.prodAgua > 0 || form.finAgua > 0 || perdidasAgua > 0
  const tocadoHielo = form.prodHielo > 0 || form.finHielo > 0 || perdidasHielo > 0
  const tocadoBotellon = form.botellones > 0 || form.finBotellones > 0
  const algunoTocado = tocadoAgua || tocadoHielo || tocadoBotellon
  const mostrarDiferencia = hayDiferencia && (algunoTocado || !falta)
  const perdidasTotal = perdidasAgua + perdidasHielo
  const detallePerdidas = [perdidasAgua > 0 ? 'agua' : '', perdidasHielo > 0 ? 'hielo' : ''].filter(Boolean).join(' y ')

  const tarjeta = ({ clave, icono, titulo, tono, tocado, dif, prodId, prodEtiqueta, prodValor, onProd, finId, finValor, onFin, formula, extra }: {
    clave: string; icono: string; titulo: string; tono: string; tocado: boolean; dif: number
    prodId: string; prodEtiqueta: string; prodValor: number; onProd: (v: number) => void
    finId: string; finValor: number; onFin: (v: number) => void; formula: React.ReactNode; extra?: React.ReactNode
  }) => {
    const e = estado(tocado, dif)
    return (
      <div key={clave} data-testid={`produccion-tarjeta-${clave}`} className={cn('rounded-2xl border p-3', tono)}>
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <span aria-hidden className="text-xl">{icono}</span>{titulo}
          <span data-testid={`produccion-estado-${clave}`} className={cn('ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold',
            e === 'ok' ? 'bg-green-100 text-green-800' : e === 'no' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900')}>
            {e === 'ok' ? 'Cuadra' : e === 'no' ? 'No cuadra' : 'Falta llenar'}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {campo(prodEtiqueta, prodValor, onProd, prodId)}
          {campo('Conteo final *', finValor, onFin, finId, undefined, e === 'no')}
        </div>
        <p className="mt-2 border-t border-dashed border-black/10 pt-2 text-[11px] text-slate-600">
          {formula}{' '}
          {tocado && dif !== 0 && <b className={dif < 0 ? 'text-red-700' : 'text-blue-700'}>· {dif < 0 ? `Faltan ${-dif}` : `Sobran ${dif}`}</b>}
          {tocado && dif === 0 && <b className="text-green-700">· Cuadra ✔</b>}
        </p>
        {extra}
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="produccion-del-cierre">
      {hayProducciones && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900" data-testid="producciones-del-dia">
          <p className="font-semibold">✔ Producciones del día</p>
          <ul className="mt-1">
            {producciones.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 border-b border-green-100 py-1.5 last:border-0">
                <span>{p.trabajador} · {etiquetaTurno(p.turno)} · {p.prodAgua} agua, {p.prodHielo} hielo{p.botellonesLlenados > 0 ? `, ${p.botellonesLlenados} botellones` : ''}</span>
                <Link href={`/produccion?fecha=${encodeURIComponent(fecha)}`} className="font-semibold underline">Ver y corregir</Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Es el mismo registro que ves en la sección Producción.</p>
        </div>
      )}

      {diaCerrado && !hayProducciones && <p className="text-sm text-muted-foreground">Este día está cerrado.</p>}

      {!diaCerrado && motivoFecha && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" data-testid="produccion-fecha-invalida">
          {motivoFecha === 'FECHA_FUTURA'
            ? 'Ese día aún no llega: no se puede registrar producción.'
            : 'Solo se registra producción de hoy y de los 7 días anteriores. Si falta, pide ayuda a un administrador.'}
        </p>
      )}

      {!diaCerrado && !motivoFecha && !hayProducciones && (
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={sinProduccion} onChange={(e) => onSinProduccionChange(e.target.checked)} data-testid="sin-produccion" />
          <span><b>Ese día no se produjo</b> (domingo, festivo o día sin trabajo). Se puede cerrar sin producción: no hay comisión del sellador y el stock inicial pasa igual al día siguiente.</span>
        </label>
      )}

      {!diaCerrado && !motivoFecha && hayProducciones && !abierto && (
        <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setAbierto(true)} data-testid="agregar-produccion">+ Agregar otra producción</Button>
      )}

      {mostrarForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="form-produccion-cierre">
          <h5 className="text-base font-bold text-slate-900">Registrar producción del {new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</h5>
          <p className="mb-3 text-xs text-slate-500">Una cifra por producto. Para contar dos veces o revisar el detalle usa la sección Producción.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
            <div>
              <label htmlFor="pc-sellador" className="text-[11px] font-semibold text-slate-600">Sellador *</label>
              {selladores.length === 0 && !errorSelladores ? (
                <div className="mt-1 h-10 animate-pulse rounded-lg bg-slate-200" aria-label="Cargando selladores" />
              ) : (
                <select id="pc-sellador" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm" value={form.trabajadorId} onChange={(e) => set('trabajadorId', e.target.value)} disabled={guardando}>
                  <option value="">Elige…</option>
                  {selladores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              )}
              {errorSelladores && selladores.length === 0 && (
                <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800" role="alert" data-testid="produccion-error-selladores">
                  No se pudo cargar la lista de selladores. Vuelve a intentarlo.{' '}
                  <button type="button" className="font-semibold underline" onClick={() => { setErrorSelladores(false); setIntentosSelladores((n) => n + 1) }}>Reintentar</button>
                </p>
              )}
            </div>
            <div>
              <span id="pc-turno-etiqueta" className="text-[11px] font-semibold text-slate-600">Turno *</span>
              <div role="radiogroup" aria-labelledby="pc-turno-etiqueta" id="pc-turno" className="mt-1 flex flex-wrap gap-2">
                {TURNOS.map((t) => (
                  <button key={t.valor} type="button" role="radio" aria-checked={form.turno === t.valor} disabled={guardando}
                    onClick={() => set('turno', t.valor)} data-testid={`pc-turno-${t.valor}`}
                    className={cn('inline-flex min-h-[40px] items-center gap-1 rounded-xl border px-3 text-xs font-semibold',
                      form.turno === t.valor ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
                    <span aria-hidden>{t.icono}</span>{t.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {tarjeta({ clave: 'agua', icono: '💧', titulo: 'Agua', tono: 'border-blue-200 bg-blue-50/60', tocado: tocadoAgua, dif: difAgua,
              prodId: 'pc-prod-agua', prodEtiqueta: 'Pacas producidas *', prodValor: form.prodAgua, onProd: (v) => set('prodAgua', v),
              finId: 'pc-fin-agua', finValor: form.finAgua, onFin: (v) => set('finAgua', v),
              formula: <>Sin esta producción <b>{esperadoPrevio.agua}</b> + producido <b>{form.prodAgua || '—'}</b> − pérdidas <b>{perdidasAgua}</b> = debería haber <b>{esperadoAgua}</b></> })}
            {tarjeta({ clave: 'hielo', icono: '❄️', titulo: 'Hielo', tono: 'border-cyan-200 bg-cyan-50/60', tocado: tocadoHielo, dif: difHielo,
              prodId: 'pc-prod-hielo', prodEtiqueta: 'Pacas producidas *', prodValor: form.prodHielo, onProd: (v) => set('prodHielo', v),
              finId: 'pc-fin-hielo', finValor: form.finHielo, onFin: (v) => set('finHielo', v),
              formula: <>Sin esta producción <b>{esperadoPrevio.hielo}</b> + producido <b>{form.prodHielo || '—'}</b> − pérdidas <b>{perdidasHielo}</b> = debería haber <b>{esperadoHielo}</b></> })}
            {tarjeta({ clave: 'botellon', icono: '🫙', titulo: 'Botellones', tono: 'border-teal-200 bg-teal-50/60', tocado: tocadoBotellon, dif: difBotellon,
              prodId: 'pc-botellones', prodEtiqueta: 'Llenados *', prodValor: form.botellones, onProd: (v) => set('botellones', v),
              finId: 'pc-fin-botellones', finValor: form.finBotellones, onFin: (v) => set('finBotellones', v),
              formula: <>Sin esta producción <b>{esperadoPrevio.botellon}</b> + llenados <b>{form.botellones || '—'}</b> = debería haber <b>{esperadoBotellon}</b></>,
              extra: <p className="mt-1 text-[11px] text-slate-500">Vendidos ese día: {botellonesVendidos} (referencia). Conteo final: llenos que quedaron. Sin pérdidas.</p> })}
          </div>
          <p className="mt-1 flex items-center text-[11px] text-slate-500">
            «Debería haber» es lo que tendrías contando lo vendido y las pérdidas.
            <AyudaTermino texto="Lo que había al terminar de vender + lo que produjiste − las pérdidas. Compáralo con tu conteo final." />
          </p>

          <div className="mt-3">
            <Desplegable testid="produccion-perdidas" icono="🗑️" titulo="Pérdidas del día (opcional)" tono="gris"
              ayuda="Lo que se filtra, se rompe o se consume en la fábrica. No es venta ni queda en el stock: se descuenta para que el conteo final cuadre. Si no hubo, déjalas en 0."
              resumen={perdidasTotal > 0 ? `${perdidasTotal} · ${detallePerdidas}` : '0'}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {campoPerdida('💧 Agua · filtradas', form.filtAgua, (v) => set('filtAgua', v), 'pc-filt-agua')}
                {campoPerdida('💧 Agua · merma (rotas)', form.mermaAgua, (v) => set('mermaAgua', v), 'pc-merma-agua')}
                {campoPerdida('💧 Agua · consumo interno', form.consAgua, (v) => set('consAgua', v), 'pc-cons-agua')}
                {campoPerdida('❄️ Hielo · filtradas', form.filtHielo, (v) => set('filtHielo', v), 'pc-filt-hielo')}
                {campoPerdida('❄️ Hielo · merma (rotas)', form.mermaHielo, (v) => set('mermaHielo', v), 'pc-merma-hielo')}
                {campoPerdida('❄️ Hielo · consumo interno', form.consHielo, (v) => set('consHielo', v), 'pc-cons-hielo')}
              </div>
            </Desplegable>
          </div>

          {mostrarDiferencia && (
            <div className="mt-3 space-y-2" data-testid="produccion-diferencia">
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <b>Hay una diferencia.</b>{' '}
                {difAgua !== 0 && <>Agua: esperado {esperadoAgua}, contaste {form.finAgua} ({difAgua > 0 ? '+' : ''}{difAgua}). </>}
                {difHielo !== 0 && <>Hielo: esperado {esperadoHielo}, contaste {form.finHielo} ({difHielo > 0 ? '+' : ''}{difHielo}). </>}
                {difBotellon !== 0 && <>Botellones: esperado {esperadoBotellon}, contaste {form.finBotellones} ({difBotellon > 0 ? '+' : ''}{difBotellon}). </>}
                Cuenta de nuevo o explica la causa para guardar.
              </p>
              <label htmlFor="pc-obs" className="text-[11px] font-semibold text-slate-600">¿Qué pasó? (obligatorio con diferencia) *</label>
              <textarea id="pc-obs" rows={2} placeholder="Ej.: se rompieron 2 bolsas al cargar…" className={cn('w-full rounded-lg border bg-background p-2 text-sm', faltaObs && 'border-red-300 bg-red-50')} value={form.obs} onChange={(e) => set('obs', e.target.value)} disabled={guardando} />
            </div>
          )}

          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="produccion-error">{error}</p>}

          <div className="sticky bottom-[4.5rem] z-10 -mx-4 mt-4 bg-gradient-to-t from-white via-white/95 to-white/0 px-4 pb-1 pt-3 sm:static sm:mx-0 sm:bg-none sm:p-0">
            <div className="flex gap-2">
              {hayProducciones && <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => { setAbierto(false); setError(null) }} disabled={guardando}>Cancelar</Button>}
              <Button type="button" className="min-h-[44px] flex-1 sm:flex-none" onClick={guardar} disabled={falta || faltaObs || guardando} data-testid="guardar-produccion">
                {guardando ? 'Guardando producción…' : 'Guardar producción'}
              </Button>
            </div>
            {(falta || faltaObs) && !guardando && (
              <p className="mt-1 text-center text-xs text-slate-500 sm:text-left" data-testid="produccion-motivo">{falta ? 'Falta elegir el sellador.' : 'Falta explicar la diferencia.'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
