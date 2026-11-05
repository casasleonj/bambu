'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { todayStringBogota } from '@/lib/dates'
import { motivoFechaProduccionInvalida } from '@/lib/produccion-fecha'
import { cn } from '@/lib/utils'
import type { CierreData } from './types'

const TURNOS: { valor: string; etiqueta: string }[] = [
  { valor: 'MANANA', etiqueta: 'Mañana' },
  { valor: 'TARDE', etiqueta: 'Tarde' },
  { valor: 'NOCHE', etiqueta: 'Noche' },
  { valor: 'JORNADA', etiqueta: 'Jornada completa' },
]
const etiquetaTurno = (t: string) => TURNOS.find((x) => x.valor === t)?.etiqueta ?? t

interface Sellador { id: string; nombre: string }

interface Props {
  fecha: string
  diaCerrado: boolean
  producciones: NonNullable<CierreData['producciones']>
  /** Stock esperado del día SIN la producción que se va a registrar: inicial + producido − vendido − pérdidas. */
  esperadoPrevio: { agua: number; hielo: number }
  botellonesVendidos: number
  sinProduccion: boolean
  onSinProduccionChange: (v: boolean) => void
  onGuardada: () => void
}

const VACIO = {
  trabajadorId: '', turno: 'MANANA', prodAgua: 0, prodHielo: 0, finAgua: 0, finHielo: 0, botellones: 0,
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
      } catch {
        if (!ctrl.signal.aborted) setError('No se pudo cargar la lista de selladores. Vuelve a intentarlo.')
      }
    })()
    return () => ctrl.abort()
  }, [mostrarForm, selladores.length])

  const set = useCallback(<K extends keyof typeof VACIO>(k: K, v: (typeof VACIO)[K]) => setForm((f) => ({ ...f, [k]: v })), [])
  const num = (v: string) => Math.max(0, Math.trunc(Number(v) || 0))

  const perdidasAgua = form.filtAgua + form.mermaAgua + form.consAgua
  const perdidasHielo = form.filtHielo + form.mermaHielo + form.consHielo
  const esperadoAgua = esperadoPrevio.agua + form.prodAgua - perdidasAgua
  const esperadoHielo = esperadoPrevio.hielo + form.prodHielo - perdidasHielo
  const difAgua = form.finAgua - esperadoAgua
  const difHielo = form.finHielo - esperadoHielo
  const hayDiferencia = difAgua !== 0 || difHielo !== 0
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
          botellonesLlenados: form.botellones, obs: form.obs.trim() || undefined,
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

  const campo = (etiqueta: string, valor: number, onChange: (v: number) => void, id: string, ayuda?: string) => (
    <div>
      <label htmlFor={id} className="text-xs text-muted-foreground">{etiqueta}</label>
      <Input id={id} type="number" min="0" value={valor || ''} onChange={(e) => onChange(num(e.target.value))} className="mt-0.5 h-9" disabled={guardando} />
      {ayuda && <p className="mt-0.5 text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  )

  return (
    <div className="space-y-3" data-testid="produccion-del-cierre">
      {hayProducciones && (
        <div className="rounded-lg border bg-green-50 p-3 text-sm text-green-900" data-testid="producciones-del-dia">
          <p className="font-semibold">Producciones del día</p>
          <ul className="mt-1 space-y-0.5">
            {producciones.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2">
                <span>{p.trabajador} · {etiquetaTurno(p.turno)} · {p.prodAgua} agua, {p.prodHielo} hielo{p.botellonesLlenados > 0 ? `, ${p.botellonesLlenados} botellones` : ''}</span>
                <Link href="/produccion" className="font-semibold underline">Ver y corregir</Link>
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
        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={sinProduccion} onChange={(e) => onSinProduccionChange(e.target.checked)} data-testid="sin-produccion" />
          <span><b>Ese día no se produjo</b> (domingo, festivo o día sin trabajo). Se puede cerrar sin producción: no hay comisión del sellador y el stock inicial pasa igual al día siguiente.</span>
        </label>
      )}

      {!diaCerrado && !motivoFecha && hayProducciones && !abierto && (
        <Button type="button" variant="outline" onClick={() => setAbierto(true)} data-testid="agregar-produccion">+ Agregar otra producción</Button>
      )}

      {mostrarForm && (
        <div className="rounded-lg border bg-white p-4" data-testid="form-produccion-cierre">
          <h5 className="text-sm font-semibold">Registrar producción del {new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</h5>
          <p className="mb-3 text-xs text-muted-foreground">Una cifra por producto. Para contar dos veces o revisar el detalle usa la sección Producción.</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pc-sellador" className="text-xs text-muted-foreground">Sellador *</label>
              <select id="pc-sellador" className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.trabajadorId} onChange={(e) => set('trabajadorId', e.target.value)} disabled={guardando}>
                <option value="">Elige…</option>
                {selladores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pc-turno" className="text-xs text-muted-foreground">Turno *</label>
              <select id="pc-turno" className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.turno} onChange={(e) => set('turno', e.target.value)} disabled={guardando}>
                {TURNOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {campo('Pacas de agua producidas *', form.prodAgua, (v) => set('prodAgua', v), 'pc-prod-agua')}
            {campo('Pacas de hielo producidas *', form.prodHielo, (v) => set('prodHielo', v), 'pc-prod-hielo')}
            {campo('Conteo final agua *', form.finAgua, (v) => set('finAgua', v), 'pc-fin-agua')}
            {campo('Conteo final hielo *', form.finHielo, (v) => set('finHielo', v), 'pc-fin-hielo')}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            {campo('Botellones llenados *', form.botellones, (v) => set('botellones', v), 'pc-botellones', `Vendidos ese día: ${botellonesVendidos} (referencia)`)}
          </div>

          <h5 className="mt-4 text-sm font-semibold">Pérdidas del día <span className="text-xs font-normal text-muted-foreground">(opcionales; si no hubo, déjalas en 0)</span></h5>
          <div className="mt-1 grid grid-cols-3 gap-3">
            {campo('Agua · filtradas', form.filtAgua, (v) => set('filtAgua', v), 'pc-filt-agua')}
            {campo('Agua · merma (rotas)', form.mermaAgua, (v) => set('mermaAgua', v), 'pc-merma-agua')}
            {campo('Agua · consumo interno', form.consAgua, (v) => set('consAgua', v), 'pc-cons-agua')}
            {campo('Hielo · filtradas', form.filtHielo, (v) => set('filtHielo', v), 'pc-filt-hielo')}
            {campo('Hielo · merma (rotas)', form.mermaHielo, (v) => set('mermaHielo', v), 'pc-merma-hielo')}
            {campo('Hielo · consumo interno', form.consHielo, (v) => set('consHielo', v), 'pc-cons-hielo')}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Lo que se pierde o se gasta no es venta ni stock: se descuenta para que el conteo final cuadre.</p>

          {hayDiferencia && (
            <div className="mt-3 space-y-2" data-testid="produccion-diferencia">
              <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">
                {difAgua !== 0 && <>Agua: esperado {esperadoAgua}, contaste {form.finAgua} ({difAgua > 0 ? '+' : ''}{difAgua}). </>}
                {difHielo !== 0 && <>Hielo: esperado {esperadoHielo}, contaste {form.finHielo} ({difHielo > 0 ? '+' : ''}{difHielo}). </>}
                Explica la causa para guardar.
              </p>
              <label htmlFor="pc-obs" className="text-xs text-muted-foreground">Observación (obligatoria con diferencia) *</label>
              <textarea id="pc-obs" rows={2} className={cn('w-full rounded-md border bg-background p-2 text-sm', faltaObs && 'border-red-300')} value={form.obs} onChange={(e) => set('obs', e.target.value)} disabled={guardando} />
            </div>
          )}

          {error && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800" role="alert" data-testid="produccion-error">{error}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={guardar} disabled={falta || faltaObs || guardando} data-testid="guardar-produccion">
              {guardando ? 'Guardando producción…' : 'Guardar producción'}
            </Button>
            {hayProducciones && <Button type="button" variant="outline" onClick={() => { setAbierto(false); setError(null) }} disabled={guardando}>Cancelar</Button>}
            {falta && <span className="text-xs text-muted-foreground">Elige el sellador para guardar.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
