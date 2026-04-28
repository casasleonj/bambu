import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ClienteQuickCreateSchema } from '@/lib/validators'
import { requireAuth } from '@/lib/auth-check'

export async function POST(request: NextRequest) {
  const authError = await requireAuth()
  if (authError instanceof NextResponse) return authError

  try {
    const body = await request.json()
    const parsed = ClienteQuickCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { nombre, telefono, direccion, barrio } = parsed.data

    // Buscar cliente existente por celular
    const existing = await prisma.cliente.findFirst({
      where: { telefono },
    })

    if (existing) {
      return NextResponse.json({ cliente: existing })
    }

    // Crear cliente nuevo con datos básicos
    const cliente = await prisma.cliente.create({
      data: {
        nombre,
        telefono,
        direccion,
        barrio: barrio || '',
      },
    })

    return NextResponse.json({ cliente }, { status: 201 })
  } catch (error) {
    console.error('Error creating quick client:', error)
    return NextResponse.json({ error: 'Error creating client' }, { status: 500 })
  }
}
