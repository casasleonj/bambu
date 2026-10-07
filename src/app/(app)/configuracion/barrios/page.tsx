import { prisma } from '@/lib/prisma'
import BarriosClient from './barrios-client'

/**
 * /configuracion/barrios — administración del catálogo canónico de Barrio.
 *
 * Gap identificado durante la revisión de Zona F3: el servicio y la API de
 * Barrio existen desde F1 (crear/renombrar/archivar/reactivar — ver
 * src/lib/barrios/barrio-service.ts), pero no había una pantalla de
 * administración; el único punto de creación era al vuelo desde los
 * selectores de Cliente/Negocio (y, hasta este cambio, desde Zona — ver
 * Known Issue correspondiente). Esta página cierra ese hueco: es el
 * destino real de "Configuración → Territorio → Barrios" y del link
 * "Ir al catálogo de barrios" que ofrece el picker de Zona cuando no
 * encuentra un barrio.
 *
 * Gateo de acceso: mismo patrón que /configuracion/zonas — el proxy
 * resuelve `view:configuracion` por prefijo sobre `/configuracion`, sin
 * cambios necesarios en permissions.ts.
 */
export default async function BarriosPage() {
  const barrios = await prisma.barrio.findMany({
    where: { activo: true },
    include: {
      _count: { select: { clientes: true, negocios: true } },
      // F4: listas completas de alias/referencias — ver comentario del
      // componente para la semántica exacta ("también se conoce como" vs
      // "referencias comunes").
      aliases: { select: { id: true, texto: true }, orderBy: { texto: 'asc' } },
      referencias: { select: { id: true, texto: true }, orderBy: { texto: 'asc' } },
    },
    orderBy: { nombre: 'asc' },
  })

  return <BarriosClient initialBarrios={JSON.parse(JSON.stringify(barrios))} />
}
