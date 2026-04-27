import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { z } from 'zod'

const CierreDiaSchema = z.object({
  fecha: z.string().datetime().optional(),
  numPedidos: z.coerce.number().int().min(0).optional(),
  totalVentas: z.coerce.number().min(0).optional(),
  aguaVendida: z.coerce.number().int().min(0).optional(),
  hieloVendido: z.coerce.number().int().min(0).optional(),
  botellonVendido: z.coerce.number().int().min(0).optional(),
  bolsaAguaVendida: z.coerce.number().int().min(0).optional(),
  bolsaHieloVendida: z.coerce.number().int().min(0).optional(),
  cobrado: z.coerce.number().min(0).optional(),
  fiado: z.coerce.number().min(0).optional(),
  efectivo: z.coerce.number().min(0).optional(),
  nequi: z.coerce.number().min(0).optional(),
  daviplata: z.coerce.number().min(0).optional(),
  transferencia: z.coerce.number().min(0).optional(),
  baseDia: z.coerce.number().min(0).optional(),
  comisiones: z.coerce.number().min(0).optional(),
  salarios: z.coerce.number().min(0).optional(),
  gastos: z.coerce.number().min(0).optional(),
  stockIniAgua: z.coerce.number().int().min(0).optional(),
  prodAgua: z.coerce.number().int().min(0).optional(),
  stockFinAgua: z.coerce.number().int().min(0).optional(),
  stockIniHielo: z.coerce.number().int().min(0).optional(),
  prodHielo: z.coerce.number().int().min(0).optional(),
  stockFinHielo: z.coerce.number().int().min(0).optional(),
  netoCaja: z.coerce.number().min(0).optional(),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha')

    const where = fecha ? { fecha: new Date(fecha) } : {}
    const cierres = await prisma.cierreDia.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: 30,
    })

    return NextResponse.json(cierres)
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = CierreDiaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { fecha, ...rest } = parsed.data
    const cierre = await prisma.cierreDia.create({
      data: {
        fecha: fecha ? new Date(fecha) : new Date(),
        ...rest,
      },
    })

    return NextResponse.json(cierre, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
