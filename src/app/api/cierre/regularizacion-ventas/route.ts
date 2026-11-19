import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { startOfDayInBogota, dayInBogota } from '@/lib/date-helpers'
import { Prisma } from '@prisma/client'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { logAudit } from '@/lib/audit'
import { huellaConciliacion } from '@/lib/cierre-conciliacion-ventas'
import { claveRegularizacion, ENTIDAD_REGULARIZACION, leerRegularizaciones, listarProvisionales,
  leerSnapshotProvisional, SolicitudRegularizacion, proyectarRegularizacion } from '@/lib/cierre-ventas-provisional'
class Conflicto extends Error {}
export async function GET() {
  const auth = await requireRole(['ADMIN','ASISTENTE','CONTADOR'])
  if (auth instanceof Response) return auth
  try {
    return apiSuccess({ pendientes: await prisma.$transaction(tx => listarProvisionales(tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 }) })
  } catch { return apiError('No se pudo verificar la lista de ventas provisionales.', 500) }
}
export async function POST(request: NextRequest) {
  const auth = await requireRole('ADMIN')
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
      const registroId = claveRegularizacion(c.id, caso.id)
      const version = (caso.revision?.version ?? 0)+1
      const id = huellaConciliacion([registroId,version])
      const datos = { version, huella:d.huella, casoId:caso.id, operacion:d.operacion, centavos:d.centavos, referencia:d.referencia }
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
