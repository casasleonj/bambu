import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { meetsMinSearchLength } from '@/lib/cliente-search'

const MAX_RESULTADOS = 8

/**
 * Búsqueda de la pantalla de Facturas: clientes que tienen facturas y facturas
 * por número o por nombre de cliente, sobre TODA la base y no sobre la página
 * que la lista tenga cargada.
 */
export async function GET(request: NextRequest) {
  // #556: la lectura también es del ASISTENTE.
  const authResult = await requireRole(['ADMIN', 'CONTADOR', 'ASISTENTE'])
  if (authResult instanceof Response) return authResult

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (!meetsMinSearchLength(q)) {
    return apiSuccess({ clientes: [], facturas: [] })
  }

  try {
    const palabras = q.split(/\s+/).filter(Boolean).slice(0, 5)
    const dePalabra = (palabra: string): Prisma.ClienteWhereInput => ({
      OR: [
        { nombre: { contains: palabra, mode: 'insensitive' } },
        { apellido: { contains: palabra, mode: 'insensitive' } },
        { telefono: { contains: palabra } },
      ],
    })
    const clienteWhere: Prisma.ClienteWhereInput = {
      AND: [...palabras.map(dePalabra), { facturas: { some: {} } }],
    }

    const [clientes, facturas] = await Promise.all([
      prisma.cliente.findMany({
        where: clienteWhere,
        orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
        take: MAX_RESULTADOS,
        select: { id: true, nombre: true, apellido: true, telefono: true, direccion: true },
      }),
      prisma.factura.findMany({
        where: {
          OR: [
            { numero: { contains: q, mode: 'insensitive' } },
            { cliente: { AND: palabras.map(dePalabra) } },
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
      }),
    ])

    return apiSuccess({
      clientes,
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
