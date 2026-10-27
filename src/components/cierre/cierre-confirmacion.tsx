'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

export interface ResumenConfirmacionCierre {
  fecha: string; ventas: number; cobros: number; base: number; gastos: number;
  comisiones: number; salarios: number; neto: number;
}

export function CierreConfirmacion({ resumen, onResolver }: {
  resumen: ResumenConfirmacionCierre; onResolver: (confirmado: boolean) => void;
}) {
  const [revisado, setRevisado] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    return () => { opener?.focus() }
  }, [])
  const fecha = new Date(`${resumen.fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' })
  return (
    <Modal open onClose={() => onResolver(false)} title="Confirmar cierre del día" className="bg-white rounded-2xl p-6 w-full max-w-[470px] max-h-[90vh] overflow-y-auto mx-auto mt-10 md:mt-0 shadow-2xl">
      <div ref={bodyRef} onKeyDown={event => {
        if (event.key !== 'Tab') return
        const elements = bodyRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
        if (!elements?.length) return
        event.stopPropagation()
        if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1].focus() }
        else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0].focus() }
      }}>
        <h2 className="text-xl font-bold text-slate-800">Confirmar cierre del día</h2>
        <p className="mt-1 text-sm text-slate-500">{fecha}</p>
        <dl className="mt-5 divide-y divide-slate-100 text-sm">
          {[
            ['Ventas netas', resumen.ventas], ['Cobros de la fecha', resumen.cobros], ['Base del día', resumen.base],
            ['Gastos y comisiones pagadas', -resumen.gastos - resumen.comisiones - resumen.salarios],
            ['Neto de movimientos', resumen.neto],
          ].map(([label, value]) => <div key={label} className={`flex justify-between gap-4 py-3 ${label === 'Neto de movimientos' ? 'font-bold text-blue-900' : ''}`}>
            <dt className="text-slate-500">{label}</dt><dd className="font-semibold tabular-nums whitespace-nowrap">{formatCurrency(Number(value))}</dd>
          </div>)}
        </dl>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">El neto incluye pagos digitales y es distinto del conteo de billetes y monedas. El cierre se registra una sola vez.</p>
        <label className="mt-5 flex items-start gap-3 text-sm leading-relaxed text-slate-600">
          <input type="checkbox" checked={revisado} onChange={e => setRevisado(e.target.checked)} className="mt-1 accent-blue-600" />
          Revisé la fecha, los importes y el conteo físico registrado.
        </label>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4">
          <Button variant="outline" onClick={() => onResolver(false)}>Volver a revisar</Button>
          <Button disabled={!revisado} onClick={() => { if (revisado) onResolver(true) }}>Confirmar cierre</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Congela el resumen revisado: un poll no cambia los valores del diálogo abierto. */
export function useConfirmacionCierre() {
  const [pending, setPending] = useState<{ resumen: ResumenConfirmacionCierre; resolve: (value: boolean) => void } | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)
  const confirm = useCallback((resumen: ResumenConfirmacionCierre) => new Promise<boolean>(resolve => {
    resolverRef.current = resolve
    setPending({ resumen, resolve })
  }), [])
  useEffect(() => () => { resolverRef.current?.(false); resolverRef.current = null }, [])
  const resolver = (value: boolean) => { pending?.resolve(value); resolverRef.current = null; setPending(null) }
  return { confirm, modal: pending ? <CierreConfirmacion resumen={pending.resumen} onResolver={resolver} /> : null }
}
