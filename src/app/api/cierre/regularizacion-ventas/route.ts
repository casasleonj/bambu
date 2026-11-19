import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { startOfDayInBogota, dayInBogota } from '@/lib/date-helpers'
import { Prisma } from '@prisma/client'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { logAudit } from '@/lib/audit'
import { huellaConciliacion } from '@/lib/cierre-conciliacion-ventas'
import { claveRegularizacion, ENTIDAD_REGULARIZACION, leerRegularizaciones, listarProvisionales,
  leerSnapshotProvisional, SolicitudRegularizacion, proyectarRegularizacion, pedidosConReversaRegistrada } from '@/lib/cierre-ventas-provisional'
class Conflicto extends Error {}
export async function GET() {
  const sesion = await requireAuth()
  if (sesion instanceof Response) return sesion
  const auth = await requireRole(['ADMIN','ASISTENTE','CONTADOR'], sesion)
  if (auth instanceof Response) return auth
  try {
    return apiSuccess({ pendientes: await prisma.$transaction(tx => listarProvisionales(tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 }) })
  } catch { return apiError('No se pudo verificar la lista de ventas provisionales.', 500) }
}
export async function POST(request: NextRequest) {
  const sesion = await requireAuth()
  if (sesion instanceof Response) return sesion
  const auth = await requireRole('ADMIN', sesion)
  if (auth instanceof Response) return auth
  if (!auth.user?.id) return apiError('No autorizado',401)
  const actor = auth.user.id
  const p = SolicitudRegularizacion.safeParse(await request.json().catch(() => null))
  if (!p.success) return apiError('Confirma el importe y la evidencia documental.',400)
  const d = p.data
  const inicio = startOfDayInBogota(d.fecha)
  if (!Number.isFinite(+inicio) || dayInBogota(inicio) !== d.fecha) return apiError('Fecha inválida',400)
  try {
    const revision = await executeSerializableWithRetry(async tx => {
      await acquireAdvisoryLockTx(tx,'CIERRE',inicio.toISOString())
      const c = await tx.cierreDia.findUnique({ where: { fecha: inicio } })
      const s = c && leerSnapshotProvisional(c.reporte)
      if (!c || !s || s.huella !== d.huella) throw new Conflicto('El cierre provisional no coincide. Actualiza la consulta.')
      const previo = (await leerRegularizaciones(tx,[c])).get(c.id)!
      const caso = previo.casos.find(p => p.id === d.casoId)
      if (!caso || (caso.revision?.id ?? null) !== d.revisionEsperada) throw new Conflicto('La revisión cambió. Actualiza la consulta.')
      if (d.operacion === 'REVOCAR' ? caso.revision?.operacion !== 'RESOLVER' : caso.revision?.operacion === 'RESOLVER')
        throw new Conflicto('Retira la decisión anterior antes de sustituirla.')
      await acquireAdvisoryLockTx(tx, 'CIERRE', `regularizacion-venta:${caso.pedidoId}`)
      const mismoPedido = previo.casos.filter(p => p.id !== caso.id && p.pedidoId === caso.pedidoId &&
        p.revision?.operacion === 'RESOLVER')
      if (d.operacion === 'REVOCAR' && (caso.revision?.centavos ?? 0) > 0) {
        const dependientes = await pedidosConReversaRegistrada(tx, inicio, [caso.pedidoId], 'CERO_DEPENDIENTE')
        if (dependientes.has(caso.pedidoId) || mismoPedido.some(p => p.revision?.fundamentoCero === 'YA_AJUSTADA'))
          throw new Conflicto('Otro caso depende de este descuento. Retira primero las regularizaciones a cero por ajuste ya registrado.')
      }
      if (d.operacion === 'RESOLVER' && (d.centavos > 0 || d.fundamentoCero === 'YA_AJUSTADA')) {
        // Un pedido terminal no puede generar dos descuentos positivos.
        const otra = await pedidosConReversaRegistrada(tx, inicio, [caso.pedidoId])
        const misma = previo.casos.some(p => p.id !== caso.id && p.pedidoId === caso.pedidoId &&
          p.revision?.operacion === 'RESOLVER' && p.revision.centavos > 0)
        const original = (c.reporte as { ajustesVentasDetalle?: { pedidoId: string; centavos: number }[] } | null)
          ?.ajustesVentasDetalle?.some(a => a.pedidoId === caso.pedidoId && a.centavos > 0)
        const registrado = otra.has(caso.pedidoId) || misma || original
        if (d.centavos > 0 && registrado)
          throw new Conflicto('Ya hay un ajuste de venta registrado para este pedido. Verifica el cierre anterior; no lo descontamos dos veces.')
        if (d.fundamentoCero === 'YA_AJUSTADA' && !registrado)
          throw new Conflicto('No hay un descuento verificado en otro caso de este pedido. Revisa el fundamento de cero.')
      }
      const registroId = claveRegularizacion(c.id, caso.id)
      const version = (caso.revision?.version ?? 0)+1
      const id = huellaConciliacion([registroId,version])
      const datos = { version, huella:d.huella, casoId:caso.id, operacion:d.operacion, centavos:d.centavos, referencia:d.referencia, ...(d.fundamentoCero ? { fundamentoCero:d.fundamentoCero } : {}) }
      // Validar el resultado antes de persistir; el importe es el ajuste omitido
      // en el snapshot, no el valor total de la venta ni el de una nota.
      const revisiones = new Map(previo.casos.flatMap(p => p.revision ? [[p.id,p.revision] as const] : []))
      revisiones.set(caso.id,{ ...datos,id,actor,fecha:new Date().toISOString() })
      try { proyectarRegularizacion(s,revisiones) } catch { throw new Conflicto('Importe fuera del rango contable.') }
      await logAudit({ id, entidad:ENTIDAD_REGULARIZACION, registroId, accion:'CREATE', datos, usuarioId:actor },tx)
      return id
    },'cierre/regularizacion-ventas')
    return apiSuccess({ revision },201)
  } catch(e) {
    if(e instanceof Conflicto) return apiError(e.message,409)
    console.error('[cierre/regularizacion-ventas]',e)
    return apiError('No se pudo registrar la regularización.',500)
  }
}
