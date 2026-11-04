'use client'

import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { calcularEfectivoEsperado } from '@/lib/cierre-totales'
import { formatCurrency } from '@/lib/utils'

/**
 * #601: «¿Cuánto efectivo debe haber en la caja?». Solo billetes y monedas: lo que llegó por Nequi,
 * transferencia, Daviplata o bono no está en la caja y se informa aparte.
 */
export function efectivoEsperadoDelCierre(d: {
  baseDia: number; efectivoPagos: number; cobroCarteraEfectivo?: number;
  totalGastos: number; comisiones: number; salarios: number;
}): number {
  return calcularEfectivoEsperado({
    baseDia: d.baseDia, efectivoPagos: d.efectivoPagos, cobroCarteraEfectivo: d.cobroCarteraEfectivo ?? 0,
    totalGastos: d.totalGastos, comisiones: d.comisiones, salariosEfectivo: d.salarios,
  })
}

function Fila({ etiqueta, valor, tono, total, ayuda }: {
  etiqueta: string; valor: number; tono?: 'mas' | 'menos'; total?: boolean; ayuda?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 ${total ? 'border-t-2 border-slate-200 pt-3' : 'border-b border-slate-100'}`}>
      <dt className={total ? 'font-bold text-slate-900' : 'text-slate-600'}>
        {etiqueta}{ayuda && <> <AyudaTermino texto={ayuda} /></>}
      </dt>
      <dd className={`whitespace-nowrap font-semibold tabular-nums ${total ? 'text-2xl font-bold text-slate-900' : tono === 'mas' ? 'text-green-700' : tono === 'menos' ? 'text-red-700' : ''}`}>
        {formatCurrency(valor)}
      </dd>
    </div>
  )
}

export default function CierreEfectivoEsperado({ baseDia, efectivoPagos, cobroCarteraEfectivo, totalGastos, comisiones, salarios, pagosDigitales }: {
  baseDia: number; efectivoPagos: number; cobroCarteraEfectivo: number;
  totalGastos: number; comisiones: number; salarios: number; pagosDigitales: number;
}) {
  const debeHaber = efectivoEsperadoDelCierre({ baseDia, efectivoPagos, cobroCarteraEfectivo, totalGastos, comisiones, salarios })
  return (
    <section aria-labelledby="cierre-debe-haber" data-testid="cierre-efectivo-esperado" className="rounded-xl border-2 border-blue-600 bg-white p-4">
      <h3 id="cierre-debe-haber" className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900">
        ¿Cuánto efectivo debe haber en la caja?
        <AyudaTermino texto="Es solo el dinero en billetes y monedas. No incluye lo que llegó por Nequi, transferencia o Daviplata, ni lo que quedó fiado." />
      </h3>
      <dl className="text-sm">
        <Fila etiqueta="Efectivo con el que empezó el día" valor={baseDia} ayuda="Antes se llamaba «base de caja»: el efectivo que había en la caja al abrir." />
        <Fila etiqueta="+ Efectivo cobrado hoy" valor={efectivoPagos} tono="mas" ayuda="Ventas de hoy y pagos de deudas anteriores (fiados) que se recibieron en efectivo." />
        {cobroCarteraEfectivo !== 0 && (
          <Fila etiqueta="+ Abonos a deudas en efectivo" valor={cobroCarteraEfectivo} tono="mas" />
        )}
        <Fila etiqueta="− Gastos" valor={totalGastos} tono="menos" />
        <Fila etiqueta="− Comisiones pagadas" valor={comisiones} tono="menos" />
        {salarios > 0 && <Fila etiqueta="− Salarios" valor={salarios} tono="menos" />}
        <Fila etiqueta="Efectivo que debe haber en caja" valor={debeHaber} total />
      </dl>
      {pagosDigitales > 0 && (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600" data-testid="cierre-pagos-digitales">
          Además entraron {formatCurrency(pagosDigitales)} por Nequi, transferencia u otros medios. Ese dinero llegó a la cuenta, no a la caja: no cuenta para el conteo del efectivo.
        </p>
      )}
    </section>
  )
}
