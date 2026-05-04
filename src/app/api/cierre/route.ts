import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { CierreCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { EstadoPedido, EstadoEmbarque } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const fechaParam = request.nextUrl.searchParams.get('fecha')
    const fechaStr = fechaParam || new Date().toISOString().split('T')[0]
    const startOfDay = new Date(fechaStr + 'T00:00:00.000Z')
    const endOfDay = new Date(fechaStr + 'T23:59:59.999Z')

    // Check for open embarques
    const embarquesAbiertos = await prisma.embarque.findMany({
      where: {
        fecha: { gte: startOfDay, lt: endOfDay },
        estado: EstadoEmbarque.ABIERTO,
      },
      select: { id: true, numero: true, trabajador: { select: { nombre: true } } },
    })

    const pedidos = await prisma.pedido.findMany({
      where: {
        fecha: { gte: startOfDay, lt: endOfDay },
        estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ANULADO] },
      },
      include: { pagos: true },
    })

    const produccion = await prisma.produccion.findFirst({
      where: { fecha: { gte: startOfDay, lt: endOfDay } },
    })

    const gastos = await prisma.gasto.aggregate({
      where: { fecha: { gte: startOfDay, lt: endOfDay } },
      _sum: { monto: true },
    })

    const notasCredito = await prisma.notaCredito.findMany({
      where: { fecha: { gte: startOfDay, lt: endOfDay } },
    })
    const totalNC = notasCredito.reduce((sum, nc) => sum + Number(nc.monto), 0)

    const totalVentas = pedidos.reduce((acc, p) => acc + Number(p.total), 0) - totalNC
    const cobrado = pedidos.reduce((acc, p) => acc + Number(p.totalPagado), 0)
    const fiado = pedidos.reduce((acc, p) => acc + Number(p.saldo), 0)

    const efectivo = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === 'EFECTIVO').reduce((acc, p) => acc + Number(p.monto), 0)
    const transferencia = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === 'TRANSFERENCIA').reduce((acc, p) => acc + Number(p.monto), 0)
    const nequi = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === 'NEQUI').reduce((acc, p) => acc + Number(p.monto), 0)
    const daviplata = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === 'DAVIPLATA').reduce((acc, p) => acc + Number(p.monto), 0)
    const bono = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === 'BONO').reduce((acc, p) => acc + Number(p.monto), 0)

    const aguaVendida = pedidos.reduce((acc, p) => acc + p.cPacaAguaEnt, 0)
    const hieloVendido = pedidos.reduce((acc, p) => acc + p.cPacaHieloEnt, 0)
    const botellonVendido = pedidos.reduce((acc, p) => acc + p.cBotellonFabEnt + p.cBotellonDomEnt, 0)
    const bolsaAguaVendida = pedidos.reduce((acc, p) => acc + p.cBolsaAguaEnt, 0)
    const bolsaHieloVendida = pedidos.reduce((acc, p) => acc + p.cBolsaHieloEnt, 0)

    const status = embarquesAbiertos.length > 0 ? 'INCOMPLETO' : 'COMPLETO'

    return apiSuccess({
      status,
      embarquesPendientes: embarquesAbiertos.map(e => ({ id: e.id, numero: e.numero, repartidor: e.trabajador?.nombre })),
      cierre: {
        numPedidos: pedidos.length,
        totalVentas,
        cobrado,
        fiado,
        efectivo,
        transferencia,
        nequi,
        daviplata,
        bono,
        aguaVendida,
        hieloVendido,
        botellonVendido,
        bolsaAguaVendida,
        bolsaHieloVendida,
        totalGastos: Number(gastos._sum.monto) || 0,
        totalNotasCredito: totalNC,
        produccion,
      },
    })
  } catch (error) {
    return apiError('Error', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  try {
    const today = new Date().toISOString().split('T')[0]
    const startOfDay = new Date(today + 'T00:00:00.000Z')

    // Block if there are open embarques
    const embarquesAbiertos = await prisma.embarque.count({
      where: {
        fecha: { gte: startOfDay },
        estado: EstadoEmbarque.ABIERTO,
      },
    })

    if (embarquesAbiertos > 0) {
      return apiError(
        `No se puede cerrar el día: ${embarquesAbiertos} embarque(s) pendiente(s) de empalme`,
        400
      )
    }

    const body = await request.json()
    const parsed = CierreCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const cierre = await withAdvisoryLock('CIERRE', async () => {
      // Double-check no cierre exists for today under lock
      const existing = await prisma.cierreDia.findFirst({
        where: {
          fecha: { gte: startOfDay },
        },
      })
      if (existing) {
        throw new Error('CIERRE_YA_EXISTE')
      }

      return prisma.cierreDia.create({
        data: {
          fecha: new Date(),
          numPedidos: parsed.data.numPedidos,
          totalVentas: parsed.data.totalVentas,
          cobrado: parsed.data.cobrado,
          fiado: parsed.data.fiado,
          efectivo: parsed.data.efectivo,
          transferencia: parsed.data.transferencia,
          nequi: parsed.data.nequi,
          daviplata: parsed.data.daviplata,
          bono: parsed.data.bono,
          baseDia: parsed.data.baseDia,
          comisiones: parsed.data.comisiones,
          salarios: parsed.data.salarios,
          gastos: parsed.data.gastos,
          stockIniAgua: parsed.data.stockIniAgua,
          prodAgua: parsed.data.prodAgua,
          stockFinAgua: parsed.data.stockFinAgua,
          stockIniHielo: parsed.data.stockIniHielo,
          prodHielo: parsed.data.prodHielo,
          stockFinHielo: parsed.data.stockFinHielo,
          netoCaja: parsed.data.netoCaja,
        },
      })
    })

    logAudit({
      entidad: 'CierreDia',
      registroId: cierre.id,
      accion: 'CREATE',
      datos: { fecha: cierre.fecha, totalVentas: cierre.totalVentas },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ cierre }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'CIERRE_YA_EXISTE') {
      return apiError('Ya existe un cierre para hoy', 409)
    }
    return apiError('Error', 500)
  }
}
