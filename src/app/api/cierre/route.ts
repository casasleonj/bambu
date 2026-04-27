import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { CierreCreateSchema } from '@/lib/validators'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    
    const pedidos = await prisma.pedido.findMany({
      where: { fecha: { gte: hoy } },
      include: { pagos: true },
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
    
    const efectivo = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === 'EFECTIVO').reduce((acc, p) => acc + Number(p.monto), 0)
    const transferencia = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === 'TRANSFERENCIA').reduce((acc, p) => acc + Number(p.monto), 0)
    const nequi = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === 'NEQUI').reduce((acc, p) => acc + Number(p.monto), 0)
    
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
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = CierreCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    
    const cierre = await prisma.cierreDia.create({
      data: {
        fecha: new Date(),
        numPedidos: parsed.data.numPedidos,
        totalVentas: parsed.data.totalVentas,
        cobrado: parsed.data.cobrado,
        fiado: parsed.data.fiado,
        efectivo: parsed.data.efectivo,
        nequi: parsed.data.nequi,
        baseDia: parsed.data.baseDia,
        comisiones: parsed.data.comisiones,
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
    
    return NextResponse.json({ success: true, cierre })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}