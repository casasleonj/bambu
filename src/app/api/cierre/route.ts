import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { CierreCreateSchema } from '@/lib/validators'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const today = new Date().toISOString().split('T')[0]
    const startOfDay = new Date(today + 'T00:00:00.000Z')

    const pedidos = await prisma.pedido.findMany({
      where: { fecha: { gte: startOfDay } },
      include: { pagos: true },
    })

    const produccion = await prisma.produccion.findFirst({
      where: { fecha: { gte: startOfDay } },
    })

    const gastos = await prisma.gasto.aggregate({
      where: { fecha: { gte: startOfDay } },
      _sum: { monto: true },
    })
    
    const totalVentas = pedidos.reduce((acc, p) => acc + Number(p.total), 0)
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
    
    return NextResponse.json({
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
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
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
    
    return NextResponse.json({ success: true, cierre })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
