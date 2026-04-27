import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const cierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    return NextResponse.json({ cierre })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}