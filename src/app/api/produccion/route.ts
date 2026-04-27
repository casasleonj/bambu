import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'

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
    
    const prodAgua = Math.round((body.conteoAAgua + body.conteoBAgua) / 2)
    const prodHielo = Math.round((body.conteoAHielo + body.conteoBHielo) / 2)
    
    const ultimoCierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    
    const produccion = await prisma.produccion.create({
      data: {
        turno: body.turno,
        trabajadorId: body.trabajadorId,
        stockIniAgua: ultimoCierre?.stockFinAgua || 0,
        stockIniHielo: ultimoCierre?.stockFinHielo || 0,
        conteoAAgua: body.conteoAAgua,
        conteoBAgua: body.conteoBAgua,
        conteoAHielo: body.conteoAHielo,
        conteoBHielo: body.conteoBHielo,
        prodAgua,
        prodHielo,
        obs: body.obs,
      },
      include: { trabajador: true },
    })
    return NextResponse.json({ success: true, produccion })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}