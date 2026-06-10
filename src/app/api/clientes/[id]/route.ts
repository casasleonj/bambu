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

    // FIX F-N20 (hallazgo 26): optimistic locking con updatedAt.
    // Antes: prisma.cliente.update directo SIN tx ni check de
    // updatedAt. Dos PUT/PATCH casi simultáneos del mismo cliente
    // (admin edita teléfono, asistente edita barrio) causaban
    // last-write-wins silencioso: el segundo pisa al primero
    // sin warning, posibles pérdidas de datos en campos no tocados
    // por el request que ganó.
    //
    // Ahora: leer updatedAt, updateMany con condición atómica.
    // Si count=0, devolver 409 con mensaje específico.
    const existing = await prisma.cliente.findUnique({
      where: { id, activo: true },
      select: { updatedAt: true },
    })
    if (!existing) return apiError('Not found', 404)

    // Transacción: dual-write contactos + updateMany cliente
    const updateResult = await prisma.$transaction(async (tx) => {
      if (data.contactos !== undefined) {
        const cleaned = data.contactos.filter((c: { nombre?: string; telefono?: string }) =>
          c.nombre?.trim() && c.telefono?.trim()
        )
        const seen = new Set<string>()
        const deduped = cleaned.filter((c: { telefono: string }) => {
          if (seen.has(c.telefono)) return false
          seen.add(c.telefono)
          return true
        })
        const telefonos = deduped.map((c: { telefono: string }) => c.telefono)

        // Borrar los contactos que ya no están
        await tx.contactoCliente.deleteMany({
          where: { clienteId: id, telefono: { notIn: telefonos } },
        })

        // Upsert cada contacto nuevo/existente
        for (const c of deduped) {
          await tx.contactoCliente.upsert({
            where: { clienteId_telefono: { clienteId: id, telefono: c.telefono } },
            create: {
              clienteId: id,
              nombre: c.nombre,
              telefono: c.telefono,
              relacion: c.relacion ?? null,
            },
            update: {
              nombre: c.nombre,
              relacion: c.relacion ?? null,
            },
          })
        }

        // Si el teléfono principal cambió, borrar el contacto con ese teléfono
        if (data.telefono) {
          await tx.contactoCliente.deleteMany({
            where: { clienteId: id, telefono: data.telefono },
          })
        }

        // Quitar `contactos` del payload que va a `cliente.updateMany`
        // (la columna legacy aún existe en Fase 2, pero ya no la tocamos desde la app)
        delete data.contactos
      }

      return tx.cliente.updateMany({
        where: { id, activo: true, updatedAt: existing.updatedAt },
        data,
      })
    })

    if (updateResult.count === 0) {
      return apiError(
        'El cliente fue modificado por otro usuario. Recarga y vuelve a intentar.',
        409,
      )
    }

    // Re-leer para devolver el estado final
    const cliente = await prisma.cliente.findUnique({ where: { id } })
    if (!cliente) return apiError('Not found', 404)

    logAudit({
      entidad: 'Cliente',
      registroId: cliente.id,
      accion: 'UPDATE',
      datos: { nombre: cliente.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ cliente })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return apiError('Not found', 404)
    }
    return apiError('Error updating', 500)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const { verificado, bloqueado } = body

    if (verificado === undefined && bloqueado === undefined) {
      return apiError('Debe enviar verificado o bloqueado', 400)
    }

    const updateData: Record<string, unknown> = {}
    if (verificado !== undefined) {
      updateData.verificado = verificado
      if (verificado === true) {
        updateData.verificadoEn = new Date()
      }
    }
    if (bloqueado !== undefined) {
      updateData.bloqueado = bloqueado
    }

    const cliente = await prisma.cliente.update({
      where: { id, activo: true },
      data: updateData,
    })

    logAudit({
      entidad: 'Cliente',
      registroId: cliente.id,
      accion: 'UPDATE',
      datos: { verificado: cliente.verificado, bloqueado: cliente.bloqueado },
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
