import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    
    const pedidos = await prisma.pedido.findMany({
      where: { fecha: { gte: hoy } },
    })
    
    const produccion = await prisma.produccion.findFirst({
      where: { fecha: { gte: hoy } },
    })
    
    const gastos = await prisma.gasto.aggregate({
      where: { fecha: { gte: hoy } },
      _sum: { monto: true },
    })
    
    const totalVentas = pedidos.reduce((acc, p) => acc + p.total, 0)
    const cobrado = pedidos.reduce((acc, p) => acc + p.totalPagado, 0)
    const fiado = pedidos.reduce((acc, p) => acc + p.saldo, 0)
    
    const efectivo = pedidos.filter(p => p.metodoPago === 'EFECTIVO').reduce((acc, p) => acc + p.montoPagado, 0)
    const transferencia = pedidos.filter(p => p.metodoPago === 'TRANSFERENCIA').reduce((acc, p) => acc + p.montoPagado, 0)
    const nequi = pedidos.filter(p => p.metodoPago === 'NEQUI').reduce((acc, p) => acc + p.montoPagado, 0)
    
    const aguaVendida = pedidos.reduce((acc, p) => acc + p.cAguaEnt, 0)
    const hieloVendido = pedidos.reduce((acc, p) => acc + p.cHieloEnt, 0)
    
    return NextResponse.json({
      cierre: {
        numPedidos: pedidos.length,
        totalVentas,
        cobrado,
        fiado,
        efectivo,
        transferencia,
        nequi,
        aguaVendida,
        hieloVendido,
        totalGastos: gastos._sum.monto || 0,
        produccion,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const cierre = await prisma.cierreDia.create({
      data: {
        fecha: new Date(),
        numPedidos: body.numPedidos,
        totalVentas: body.totalVentas,
        cobrado: body.cobrado,
        fiado: body.fiado,
        efectivo: body.efectivo,
        nequi: body.nequi,
        baseDia: body.baseDia,
        comisiones: body.comisiones,
        gastos: body.gastos,
        stockIniAgua: body.stockIniAgua,
        prodAgua: body.prodAgua,
        stockFinAgua: body.stockFinAgua,
        stockIniHielo: body.stockIniHielo,
        prodHielo: body.prodHielo,
        stockFinHielo: body.stockFinHielo,
        netoCaja: body.netoCaja,
      },
    })
    
    return NextResponse.json({ success: true, cierre })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}