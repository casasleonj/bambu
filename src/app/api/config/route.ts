import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const keysParam = searchParams.get('keys')
    
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
  try {
    const body = await request.json()
    const { clave, valor } = body

    const config = await prisma.config.upsert({
      where: { clave },
      update: { valor },
      create: { clave, valor },
    })

    return NextResponse.json({ success: true, config })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}