'use client'

import { DeudaLista } from '@/components/deudas-trabajador/deuda-lista'
import { useDeudasTrabajador } from '@/components/deudas-trabajador/use-deudas'

/**
 * «Mis deudas» (#566): lo que el propio usuario le debe a la empresa. Solo lectura.
 * Sin deuda no se muestra nada (ni título ni mensaje); mientras carga y si falla, sí.
 */
export function MisDeudas({ trabajadorId }: { trabajadorId: string }) {
  const { estado, datos, reintentar } = useDeudasTrabajador(trabajadorId)
  if (estado === 'ok' && (!datos || datos.cantidad === 0)) return null
  return (
    <section className="bg-white rounded-xl shadow overflow-hidden" aria-label="Mis deudas" data-testid="mis-deudas">
      <h2 className="px-4 pt-4 pb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Mis deudas</h2>
      <DeudaLista estado={estado} datos={datos} onReintentar={reintentar} />
    </section>
  )
}
