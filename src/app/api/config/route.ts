import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ConfigCreateSchema } from '@/lib/validators'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const clave = searchParams.get('clave')
    const keysParam = searchParams.get('keys')
    
    if (clave) {
      const config = await prisma.config.findUnique({ where: { clave } })
      if (!config) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json({ config })
    }
    
    if (keysParam) {
      const keys = keysParam.split(',')
      const configs = await prisma.config.findMany({
        where: { clave: { in: keys } }
      })
      const result: Record<string, string> = {}
      configs.forEach(c => { result[c.clave] = c.valor })
      return NextResponse.json(result)
    }
    
    const configs = await prisma.config.findMany()
    return NextResponse.json({ configs })
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
    const parsed = ConfigCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }
    const { clave, valor } = parsed.data

    const config = await prisma.config.upsert({
      where: { clave },
      update: { valor },
      create: { clave, valor },
    })

    return NextResponse.json({ success: true, config }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}