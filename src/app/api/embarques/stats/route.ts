import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  calcularKpiGeneral,
  calcularStatsPorTrabajador,
  calcularStatsPorRuta,
  calcularTendenciaDiaria,
  type EmbarqueStatsInput,
} from '@/lib/embarque-stats'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const session = authResult as { user?: { id?: string; role?: string } }

  try {
    const desde = request.nextUrl.searchParams.get('desde')
    const hasta = request.nextUrl.searchParams.get('hasta')
    const trabajadorId = request.nextUrl.searchParams.get('trabajadorId')
    const rutaId = request.nextUrl.searchParams.get('rutaId')

    const where: Record<string, unknown> = {}

    if (session.user?.role === 'REPARTIDOR') {
      const trabajador = await prisma.trabajador.findFirst({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (trabajador) {
        where.trabajadorId = trabajador.id
      } else {
        return apiSuccess({
          kpiGeneral: null,
          porTrabajador: [],
          porRuta: [],
          tendenciaDiaria: [],
          embarquesDetalle: [],
        })
      }
    }

    if (trabajadorId) {
      where.trabajadorId = trabajadorId
    }

    if (rutaId) {
      where.rutaId = rutaId
    }

    if (desde && hasta) {
      const startDate = new Date(desde)
      const endDate = new Date(hasta)
      endDate.setDate(endDate.getDate() + 1)
      where.fecha = { gte: startDate, lt: endDate }
    }

    const embarquesRaw = await prisma.embarque.findMany({
      where,
      include: {
        trabajador: { select: { id: true, nombre: true } },
        ruta: { select: { id: true, nombre: true } },
        pedidos: { select: { id: true, estadoEntrega: true, origen: true } },
        productos: true,
      },
      orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
    })

    const input: EmbarqueStatsInput[] = embarquesRaw.map((e) => ({
      id: e.id,
      numero: e.numero,
      numeroDia: e.numeroDia,
      fecha: e.fecha.toISOString(),
      horaSalida: e.horaSalida?.toISOString() ?? null,
      horaLlegada: e.horaLlegada?.toISOString() ?? null,
      estado: e.estado,
      trabajadorId: e.trabajador.id,
      trabajadorNombre: e.trabajador.nombre,
      rutaId: e.ruta?.id ?? null,
      rutaNombre: e.ruta?.nombre ?? null,
      pedidos: e.pedidos,
      productos: e.productos,
    }))

    const kpiGeneral = calcularKpiGeneral(input)
    const porTrabajador = calcularStatsPorTrabajador(input)
    const porRuta = calcularStatsPorRuta(input)
    const tendenciaDiaria = calcularTendenciaDiaria(input)

    // Detalle de embarques individuales (todos, no solo cerrados)
    const embarquesDetalle = input.map((e) => {
      const duracionMin =
        e.horaSalida && e.horaLlegada
          ? Math.round(
              (new Date(e.horaLlegada).getTime() -
                new Date(e.horaSalida).getTime()) /
                60000,
            )
          : null
      const totalPedidos = e.pedidos.length
      const entregados = e.pedidos.filter(
        (p) => p.estadoEntrega === 'ENTREGADO',
      ).length

      return {
        id: e.id,
        numero: e.numero,
        numeroDia: e.numeroDia,
        fecha: e.fecha,
        trabajadorNombre: e.trabajadorNombre,
        rutaNombre: e.rutaNombre,
        estado: e.estado,
        duracionMin,
        totalPedidos,
        entregados,
      }
    })

    return apiSuccess({
      kpiGeneral,
      porTrabajador,
      porRuta,
      tendenciaDiaria,
      embarquesDetalle,
    })
  } catch {
    return apiError('Error calculando estadísticas de embarques')
  }
}
