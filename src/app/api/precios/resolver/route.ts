import { formatZodError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { resolverPrecio, type Canal, type ProductCode } from '@/lib/pricing'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const PrecioResolverItemSchema = z.object({
  codigo: z.string().min(1),
  cantidad: z.number().int().min(1).optional(),
})

const PrecioResolverSchema = z.object({
  items: z.array(PrecioResolverItemSchema).optional(),
  canal: z.enum(['PUNTO', 'DOMICILIO']).optional(),
  clienteId: z.string().min(1).optional(),
  codigo: z.string().min(1).optional(),
  cantidad: z.number().int().min(1).optional(),
}).refine(data => data.items || data.codigo, {
  message: 'Debe enviar items o un solo producto (codigo/cantidad/canal)',
})

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const body = await request.json()
    const parsed = PrecioResolverSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }

    const { canal, clienteId } = parsed.data
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

    // Batch mode
    if (parsed.data.items && parsed.data.items.length > 0) {
      const precios: Record<string, { precio: number; origen: string }> = {}
      for (const item of parsed.data.items) {
        const result = await resolverPrecio(item.codigo as ProductCode, item.cantidad || 1, canal as Canal, clienteOverrides)
        precios[item.codigo] = result
      }
      return NextResponse.json({ precios })
    }

    // Single mode
    const result = await resolverPrecio(parsed.data.codigo as ProductCode, parsed.data.cantidad || 1, canal as Canal, clienteOverrides)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error resolving price:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error resolving price' }, { status: 500 })
  }
}
