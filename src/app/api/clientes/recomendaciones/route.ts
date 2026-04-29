import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const clientes = await prisma.cliente.findMany({
      where: { activo: true },
      include: {
        pedidos: {
          orderBy: { fecha: 'desc' },
          take: 5,
          select: {
            fecha: true,
            cPacaAguaPed: true,
            cPacaHieloPed: true,
            cBotellonFabPed: true,
            cBotellonDomPed: true,
            cBolsaAguaPed: true,
            cBolsaHieloPed: true,
            total: true,
          },
        },
      },
    })

    const hoy = new Date()
    const recomendaciones = []

    for (const cliente of clientes) {
      const ultimoPedido = cliente.pedidos[0]
      if (!ultimoPedido) {
        // Cliente sin pedidos: siempre recomendar
        recomendaciones.push({
          cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono },
          razon: 'Sin pedidos previos',
          urgencia: 'media',
          ultimoPedido: null,
          frecuenciaPromedioDias: null,
          sugerencia: 'Llamar para ofrecer productos',
        })
        continue
      }

      const ultimaFecha = new Date(ultimoPedido.fecha)
      const diasDesdeUltimo = Math.floor((hoy.getTime() - ultimaFecha.getTime()) / (1000 * 60 * 60 * 24))

      // Calcular frecuencia promedio entre pedidos
      let frecuenciaPromedio: number | null = null
      if (cliente.pedidos.length >= 2) {
        const diasEntrePedidos: number[] = []
        for (let i = 0; i < cliente.pedidos.length - 1; i++) {
          const f1 = new Date(cliente.pedidos[i].fecha).getTime()
          const f2 = new Date(cliente.pedidos[i + 1].fecha).getTime()
          diasEntrePedidos.push(Math.floor((f1 - f2) / (1000 * 60 * 60 * 24)))
        }
        frecuenciaPromedio = Math.round(diasEntrePedidos.reduce((a, b) => a + b, 0) / diasEntrePedidos.length)
      }

      // Usar frecuencia configurada o promedio calculado
      const frecuenciaEsperada = cliente.cadaNDias || frecuenciaPromedio || 7
      const diasRetraso = diasDesdeUltimo - frecuenciaEsperada

      if (diasRetraso >= 1) {
        // Calcular productos más comprados
        const productosTotales: Record<string, number> = {}
        for (const p of cliente.pedidos) {
          if (p.cPacaAguaPed > 0) productosTotales['Paca Agua'] = (productosTotales['Paca Agua'] || 0) + p.cPacaAguaPed
          if (p.cPacaHieloPed > 0) productosTotales['Paca Hielo'] = (productosTotales['Paca Hielo'] || 0) + p.cPacaHieloPed
          if (p.cBotellonFabPed > 0) productosTotales['Botellon Fab'] = (productosTotales['Botellon Fab'] || 0) + p.cBotellonFabPed
          if (p.cBotellonDomPed > 0) productosTotales['Botellon Dom'] = (productosTotales['Botellon Dom'] || 0) + p.cBotellonDomPed
          if (p.cBolsaAguaPed > 0) productosTotales['Bolsa Agua'] = (productosTotales['Bolsa Agua'] || 0) + p.cBolsaAguaPed
          if (p.cBolsaHieloPed > 0) productosTotales['Bolsa Hielo'] = (productosTotales['Bolsa Hielo'] || 0) + p.cBolsaHieloPed
        }
        const productoTop = Object.entries(productosTotales).sort((a, b) => b[1] - a[1])[0]

        recomendaciones.push({
          cliente: { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono },
          razon: `Hace ${diasDesdeUltimo} días sin pedido (cada ${frecuenciaEsperada} días)`,
          urgencia: diasRetraso > 3 ? 'alta' : 'media',
          ultimoPedido: ultimaFecha.toISOString(),
          frecuenciaPromedioDias: frecuenciaPromedio,
          productoSugerido: productoTop?.[0],
          diasRetraso,
          sugerencia: `Llamar - suele pedir ${productoTop?.[0] || 'productos'} cada ${frecuenciaEsperada} días`,
        })
      }
    }

    // Sort by urgency then by diasRetraso
    recomendaciones.sort((a, b) => {
      if (a.urgencia === 'alta' && b.urgencia !== 'alta') return -1
      if (a.urgencia !== 'alta' && b.urgencia === 'alta') return 1
      return (b.diasRetraso || 0) - (a.diasRetraso || 0)
    })

    return NextResponse.json({
      success: true,
      recomendaciones: recomendaciones.slice(0, 20),
      total: recomendaciones.length,
    })
  } catch (error) {
    console.error('Error generating recommendations:', error)
    return NextResponse.json(
      { error: 'Error al generar recomendaciones' },
      { status: 500 }
    )
  }
}
