'use client'

import type { ReactNode } from 'react'
import { AyudaTermino } from '@/components/ui/ayuda-termino'
import { calcularEfectivoEsperado } from '@/lib/cierre-totales'
import { formatCurrency } from '@/lib/utils'

/**
 * #601: «¿Cuánto efectivo debe haber en la caja?». Solo billetes y monedas: lo que llegó por Nequi,
 * transferencia, Daviplata o bono no está en la caja y se informa aparte.
 * #688: el efectivo inicial es la base de caja del día y el cierre solo la LEE: aquí no se escribe. Sin base se muestra «—» y el aviso (`pie`).
 * #646: la respuesta va grande y la cuenta como fichas; «Gastos» abre su lista y «Comisiones» lleva a su bloque.
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

function irA(id: string) {
  return (e: React.MouseEvent) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    if (el instanceof HTMLDetailsElement) el.open = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function Ficha({ texto, valor, tono, destino, ayuda }: {
  texto: string; valor: number; tono?: 'mas' | 'menos'; destino?: string; ayuda?: string
}) {
  const clases = `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
    tono === 'mas' ? 'border-green-200 bg-green-50 text-green-800' : tono === 'menos' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-700'}`
  const contenido = <>{texto} <span className="tabular-nums">{formatCurrency(valor)}</span>{destino ? ' ↓' : ''}</>
  return (
    <span className="inline-flex items-center">
      {destino
        ? <a href={`#${destino}`} onClick={irA(destino)} className={`${clases} hover:underline`}>{contenido}</a>
        : <span className={clases}>{contenido}</span>}
      {ayuda && <AyudaTermino texto={ayuda} />}
    </span>
  )
}

export default function CierreEfectivoEsperado({ baseDia, sinBase, pie, efectivoPagos, cobroCarteraEfectivo, totalGastos, comisiones, salarios, pagosDigitales }: {
  baseDia: number; sinBase?: boolean; pie?: ReactNode; efectivoPagos: number; cobroCarteraEfectivo: number;
  totalGastos: number; comisiones: number; salarios: number; pagosDigitales: number;
}) {
  const debeHaber = efectivoEsperadoDelCierre({ baseDia, efectivoPagos, cobroCarteraEfectivo, totalGastos, comisiones, salarios })
  return (
    <section aria-labelledby="cierre-debe-haber" data-testid="cierre-efectivo-esperado"
      className="rounded-2xl border-2 border-blue-600 bg-gradient-to-br from-blue-50 to-white p-4">
      <h3 id="cierre-debe-haber" className="flex items-center gap-1 text-sm font-semibold text-slate-900">
        ¿Cuánto efectivo debe haber en la caja?
        <AyudaTermino texto="Es solo el dinero en billetes y monedas. No incluye lo que llegó por Nequi, transferencia o Daviplata, ni lo que quedó fiado." />
      </h3>
      <div data-testid="efectivo-debe-haber" className={`my-1 text-4xl font-extrabold tabular-nums ${sinBase ? 'text-slate-400' : 'text-blue-900'}`}>{sinBase ? '—' : formatCurrency(debeHaber)}</div>
      {!sinBase && (
        <div className="flex flex-wrap items-center gap-2">
          <Ficha texto="Empezó con" valor={baseDia} ayuda="Es la base de caja del día: el efectivo que había en la caja al abrir. Si la editan en «Caja base», aquí se actualiza sola." />
          <Ficha texto="+ Cobrado en efectivo" valor={efectivoPagos} tono="mas" ayuda="Ventas de hoy y pagos de deudas anteriores (fiados) que se recibieron en efectivo." />
          {cobroCarteraEfectivo !== 0 && <Ficha texto="+ Abonos en efectivo" valor={cobroCarteraEfectivo} tono="mas" ayuda="Dinero que un cliente pagó a una factura por aparte, en efectivo." />}
          {totalGastos !== 0 && <Ficha texto="− Gastos" valor={totalGastos} tono="menos" destino="cierre-gastos" />}
          {comisiones !== 0 && <Ficha texto="− Comisiones pagadas" valor={comisiones} tono="menos" destino="cierre-comisiones"
            ayuda="Solo lo que ya se le pagó en efectivo a repartidores y selladores. Lo pendiente no resta hasta que se pague." />}
          {salarios > 0 && <Ficha texto="− Salarios" valor={salarios} tono="menos" />}
        </div>
      )}
      {pie}
      {pagosDigitales > 0 && (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600" data-testid="cierre-pagos-digitales">
          Además entraron {formatCurrency(pagosDigitales)} por Nequi, transferencia u otros medios. Ese dinero llegó a la cuenta, no a la caja: no cuenta para el conteo del efectivo.
        </p>
      )}
    </section>
  )
}
