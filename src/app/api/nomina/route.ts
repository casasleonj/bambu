import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { NominaCreateSchema } from '@/lib/validators'

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

    return NextResponse.json({ nominas })
  } catch (error) {
    console.error('Error fetching nominas:', error)
    return NextResponse.json({ error: 'Error fetching nominas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = NominaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { trabajadorId, fechaInicio, fechaFin, tipoCalculo } = parsed.data

    // Obtener configuraciones de comisiones
    const configs = await prisma.config.findMany()
    const configMap = Object.fromEntries(configs.map(c => [c.clave, parseFloat(c.valor)]))

    // Obtener trabajador
    const trabajador = await prisma.trabajador.findUnique({
      where: { id: trabajadorId },
    })

    if (!trabajador) {
      return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 404 })
    }

    const ini = new Date(fechaInicio)
    const fin = new Date(fechaFin)

    if (tipoCalculo === 'AUTO') {
      // Calcular automáticamente desde embarques
      const embarques = await prisma.embarque.findMany({
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

      // Contar entregas por producto
      let entregasAgua = 0
      let entregasHielo = 0

      for (const emp of embarques) {
        for (const ped of emp.pedidos) {
          entregasAgua += ped.cAguaEnt
          entregasHielo += ped.cHieloEnt
        }
      }

      const comAgua = entregasAgua * (trabajador.comPacaAgua || configMap.COM_REPARTIDOR || 200)
      const comHielo = entregasHielo * (trabajador.comPacaHielo || configMap.COM_REPARTIDOR || 200)
      const totalComisiones = comAgua + comHielo
      const total = totalComisiones + (trabajador.salarioFijo || 0)

      // Crear nómina
      const lastNomina = await prisma.nomina.findFirst({
        orderBy: { fechaFin: 'desc' },
      })
      const nextNum = (lastNomina?.id.slice(-4) || '0000')

      const nomina = await prisma.nomina.create({
        data: {
          trabajadorId,
          fechaInicio: ini,
          fechaFin: fin,
          comEntregasAgua: comAgua,
          comEntregasHielo: comHielo,
          totalComisiones,
          salario: trabajador.salarioFijo || 0,
          total,
          estado: 'PENDIENTE',
        },
      })

      return NextResponse.json({
        nomina,
        detalles: {
          entregasAgua,
          entregasHielo,
          comAgua,
          comHielo,
          comisionTotal: totalComisiones,
          salariFijo: trabajador.salarioFijo || 0,
        },
      })
    }

    // Crear nómina manual
    const nomina = await prisma.nomina.create({
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

    return NextResponse.json({ success: true, nomina })
  } catch (error) {
    console.error('Error creating nomina:', error)
    return NextResponse.json({ error: 'Error creating nomina' }, { status: 500 })
  }
}