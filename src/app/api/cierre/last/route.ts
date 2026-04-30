import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { z } from 'zod'

const CierreLastSchema = z.object({
  includeDetails: z.coerce.boolean().optional(),
})

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const url = new URL(request.url)
    const validation = CierreLastSchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    if (!validation.success) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }
    const cierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    return NextResponse.json({ cierre })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}