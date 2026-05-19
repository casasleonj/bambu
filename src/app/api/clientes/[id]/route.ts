import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ClienteUpdateSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id, activo: true },
      include: {
        pedidos: {
          orderBy: { fecha: 'desc' },
          take: 20,
          include: { items: true },
        },
        facturas: { orderBy: { fecha: 'desc' }, take: 20 },
        _count: { select: { pedidos: true } },
        plantillaRecurrente: true,
      },
    })
    if (!cliente) return apiError('Not found', 404)

    // Calculate consumption pattern from last 10 delivered orders
    const pedidosEntregados = cliente.pedidos.filter(p => p.estado === 'ENTREGADO' || p.estadoEntrega === 'ENTREGADO').slice(0, 10)
    let frecuenciaSugerida: { dias: number; label: string } | null = null
    let productosSugeridos: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }> = []

    if (pedidosEntregados.length >= 2) {
      // Calculate average days between orders
      const fechas = pedidosEntregados.map(p => new Date(p.fecha).getTime()).sort((a, b) => a - b)
      let totalDias = 0
      let count = 0
      for (let i = 1; i < fechas.length; i++) {
        const diff = (fechas[i] - fechas[i - 1]) / (1000 * 60 * 60 * 24)
        if (diff > 0 && diff < 90) { // ignore gaps > 90 days
          totalDias += diff
          count++
        }
      }
      if (count > 0) {
        const avgDias = Math.round(totalDias / count)
        frecuenciaSugerida = {
          dias: avgDias,
          label: avgDias === 1 ? 'Diario' : `Cada ${avgDias} días`,
        }
      }

      // Calculate product frequency and average quantity
      const productStats: Record<string, { count: number; totalQty: number }> = {}
      const productNames: Record<string, string> = {
        cPacaAguaPed: 'Paca de Agua',
        cPacaHieloPed: 'Paca de Hielo',
        cBotellonFabPed: 'Botellón Fábrica',
        cBotellonDomPed: 'Botellón Domicilio',
        cBolsaAguaPed: 'Bolsa Agua',
        cBolsaHieloPed: 'Bolsa Hielo',
      }

      for (const p of pedidosEntregados) {
        for (const [key, _name] of Object.entries(productNames)) {
          const qty = (p as unknown as Record<string, number>)[key] || 0
          if (qty > 0) {
            if (!productStats[key]) productStats[key] = { count: 0, totalQty: 0 }
            productStats[key].count++
            productStats[key].totalQty += qty
          }
        }
      }

      productosSugeridos = Object.entries(productStats)
        .map(([key, stats]) => ({
          codigo: key,
          nombre: productNames[key],
          frecuencia: Math.round((stats.count / pedidosEntregados.length) * 100),
          cantidadPromedio: Math.round(stats.totalQty / stats.count),
        }))
        .filter(p => p.frecuencia >= 30) // only show products bought in >= 30% of orders
        .sort((a, b) => b.frecuencia - a.frecuencia)
    }

    const serialized = JSON.parse(JSON.stringify(cliente))
    serialized.clienteId = serialized.id
    serialized.frecuenciaSugerida = frecuenciaSugerida
    serialized.productosSugeridos = productosSugeridos

    return apiSuccess({ cliente: serialized })
  } catch (error) {
    return apiError('Error', 500)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = ClienteUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const data = parsed.data

    if (data.contactos) {
      const cleaned = data.contactos.filter((c: { nombre?: string; telefono?: string }) => c.nombre?.trim() && c.telefono?.trim())
      const seen = new Set<string>()
      data.contactos = cleaned.filter((c: { telefono: string }) => {
        if (seen.has(c.telefono)) return false
        seen.add(c.telefono)
        return true
      })
      if (data.telefono) {
        data.contactos = data.contactos.filter((c: { telefono: string }) => c.telefono !== data.telefono)
      }
    }

    const cliente = await prisma.cliente.update({
      where: { id, activo: true },
      data,
    })

    logAudit({
      entidad: 'Cliente',
      registroId: cliente.id,
      accion: 'UPDATE',
      datos: { nombre: cliente.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ cliente })
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return apiError('Not found', 404)
    }
    return apiError('Error updating', 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const cliente = await prisma.cliente.update({
      where: { id, activo: true },
      data: { activo: false },
    })

    if (!cliente) return apiError('Not found', 404)

    logAudit({
      entidad: 'Cliente',
      registroId: id,
      accion: 'DELETE',
      datos: { activo: false },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({})
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return apiError('Not found', 404)
    }
    return apiError('Error deleting', 500)
  }
}
