import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { resolverPrecio, type Canal, type ProductCode } from '@/lib/pricing'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()

    // Batch mode
    if (body.items && Array.isArray(body.items)) {
      const { items, canal, clienteId } = body
      let clienteOverrides: Record<string, number> | null = null
      if (clienteId) {
        const cliente = await prisma.cliente.findUnique({
          where: { id: clienteId },
          select: { preciosEspeciales: true },
        })
        if (cliente?.preciosEspeciales) {
          try { clienteOverrides = JSON.parse(cliente.preciosEspeciales) } catch {}
        }
      }
      const precios: Record<string, { precio: number; origen: string }> = {}
      for (const item of items) {
        const result = await resolverPrecio(item.codigo, item.cantidad || 1, canal, clienteOverrides)
        precios[item.codigo] = result
      }
      return NextResponse.json({ precios })
    }

    // Single mode (keep existing logic below)
    const { codigo, cantidad, canal, clienteId } = body as {
      codigo: ProductCode
      cantidad: number
      canal: Canal
      clienteId?: string
    }

    // Get client overrides
    let clienteOverrides: Record<string, number> | null = null
    if (clienteId) {
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { preciosEspeciales: true },
      })
      if (cliente?.preciosEspeciales) {
        try { clienteOverrides = JSON.parse(cliente.preciosEspeciales) } catch {}
      }
    }

    const result = await resolverPrecio(codigo, cantidad, canal, clienteOverrides)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error resolving price:', error)
    return NextResponse.json({ error: 'Error resolving price' }, { status: 500 })
  }
}
