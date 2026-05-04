import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { NominaCreateSchema } from '@/lib/validators'
import { getNextNumero } from '@/lib/sequence'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pendientes = searchParams.get('pendientes') === 'true'

  try {
    const nominas = await prisma.nomina.findMany({
      where: pendientes ? { estado: 'PENDIENTE' } : undefined,
      orderBy: { fechaFin: 'desc' },
      include: {
        trabajador: true,
      },
    })

    return apiSuccess({ nominas })
  } catch (error) {
    console.error('Error fetching nominas:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error fetching nominas', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = NominaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { trabajadorId, fechaInicio, fechaFin, tipoCalculo } = parsed.data

    const ini = new Date(fechaInicio)
    const fin = new Date(fechaFin)

    if (tipoCalculo === 'AUTO') {
      const result = await prisma.$transaction(async (tx) => {
        const configs = await tx.config.findMany()
        const configMap = Object.fromEntries(configs.map(c => [c.clave, parseFloat(c.valor)]))

        const trabajador = await tx.trabajador.findUnique({
          where: { id: trabajadorId },
        })
        if (!trabajador) {
          throw new Error('Trabajador no encontrado')
        }

        const embarques = await tx.embarque.findMany({
          where: {
            trabajadorId,
            fecha: { gte: ini, lte: fin },
            estado: 'CERRADO',
          },
          include: {
            pedidos: {
              where: { estado: 'ENTREGADO' },
            },
          },
        })

        let entregasAgua = 0
        let entregasHielo = 0

        for (const emp of embarques) {
          for (const ped of emp.pedidos) {
            entregasAgua += ped.cPacaAguaEnt
            entregasHielo += ped.cPacaHieloEnt
          }
        }

        const comAgua = entregasAgua * Number(trabajador.comPacaAgua || configMap.COM_REPARTIDOR || 200)
        const comHielo = entregasHielo * Number(trabajador.comPacaHielo || configMap.COM_REPARTIDOR || 200)
        const totalComisiones = comAgua + comHielo
        const total = totalComisiones + Number(trabajador.salarioFijo || 0)

        const nomina = await tx.nomina.create({
          data: {
            trabajadorId,
            fechaInicio: ini,
            fechaFin: fin,
            comEntregasAgua: comAgua,
            comEntregasHielo: comHielo,
            totalComisiones,
            salario: Number(trabajador.salarioFijo || 0),
            total,
            estado: 'PENDIENTE',
          },
        })

        return { nomina, entregasAgua, entregasHielo, comAgua, comHielo, totalComisiones }
      })

      logAudit({
        entidad: 'Nomina',
        registroId: result.nomina.id,
        accion: 'CREATE',
        datos: { trabajadorId, tipoCalculo, total: result.nomina.total },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      }).catch(() => {})

      return apiSuccess({
        nomina: result.nomina,
        detalles: {
          entregasAgua: result.entregasAgua,
          entregasHielo: result.entregasHielo,
          comAgua: result.comAgua,
          comHielo: result.comHielo,
          comisionTotal: result.totalComisiones,
          salariFijo: result.nomina.salario,
        },
      })
    }

    // Crear nomina manual
    const result = await prisma.$transaction(async (tx) => {
      const nomina = await tx.nomina.create({
        data: {
          trabajadorId,
          fechaInicio: ini,
          fechaFin: fin,
          comEntregasAgua: parsed.data.comEntregasAgua || 0,
          comEntregasHielo: parsed.data.comEntregasHielo || 0,
          totalComisiones: parsed.data.totalComisiones || 0,
          salario: parsed.data.salario || 0,
          total: parsed.data.total || 0,
          estado: 'PENDIENTE',
        },
      })
      return nomina
    })

    logAudit({
      entidad: 'Nomina',
      registroId: result.id,
      accion: 'CREATE',
      datos: { trabajadorId, tipoCalculo: 'MANUAL', total: result.total },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ nomina: result }, 201)
  } catch (error) {
    console.error('Error creating nomina:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error creating nomina', 500)
  }
}
