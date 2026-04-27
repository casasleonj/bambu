import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { ProduccionCreateSchema } from '@/lib/validators'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const produccion = await prisma.produccion.findFirst({
      where: {
        fecha: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
      include: { trabajador: true },
    })
    return NextResponse.json({ produccion })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = ProduccionCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    
    const prodAgua = Math.round((parsed.data.conteoAAgua + parsed.data.conteoBAgua) / 2)
    const prodHielo = Math.round((parsed.data.conteoAHielo + parsed.data.conteoBHielo) / 2)
    
    const ultimoCierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    
    const produccion = await prisma.produccion.create({
      data: {
        turno: parsed.data.turno,
        trabajadorId: parsed.data.trabajadorId,
        stockIniAgua: ultimoCierre?.stockFinAgua || 0,
        stockIniHielo: ultimoCierre?.stockFinHielo || 0,
        conteoAAgua: parsed.data.conteoAAgua,
        conteoBAgua: parsed.data.conteoBAgua,
        conteoAHielo: parsed.data.conteoAHielo,
        conteoBHielo: parsed.data.conteoBHielo,
        prodAgua,
        prodHielo,
        obs: parsed.data.obs,
      },
      include: { trabajador: true },
    })
    return NextResponse.json({ success: true, produccion })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}