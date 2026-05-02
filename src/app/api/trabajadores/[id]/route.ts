import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { TrabajadorUpdateSchema } from '@/lib/validators'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = TrabajadorUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }
    const trabajador = await prisma.trabajador.update({
      where: { id },
      data: parsed.data,
    })
    return NextResponse.json({ success: true, trabajador })
  } catch (error) {
    return NextResponse.json({ error: 'Error updating' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    await prisma.trabajador.update({
      where: { id },
      data: { activo: false },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error deleting' }, { status: 500 })
  }
}
