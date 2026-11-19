import { NextRequest } from 'next/server'
import { apiError, apiSuccess } from '@/lib/api-response'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { dayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { logAudit } from '@/lib/audit'
import { leerAjustesVentasCierre } from '@/lib/cierre-ajustes-ventas'
import { leerVentasEntregadasDia } from '@/lib/ventas-entregadas'
import {
  claveConciliacion, ConciliacionVentasSolicitud, ENTIDAD_CONCILIACION_VENTAS,
  huellaConciliacion, leerUltimasConciliaciones, lineasCoinciden, MAX_CENTAVOS_CONCILIACION,
} from '@/lib/cierre-conciliacion-ventas'

class ConflictoConciliacion extends Error {}

export async function POST(request: NextRequest) {
  const sesion = await requireAuth()
  if (sesion instanceof Response) return sesion
  const admin = await requireRole('ADMIN', sesion)
  if (admin instanceof Response) return admin
  const actor = sesion.user?.id
  if (!actor) return apiError('No autorizado', 401)
  const parsed = ConciliacionVentasSolicitud.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiError('Conciliación inválida: confirma la evidencia y los importes por día.', 400)
  const d = parsed.data
  const start = startOfDayInBogota(d.fecha)
  if (!Number.isFinite(+start) || dayInBogota(start) !== d.fecha || d.fecha > todayInBogota())
    return apiError('Fecha inválida', 400)
  const end = new Date(+start + 86_400_000)
  try {
    const revision = await executeSerializableWithRetry(async tx => {
      // Mismo lock y transacción que POST /api/cierre; no se modifica un día consolidado.
      await acquireAdvisoryLockTx(tx, 'CIERRE', start.toISOString())
      if (await tx.cierreDia.findUnique({ where: { fecha: start }, select: { id: true } }))
        throw new ConflictoConciliacion('El día ya fue cerrado.')
      const notas = await tx.notaCredito.findMany({ where: { fecha: { gte: start, lt: end } },
        select: { id: true, pedidoId: true, monto: true } })
      const base = await leerAjustesVentasCierre(tx, { start, end }, notas, { ignorarConciliacion: true })
      const caso = base.porConciliar.find(p => p.pedidoId === d.pedidoId)?.conciliacion
      if (!caso || caso.huella !== d.huella || caso.revision !== d.revisionEsperada)
        throw new ConflictoConciliacion('La evidencia cambió. Actualiza el cierre y vuelve a revisarla.')
      const anterior = (await leerUltimasConciliaciones(tx, d.fecha, [d.pedidoId])).get(d.pedidoId)
      if (d.operacion === 'RESOLVER') {
        if (!lineasCoinciden(caso.dias, d.lineas))
          throw new ConflictoConciliacion('Debes documentar el importe reconocido de cada día pendiente.')
        if (anterior?.operacion === 'RESOLVER' && anterior.huella === d.huella)
          throw new ConflictoConciliacion('Ya existe una conciliación. Retírala antes de sustituirla.')
      } else if (d.lineas.length || anterior?.operacion !== 'RESOLVER' || anterior.huella !== d.huella) {
        throw new ConflictoConciliacion('No existe una conciliación vigente para retirar.')
      }
      const registroId = claveConciliacion(d.fecha, d.pedidoId)
      const version = (anterior?.version ?? 0) + 1
      const id = huellaConciliacion([registroId, version])
      await logAudit({ id, entidad: ENTIDAD_CONCILIACION_VENTAS, registroId, accion: 'CREATE',
        datos: { huella: d.huella, version, operacion: d.operacion, lineas: d.lineas }, usuarioId: actor }, tx)
      if (d.operacion === 'RESOLVER') {
        const ajustes = await leerAjustesVentasCierre(tx, { start, end }, notas)
        if (!ajustes.conciliacionesAplicadas.some(a => a.revision === id))
          throw new ConflictoConciliacion('La revisión ya no coincide con la evidencia.')
        const ventas = await leerVentasEntregadasDia(tx, { start, end })
        const neto = Math.round(ventas.total * 100) - ajustes.ajusteCentavos
        if (!Number.isSafeInteger(neto) || Math.abs(neto) > MAX_CENTAVOS_CONCILIACION)
          throw new ConflictoConciliacion('El importe excede el límite contable. Revisa los valores.')
      }
      return id
    }, 'cierre/conciliacion-ventas')
    return apiSuccess({ revision }, 201)
  } catch (e) {
    if (e instanceof ConflictoConciliacion) return apiError(e.message, 409)
    console.error('[cierre/conciliacion-ventas]', e)
    return apiError('No se pudo registrar la conciliación. Actualiza antes de reintentar.', 500)
  }
}
