import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { AbonoCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const facturaId = searchParams.get('facturaId')

  try {
    const abonos = await prisma.abono.findMany({
      where: facturaId ? { facturaId } : undefined,
      orderBy: { fecha: 'desc' },
      include: {
        cliente: true,
      },
    })

    return NextResponse.json({ abonos })
  } catch (error) {
    console.error('Error fetching abonos:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching abonos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = AbonoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { facturaId, clienteId, monto, metodoPago } = parsed.data

    const result = await withAdvisoryLock('ABONO', async (tx) => {
      // Verificar que la factura existe
      const factura = await tx.factura.findUnique({
        where: { id: facturaId },
      })

      if (!factura) {
        throw new Error('FACTURA_NOT_FOUND')
      }

      // Calcular siguiente número
      const nextNum = await getNextNumero(tx, { model: 'abono', field: 'numero' })

      // Crear abono
      const abono = await tx.abono.create({
        data: {
          numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
          facturaId,
          clienteId,
          monto,
          metodoPago,
        },
      })

      // Actualizar saldo y monto pagado de la factura atómicamente
      const updatedFactura = await tx.factura.update({
        where: { id: facturaId },
        data: {
          saldo: { decrement: monto },
          montoPagado: { increment: monto },
        },
      })

      if (Number(updatedFactura.saldo) < 0) {
        throw new Error('Abono excede saldo de factura')
      }

      const nuevoEstado = Number(updatedFactura.saldo) === 0 ? 'PAGADA' : 'EMITIDA'
      if (updatedFactura.estado !== nuevoEstado) {
        await tx.factura.update({
          where: { id: facturaId },
          data: { estado: nuevoEstado },
        })
      }

      return { abono }
    })

    return NextResponse.json({ success: true, abono: result.abono }, { status: 201 })
  } catch (error) {
    console.error('Error creating abono:', error instanceof Error ? error.message : 'Unknown')
    if (error instanceof Error && error.message === 'FACTURA_NOT_FOUND') {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'Abono excede saldo de factura') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error creating abono' }, { status: 500 })
  }
}