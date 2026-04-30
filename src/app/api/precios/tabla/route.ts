import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { getPriceTable, type Canal } from '@/lib/pricing'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const canal = (request.nextUrl.searchParams.get('canal') || 'DOMICILIO') as Canal
    const tabla = await getPriceTable(canal)
    return NextResponse.json({ tabla, canal })
  } catch (error) {
    console.error('Error fetching price table:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching price table' }, { status: 500 })
  }
}
