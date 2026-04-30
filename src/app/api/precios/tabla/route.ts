import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { getPriceTable, type Canal } from '@/lib/pricing'
import { CanalSchema } from '@/lib/zod-schemas'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const canalParam = request.nextUrl.searchParams.get('canal') || 'DOMICILIO'
    const canalValidation = CanalSchema.safeParse(canalParam)
    if (!canalValidation.success) {
      return NextResponse.json({ error: 'Canal inválido. Debe ser: DOMICILIO, PUNTO_VENTA, MAYORISTA o INTERNO' }, { status: 400 })
    }
    const tabla = await getPriceTable(canalValidation.data)
    return NextResponse.json({ tabla, canal: canalValidation.data })
  } catch (error) {
    console.error('Error fetching price table:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching price table' }, { status: 500 })
  }
}
