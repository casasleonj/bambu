import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const cierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    return NextResponse.json({ cierre })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}