import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { withAdvisoryLock } from '@/lib/locks'
import { ROLES } from '@/lib/constants'

const RecurrenteCreateSchema = z.object({
  clienteId: z.string().min(1),
  tipo: z.enum(['ENVIO', 'PUNTO']).default('ENVIO'),
  canal: z.enum(['PUNTO', 'DOMICILIO']).default('DOMICILIO'),
  frecuencia: z.enum(['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL']),
  productos: z.object({
    pacaAgua: z.coerce.number().int().min(0).optional(),
    pacaHielo: z.coerce.number().int().min(0).optional(),
    botellonFab: z.coerce.number().int().min(0).optional(),
    botellonDom: z.coerce.number().int().min(0).optional(),
    bolsaAgua: z.coerce.number().int().min(0).optional(),
    bolsaHielo: z.coerce.number().int().min(0).optional(),
  }).optional(),
  obs: z.string().max(500).optional(),
})

const RecurrenteUpdateSchema = z.object({
  frecuencia: z.enum(['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL']).optional(),
  productos: z.object({
    pacaAgua: z.coerce.number().int().min(0).optional(),
    pacaHielo: z.coerce.number().int().min(0).optional(),
    botellonFab: z.coerce.number().int().min(0).optional(),
    botellonDom: z.coerce.number().int().min(0).optional(),
    bolsaAgua: z.coerce.number().int().min(0).optional(),
    bolsaHielo: z.coerce.number().int().min(0).optional(),
  }).optional(),
  saltarFechas: z.array(z.string()).optional(),
  obs: z.string().max(500).optional(),
})

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const recurrentes = await prisma.pedido.findMany({
      where: { esRecurrente: true },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        _count: { select: { pedidoHijo: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, recurrentes })
  } catch (error) {
    console.error('Error fetching recurrentes:', error)
    return NextResponse.json({ error: 'Error al cargar recurrentes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = RecurrenteCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { clienteId, tipo, canal, frecuencia, productos, obs } = parsed.data

    // Crear recurrente con número secuencial atómico (comparte secuencia con Pedidos)
    const recurrente = await withAdvisoryLock('PEDIDO', async (tx) => {
      const lastPedido = await tx.pedido.findFirst({ orderBy: { numero: 'desc' } })
      const numero = (lastPedido?.numero || 0) + 1

      return tx.pedido.create({
        data: {
          numero,
          clienteId,
          tipo,
          canal,
          estado: 'PENDIENTE',
          esRecurrente: true,
          frecuencia,
          cPacaAguaPed: productos?.pacaAgua || 0,
          cPacaHieloPed: productos?.pacaHielo || 0,
          cBotellonFabPed: productos?.botellonFab || 0,
          cBotellonDomPed: productos?.botellonDom || 0,
          cBolsaAguaPed: productos?.bolsaAgua || 0,
          cBolsaHieloPed: productos?.bolsaHielo || 0,
          total: 0,
          totalPagado: 0,
          saldo: 0,
          obs,
          createdById: (authResult.user as { id: string }).id,
        },
        include: {
          cliente: { select: { id: true, nombre: true, telefono: true } },
        },
      })
    })

    await logAudit({
      entidad: 'Recurrente',
      registroId: recurrente.id,
      accion: 'CREATE',
      datos: { clienteId, frecuencia },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return NextResponse.json({ success: true, recurrente }, { status: 201 })
  } catch (error) {
    console.error('Error creating recurrente:', error)
    return NextResponse.json({ error: 'Error al crear recurrente' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    const body = await request.json()
    const parsed = RecurrenteUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (parsed.data.frecuencia) data.frecuencia = parsed.data.frecuencia
    if (parsed.data.obs !== undefined) data.obs = parsed.data.obs
    if (parsed.data.saltarFechas) data.saltarFechas = parsed.data.saltarFechas

    if (parsed.data.productos) {
      const p = parsed.data.productos
      if (p.pacaAgua !== undefined) data.cPacaAguaPed = p.pacaAgua
      if (p.pacaHielo !== undefined) data.cPacaHieloPed = p.pacaHielo
      if (p.botellonFab !== undefined) data.cBotellonFabPed = p.botellonFab
      if (p.botellonDom !== undefined) data.cBotellonDomPed = p.botellonDom
      if (p.bolsaAgua !== undefined) data.cBolsaAguaPed = p.bolsaAgua
      if (p.bolsaHielo !== undefined) data.cBolsaHieloPed = p.bolsaHielo
    }

    const recurrente = await prisma.pedido.update({
      where: { id },
      data,
      include: {
        cliente: { select: { id: true, nombre: true } },
      },
    })

    await logAudit({
      entidad: 'Recurrente',
      registroId: recurrente.id,
      accion: 'UPDATE',
      datos: { frecuencia: parsed.data.frecuencia },
      usuarioId: (authResult.user as { id: string }).id,
    })

    return NextResponse.json({ success: true, recurrente })
  } catch (error) {
    console.error('Error updating recurrente:', error)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    const recurrente = await prisma.pedido.update({
      where: { id },
      data: { esRecurrente: false },
    })

    await logAudit({
      entidad: 'Recurrente',
      registroId: recurrente.id,
      accion: 'DELETE',
      datos: {},
      usuarioId: (authResult.user as { id: string }).id,
    })

    return NextResponse.json({ success: true, recurrente })
  } catch (error) {
    console.error('Error deleting recurrente:', error)
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}
