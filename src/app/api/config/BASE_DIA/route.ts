import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const config = await prisma.config.findUnique({
      where: { clave: 'BASE_DIA' },
    })
    return NextResponse.json({ config })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}