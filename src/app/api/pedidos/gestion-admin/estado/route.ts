// TEMPORAL-SIN-EMBARQUE(#472): ¿está activa la gestión temporal y quiénes pueden
// ser el repartidor? Solo responde con datos al ADMIN; a cualquier otro rol le
// dice «apagada» para que la pantalla no muestre nada.
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { gestionAdminSinEmbarqueActiva } from '@/lib/gestion-admin'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const rol = (authResult as { user?: { role?: string } }).user?.role
  if (rol !== 'ADMIN' || !(await gestionAdminSinEmbarqueActiva())) {
    return apiSuccess({ activa: false, repartidores: [] as Array<{ id: string; nombre: string }> })
  }
  // «Quién puede repartir» = trabajadores activos con moto (mismo criterio que la
  // comisión de la nómina). Ver #474 sobre unificar el criterio con embarques.
  const repartidores = await prisma.trabajador.findMany({
    where: { activo: true, usaMoto: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })
  return apiSuccess({ activa: true, repartidores })
}
