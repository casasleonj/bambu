import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { NominaCreateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const pendientes = searchParams.get('pendientes') === 'true'

  try {
    const nominas = await prisma.nomina.findMany({
      where: pendientes ? { estado: 'PENDIENTE' } : undefined,
      orderBy: { fechaFin: 'desc' },
      include: { trabajador: true },
    })
    return apiSuccess({ nominas })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching nominas:')
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
    fin.setUTCHours(23, 59, 59, 999)

    const userId = (authResult.user as { id?: string } | undefined)?.id

    if (tipoCalculo === 'AUTO') {
      const result = await prisma.$transaction(async (tx) => {
        // Verificar duplicados
        const existente = await tx.nomina.findFirst({
          where: {
            trabajadorId,
            estado: { not: 'ANULADA' },
            OR: [
              { fechaInicio: { lte: fin }, fechaFin: { gte: ini } },
            ],
          },
        })
        if (existente) {
          throw new Error('Ya existe una nómina para este trabajador en el período seleccionado')
        }

        const configs = await tx.config.findMany({ where: { clave: { in: ['COM_REPARTIDOR'] } } })
        const configMap = Object.fromEntries(configs.map(c => [c.clave, parseFloat(c.valor)]))

        const trabajador = await tx.trabajador.findUnique({
          where: { id: trabajadorId },
          select: {
            rol: true,
            tipoPago: true,
            comPacaAgua: true,
            comPacaHielo: true,
            comBotellon: true,
            comRepartAgua: true,
            comRepartHielo: true,
            comRepartBotellon: true,
            salarioFijo: true,
            usaMoto: true,
          },
        })
        if (!trabajador) {
          throw new Error('Trabajador no encontrado')
        }

        const isRepartidor = trabajador.rol === 'REPARTIDOR'
        const isSellador = trabajador.rol === 'SELLADOR'
        const comisionesEnabled = trabajador.tipoPago === 'COMISION' || trabajador.tipoPago === 'MIXTO'

        let entregasAgua = 0
        let entregasHielo = 0
        let entregasBotellon = 0
        let comAgua = 0
        let comHielo = 0
        let comBotellon = 0
        let totalComisiones = 0

        if (isRepartidor && comisionesEnabled && trabajador.usaMoto) {
          const embarques = await tx.embarque.findMany({
            where: {
              trabajadorId,
              fecha: { gte: ini, lte: fin },
              estado: 'CERRADO',
            },
            include: {
              pedidos: { where: { estado: 'ENTREGADO' } },
            },
          })

          for (const emp of embarques) {
            for (const ped of emp.pedidos) {
              entregasAgua += ped.cPacaAguaEnt
              entregasHielo += ped.cPacaHieloEnt
              entregasBotellon += (ped.cBotellonFabEnt || 0) + (ped.cBotellonDomEnt || 0)
            }
          }

          comAgua = entregasAgua * Number(trabajador.comRepartAgua || trabajador.comPacaAgua || configMap.COM_REPARTIDOR || 200)
          comHielo = entregasHielo * Number(trabajador.comRepartHielo || trabajador.comPacaHielo || configMap.COM_REPARTIDOR || 200)
          comBotellon = entregasBotellon * Number(trabajador.comRepartBotellon || trabajador.comBotellon || 200)
          totalComisiones = comAgua + comHielo + comBotellon
        }

        if (isSellador && comisionesEnabled) {
          const producciones = await tx.produccion.findMany({
            where: {
              trabajadorId,
              fecha: { gte: ini, lte: fin },
            },
          })
          for (const prod of producciones) {
            totalComisiones += Number(prod.comSellTotal || 0)
          }
        }

        const salarioFijo = Number(trabajador.salarioFijo || 0)
        let total = totalComisiones + salarioFijo

        // Aplicar descuentos por faltante de embarque
        let totalDescuentos = 0
        if (isRepartidor) {
          const descuentos = await tx.descuentoRepartidor.findMany({
            where: {
              trabajadorId,
              fecha: { gte: ini, lte: fin },
              aplicadoEnNomina: false,
            },
          })
          for (const desc of descuentos) {
            totalDescuentos += Number(desc.monto)
          }
          if (totalDescuentos > 0) {
            total -= totalDescuentos
            // Marcar descuentos como aplicados
            for (const desc of descuentos) {
              await tx.descuentoRepartidor.update({
                where: { id: desc.id },
                data: { aplicadoEnNomina: true },
              })
            }
          }
        }

        const nomina = await tx.nomina.create({
          data: {
            trabajadorId,
            createdById: userId,
            fechaInicio: ini,
            fechaFin: fin,
            entregasAgua,
            entregasHielo,
            entregasBotellon,
            comEntregasAgua: comAgua,
            comEntregasHielo: comHielo,
            comEntregasBotellon: comBotellon,
            totalComisiones,
            salario: salarioFijo,
            total,
            estado: 'PENDIENTE',
          },
        })

        return {
          nomina,
          entregasAgua,
          entregasHielo,
          entregasBotellon,
          comAgua,
          comHielo,
          comBotellon,
          totalComisiones,
          totalDescuentos,
        }
      })

      logAudit({
        entidad: 'Nomina',
        registroId: result.nomina.id,
        accion: 'CREATE',
        datos: {
          trabajadorId,
          tipoCalculo,
          total: result.nomina.total,
          descuentos: result.totalDescuentos,
        },
        usuarioId: userId,
      }).catch(() => {})

      return apiSuccess({
        nomina: result.nomina,
        detalles: {
          entregasAgua: result.entregasAgua,
          entregasHielo: result.entregasHielo,
          entregasBotellon: result.entregasBotellon,
          comAgua: result.comAgua,
          comHielo: result.comHielo,
          comBotellon: result.comBotellon,
          comisionTotal: result.totalComisiones,
          descuentos: result.totalDescuentos,
          salarioFijo: result.nomina.salario,
        },
      })
    }

    // Crear nomina manual
    const result = await prisma.$transaction(async (tx) => {
      const nomina = await tx.nomina.create({
        data: {
          trabajadorId,
          createdById: userId,
          fechaInicio: ini,
          fechaFin: fin,
          comEntregasAgua: parsed.data.comEntregasAgua || 0,
          comEntregasHielo: parsed.data.comEntregasHielo || 0,
          comEntregasBotellon: parsed.data.comEntregasBotellon || 0,
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
      usuarioId: userId,
    }).catch(() => {})

    return apiSuccess({ nomina: result }, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: msg }, 'Error creating nomina:')
    if (msg === 'Ya existe una nómina para este trabajador en el período seleccionado') {
      return apiError(msg, 409)
    }
    return apiError('Error creating nomina', 500)
  }
}
