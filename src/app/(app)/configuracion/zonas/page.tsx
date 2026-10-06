import { prisma } from '@/lib/prisma'
import ZonasClient from './zonas-client'

/**
 * /configuracion/zonas — administración de Zona territorial (F3 del
 * ALS/Plan Técnico Barrio/Zona/Distribución).
 *
 * Alcanzable únicamente desde "Configuración" (tab "Territorio") — NO es
 * una entrada de nav independiente (instrucción explícita del equipo: no
 * debe verse como otro módulo operacional al nivel de Clientes/Pedidos/
 * Distribución). El gateo de acceso lo hace el proxy vía
 * `getRoutePermission('/configuracion/zonas')` -> `view:configuracion`
 * (prefix-match sobre `/configuracion`, sin cambios necesarios en
 * permissions.ts).
 */
export default async function ZonasPage() {
  const zonas = await prisma.zona.findMany({
    where: { activo: true },
    include: { _count: { select: { barrios: true } } },
    orderBy: { nombre: 'asc' },
  })

  return <ZonasClient initialZonas={JSON.parse(JSON.stringify(zonas))} />
}
