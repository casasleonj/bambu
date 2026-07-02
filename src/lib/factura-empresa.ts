import { prisma } from '@/lib/prisma'

export interface FacturaEmpresaSnapshot {
  empresaNombre: string
  empresaNit: string
  empresaDireccion: string
  empresaTelefono: string
  empresaEmail: string
}

/**
 * Lee la configuración de empresa desde Config y la devuelve como snapshot
 * para guardar en Factura. El snapshot es inmutable: refleja los datos de la
 * empresa al momento de emisión, no los valores actuales.
 */
export async function getFacturaEmpresaSnapshot(): Promise<FacturaEmpresaSnapshot> {
  const configs = await prisma.config.findMany({
    where: {
      clave: { in: ['empresa_nombre', 'empresa_nit', 'empresa_direccion', 'empresa_telefono', 'empresa_email'] },
    },
  })
  const map: Record<string, string> = {}
  configs.forEach(c => { map[c.clave] = c.valor })
  return {
    empresaNombre: map.empresa_nombre || 'Agua Bambú SAS',
    empresaNit: map.empresa_nit || '900.123.456-7',
    empresaDireccion: map.empresa_direccion || '',
    empresaTelefono: map.empresa_telefono || '',
    empresaEmail: map.empresa_email || '',
  }
}
