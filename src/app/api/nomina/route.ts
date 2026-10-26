import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { NominaCreateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { calcularDeduccionesDeuda } from '@/lib/nomina-deudas'
import { calcularComisionRepartidor, tarifasRepartidor } from '@/lib/comision-repartidor'
import { comisionPagadaEnPeriodo } from '@/lib/comision-pagada'

export async function GET(request: NextRequest) {
  // FIX CRITICAL (C-SEC-3): Only ADMIN/CONTADOR can read nominas
  // Previously: requireAuth() only — any user could read worker salaries (HR privacy)
  const authResult = await requireRole(['ADMIN', 'CONTADOR'])
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
      // FIX F-N13 (hallazgo 14): usar executeSerializableWithRetry
      // en vez de prisma.$transaction simple.
      //
      // Antes: read con findFirst + create dentro de ReadCommitted.
      // Dos requests AUTO simultáneos para el mismo trabajdor+período
      // podían ambos leer "no existe nómina" y ambos hacer create,
      // resultando en DOS nóminas PENDIENTES para el mismo período.
      // El schema NO tiene @@unique sobre (trabajadorId, fechaInicio,
      // fechaFin), por lo que la unique constraint DB no previene
      // el duplicado. Al pagar (vía F-N9), cada nómina crea un
      // Gasto con el mismo monto → doble egreso de caja.
      //
      // Ahora: Serializable con retry en P2034. PostgreSQL SSI
      // detecta el conflicto cuando la segunda tx intenta crear la
      // nómina en un período que la primera tx acaba de crear. La
      // segunda tx recibe P2034 y re-intenta. En el re-intento, el
      // findFirst encuentra la nómina recién creada y devuelve 409.
        const result = await executeSerializableWithRetry<{
        nomina: { id: string; total: unknown; salario: unknown }
        entregasAgua: number
        entregasHielo: number
        entregasBotellon: number
        comAgua: number
        comHielo: number
        comBotellon: number
        totalComisiones: number
        totalDescuentos: number
        descuentoDeudas: number
        comisionPagadaCaja: number
      }>(async (tx) => {
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

        // Repartidor eventual: cualquier trabajador con moto y tipoPago
        // COMISION/MIXTO cobra comision por entregas de embarque, sin
        // depender de rol=REPARTIDOR. El cálculo vive en `comision-repartidor.ts`
        // (fuente única de la nómina, la vista del día y el cierre, #499).
        if (trabajador.usaMoto && comisionesEnabled) {
          const com = await calcularComisionRepartidor(
            tx,
            trabajadorId,
            ini,
            fin,
            tarifasRepartidor(trabajador, configMap.COM_REPARTIDOR),
          )
          entregasAgua = com.entregasAgua
          entregasHielo = com.entregasHielo
          entregasBotellon = com.entregasBotellon
          comAgua = com.comAgua
          comHielo = com.comHielo
          comBotellon = com.comBotellon
          totalComisiones = com.total
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
        // #499: la comisión que ya salió de la caja día a día (pagos del cierre) no se paga otra vez.
        // Si se pagó de más (p. ej. se anuló un pedido después), la parte de comisión queda en 0 y
        // el excedente se ve en `comisionPagadaCaja` > `totalComisiones`; nunca resta del salario.
        const comisionPagadaCaja = await comisionPagadaEnPeriodo(tx, trabajadorId, ini, fin)
        const comisionPorPagar = Math.max(0, totalComisiones - comisionPagadaCaja)
        let total = comisionPorPagar + salarioFijo

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

        // Aplicar deducciones de deudas (FIFO; ADELANTO_NOMINA primero).
        const deudasPendientes = await tx.deudaTrabajador.findMany({
          where: { trabajadorId, montoPendiente: { gt: 0 } },
        })
        const { descuentoDeudas, deducciones: deduccionesDeuda } = calcularDeduccionesDeuda(
          deudasPendientes.map((d) => ({
            id: d.id,
            tipo: d.tipo,
            montoOriginal: Number(d.montoOriginal),
            montoPendiente: Number(d.montoPendiente),
            plazoNominas: d.plazoNominas,
            porcentajePorNomina: d.porcentajePorNomina,
            fecha: d.fecha,
            createdAt: d.createdAt,
          })),
          total,
        )

        if (deduccionesDeuda.length > 0) {
          for (const d of deduccionesDeuda) {
            await tx.deudaTrabajador.update({
              where: { id: d.deudaId },
              data: { montoPendiente: { decrement: d.monto } },
            })
          }
        }

        total -= descuentoDeudas

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
            totalDescuentos,
            descuentoDeudas,
            comisionPagadaCaja,
            estado: 'PENDIENTE',
          },
        })

        if (deduccionesDeuda.length > 0) {
          await tx.deduccionDeuda.createMany({
            data: deduccionesDeuda.map((d) => ({
              nominaId: nomina.id,
              deudaId: d.deudaId,
              monto: d.monto,
            })),
          })
        }

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
          descuentoDeudas,
          comisionPagadaCaja,
        }
      }, 'nomina.POST:AUTO')

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
          comisionPagadaCaja: result.comisionPagadaCaja,
          descuentos: result.totalDescuentos,
          descuentoDeudas: result.descuentoDeudas,
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
