import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const trabajadores = await prisma.trabajador.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    })
    return NextResponse.json({ trabajadores })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}