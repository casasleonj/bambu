import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

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

    const totalCartera = facturas.reduce((sum, f) => sum + Number(f.saldo), 0)

    return NextResponse.json({ facturas, totalCartera })
  } catch (error) {
    console.error('Error fetching cartera:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching cartera' }, { status: 500 })
  }
}
