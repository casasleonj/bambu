import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const CarteraSchema = z.object({
  minSaldo: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
  sortBy: z.enum(['saldo', 'fecha', 'cliente']).optional().default('saldo'),
})

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const url = new URL(request.url)
    const validation = CarteraSchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    if (!validation.success) {
      return NextResponse.json({ error: 'Parámetros inválidos', details: validation.error.flatten() }, { status: 400 })
    }

    const { minSaldo, limit, sortBy } = validation.data

    const facturas = await prisma.factura.findMany({
      where: {
        saldo: { gt: minSaldo ?? 0 },
      },
      include: {
        cliente: true,
        pedido: true,
      },
      orderBy: { [sortBy]: 'desc' },
      take: limit,
    })

    const totalCartera = facturas.reduce((sum, f) => sum + Number(f.saldo), 0)

    return NextResponse.json({ facturas, totalCartera })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching cartera:')
    return NextResponse.json({ error: 'Error fetching cartera' }, { status: 500 })
  }
}
