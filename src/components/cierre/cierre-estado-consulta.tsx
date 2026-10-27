'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'

export interface ErrorConsultaCierre {
  message: string; code?: string; cobros?: Array<{ referencia: string; importe: number }>;
}

export function CierreEstadoConsulta({ error, fecha, maxFecha, onFechaChange, onRetry }: {
  error: ErrorConsultaCierre; fecha: string; maxFecha: string;
  onFechaChange: React.ChangeEventHandler<HTMLInputElement>; onRetry: () => void;
}) {
  const [ayuda, setAyuda] = useState(false)
  const pendiente = error.code === 'COBROS_PENDIENTES_CONCILIACION'
  return <div className="p-4 max-w-5xl mx-auto space-y-5">
    <div className="flex flex-wrap justify-between gap-4">
      <h1 className="text-2xl font-bold text-slate-800">Cierre del día</h1>
      <label className="text-sm text-slate-500">Fecha del cierre
        <input type="date" value={fecha} max={maxFecha} onChange={onFechaChange} className="ml-2 rounded-lg border p-2" />
      </label>
    </div>
    <section className="rounded-xl border bg-white p-5 md:p-7">
      <div role="alert">
        <h2 className="text-xl font-bold text-slate-800">{pendiente ? 'Hay cobros pendientes de verificar' : 'No pudimos cargar el cierre'}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{pendiente ? 'Este cierre necesita una revisión antes de confirmarse.' : 'No hay cifras verificadas para esta consulta. Vuelve a cargar los datos antes de continuar.'}</p>
        <p className="mt-2 text-sm text-slate-600">{error.message}</p>
      </div>
      {pendiente && error.cobros && error.cobros.length > 0 && <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="p-2">Referencia</th><th className="p-2">Qué falta</th><th className="p-2 text-right">Importe</th></tr></thead>
          <tbody>{error.cobros.map(c => <tr key={c.referencia} className="border-t border-slate-100"><td className="p-2">{c.referencia}</td><td className="p-2 text-slate-500">Verificar su origen</td><td className="p-2 text-right whitespace-nowrap tabular-nums">{formatCurrency(c.importe)}</td></tr>)}</tbody>
        </table>
      </div>}
      {pendiente && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">No se sumarán ni descartarán estos cobros por su parecido con otros registros. Un administrador debe contrastarlos con la evidencia disponible.</p>}
      <div className="mt-5 flex flex-wrap justify-between gap-3 border-t pt-4">
        {pendiente ? <>
          <Button variant="outline" onClick={() => setAyuda(v => !v)} aria-expanded={ayuda}>Qué revisar</Button>
          <Button disabled>Confirmar cierre</Button>
        </> : <Button onClick={onRetry}>Reintentar</Button>}
      </div>
      {ayuda && <div className="mt-4 text-sm leading-relaxed text-slate-600">Contrasta las referencias con los comprobantes y registros originales. Verifica si cada abono es independiente o refleja un pago ya registrado. Después de conciliarlo, vuelve a consultar esta fecha. No hace falta revisar ni modificar los cierres de otras fechas.</div>}
      {pendiente && <Button variant="link" className="mt-3 px-0" onClick={onRetry}>Volver a consultar</Button>}
    </section>
  </div>
}
