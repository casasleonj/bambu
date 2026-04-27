import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const facturas = await prisma.factura.findMany({
      where: {
        saldo: { gt: 0 },
      },
      include: {
        cliente: true,
        pedido: true,
      },
      orderBy: { saldo: 'desc' },
      take: 100,
    })

    const totalCartera = facturas.reduce((sum, f) => sum + f.saldo, 0)

    return NextResponse.json({ facturas, totalCartera })
  } catch (error) {
    console.error('Error fetching cartera:', error)
    return NextResponse.json({ error: 'Error fetching cartera' }, { status: 500 })
  }
}
