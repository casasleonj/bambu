import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { meetsMinSearchLength } from '@/lib/cliente-search'
import { buscarDifuso } from '@/lib/busqueda-fuzzy'

const MAX_RESULTADOS = 8

/**
 * Busca sobre todos los clientes que tienen facturas, antes de elegir los
 * primeros ocho. Nunca se limita a los clientes de la página actual.
 * Los números de factura son literales (sin tolerancia a errores de dígitos).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireRole(['ADMIN', 'CONTADOR', 'ASISTENTE'])
  if (authResult instanceof Response) return authResult

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (!meetsMinSearchLength(q)) {
    return apiSuccess({ clientes: [], facturas: [] })
  }

  try {
    // No descartar clientes inactivos con historial de facturas. La selección
    // respeta el mismo permiso de lectura que la búsqueda anterior.
    const universo = await prisma.cliente.findMany({
      where: { facturas: { some: {} } },
      select: {
        id: true, nombre: true, apellido: true, telefono: true, direccion: true,
        negocios: { select: { nombre: true }, where: { activo: true } },
      },
    })
    const coincidencias = buscarDifuso(universo, q, (c) => ({
      textos: [c.nombre, c.apellido, c.direccion, ...c.negocios.map((n) => n.nombre)],
      pesosTexto: [3, 3, 1, ...c.negocios.map(() => 2)],
      telefonos: [c.telefono],
    }), (c) => c.id)

    const numero = q.replace(/^#/, '')
    const facturas = await prisma.factura.findMany({
      where: {
        OR: [
          { numero: { contains: numero, mode: 'insensitive' } },
          { clienteId: { in: coincidencias.map((c) => c.id) } },
        ],
      },
      orderBy: { fecha: 'desc' },
      take: MAX_RESULTADOS,
      select: {
        id: true,
        numero: true,
        fecha: true,
        cliente: { select: { nombre: true, apellido: true } },
      },
    })

    return apiSuccess({
      clientes: coincidencias.slice(0, MAX_RESULTADOS).map((c) => ({
        id: c.id, nombre: c.nombre, apellido: c.apellido,
        telefono: c.telefono, direccion: c.direccion,
      })),
      facturas: facturas.map((f) => ({
        id: f.id,
        numero: f.numero,
        fecha: f.fecha,
        clienteNombre: [f.cliente.nombre, f.cliente.apellido].filter(Boolean).join(' '),
      })),
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error buscando facturas')
    return apiError('Error buscando facturas', 500)
  }
}
