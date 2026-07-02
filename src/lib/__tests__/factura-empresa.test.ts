// @tests lib/factura-empresa
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

import { getFacturaEmpresaSnapshot } from '@/lib/factura-empresa'

describe('getFacturaEmpresaSnapshot', () => {
  beforeEach(() => {
    mockFindMany.mockReset()
  })

  it('devuelve los valores de Config cuando existen', async () => {
    mockFindMany.mockResolvedValue([
      { clave: 'empresa_nombre', valor: 'Agua Bambú' },
      { clave: 'empresa_nit', valor: '49008664' },
      { clave: 'empresa_direccion', valor: 'Vereda Centro' },
      { clave: 'empresa_telefono', valor: '300 000 0000' },
      { clave: 'empresa_email', valor: 'contacto@aguabambu.com' },
    ])

    const result = await getFacturaEmpresaSnapshot()

    expect(result).toEqual({
      empresaNombre: 'Agua Bambú',
      empresaNit: '49008664',
      empresaDireccion: 'Vereda Centro',
      empresaTelefono: '300 000 0000',
      empresaEmail: 'contacto@aguabambu.com',
    })
  })

  it('aplica defaults cuando faltan claves en Config', async () => {
    mockFindMany.mockResolvedValue([])

    const result = await getFacturaEmpresaSnapshot()

    expect(result.empresaNombre).toBe('Agua Bambú SAS')
    expect(result.empresaNit).toBe('900.123.456-7')
    expect(result.empresaDireccion).toBe('')
    expect(result.empresaTelefono).toBe('')
    expect(result.empresaEmail).toBe('')
  })

  it('consulta exactamente las 5 claves de empresa', async () => {
    mockFindMany.mockResolvedValue([])

    await getFacturaEmpresaSnapshot()

    expect(mockFindMany).toHaveBeenCalledTimes(1)
    const call = mockFindMany.mock.calls[0][0]
    expect(call.where.clave.in).toEqual([
      'empresa_nombre',
      'empresa_nit',
      'empresa_direccion',
      'empresa_telefono',
      'empresa_email',
    ])
  })
})
