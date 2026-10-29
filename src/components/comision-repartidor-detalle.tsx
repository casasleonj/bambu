import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { ComisionRepartidor } from '@/lib/comision-repartidor-calculo'

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
        <ul className="space-y-1">
          {calculo.fuentes.filter(f => Object.values(f.unidades).some(n => n > 0)).map(f => (
            <li key={`${f.origen}-${f.id}`}><Link className="inline-block py-1 text-blue-800 underline" href={f.href}>{f.origen === 'SIN_EMBARQUE' ? 'Ver pedido sin embarque' : 'Ver embarque'}{f.numero !== undefined ? ` #${f.numero}` : ''} · {([['Agua', f.unidades.agua], ['hielo', f.unidades.hielo], ['botellón', f.unidades.botellon]] as const).filter(([, n]) => n > 0).map(([nombre, n]) => `${nombre} ${n}`).join(', ')}</Link>{f.origen === 'EMBARQUE_LEGADO' && <span className="block text-xs text-muted-foreground">Registro histórico por pedido; no dispone de eventos de entrega.</span>}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Las ventas de mostrador no acreditan reparto. Cobrar o calcular la comisión no significa que ya se pagó.</p>
      </div>
    </details>
  )
}
